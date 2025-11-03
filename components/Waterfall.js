const { useRef, useEffect, useCallback, useState } = React;

const SPECTRUM_HEIGHT = 180;

const COLOR_MAPS = {
    "SDR Blue": [[0,0,0], [0,0,255], [0,255,255], [255,255,0], [255,0,0], [255,255,255]],
    "Inferno": [[0,0,4],[59,18,107],[140,43,133],[212,89,84],[249,168,20],[252,255,164]],
    "Viridis": [[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]],
    "Grayscale": [[0,0,0],[255,255,255]],
};

const formatFrequency = (freq) => {
    if (Math.abs(freq) >= 1e9) return `${(freq / 1e9).toFixed(2)} GHz`;
    if (Math.abs(freq) >= 1e6) return `${(freq / 1e6).toFixed(2)} MHz`;
    if (Math.abs(freq) >= 1e3) return `${(freq / 1e3).toFixed(1)} kHz`;
    return `${freq.toFixed(0)} Hz`;
};

// WebGL utilities
const createShader = (gl, type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
};

const createProgram = (gl, vsSource, fsSource) => {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }
    return shaderProgram;
};


const Waterfall = ({ 
    fftData, width, height, tunedFreq = 0, sampleRate = 0, onTune,
    settings = { gain: 40, range: 60, colorScheme: 'SDR Blue', averaging: 4, peakHold: true }
}) => {
    const glCanvasRef = useRef(null);
    const overlayCanvasRef = useRef(null);
    const [mouseInfo, setMouseInfo] = useState(null);

    const glRef = useRef(null);
    const animFrameRef = useRef();
    
    // WebGL state refs
    const programRef = useRef(null);
    const textureRef = useRef(null);
    const colormapRef = useRef(null);
    const framebufferRef = useRef(null);
    const uniformsRef = useRef({});

    // Spectrum analysis refs
    const avgFftRef = useRef(null);
    const peakFftRef = useRef(null);
    const avgCountRef = useRef(0);

    const waterfallHeight = height - SPECTRUM_HEIGHT;

    // == WebGL Initialization ==
    useEffect(() => {
        const canvas = glCanvasRef.current;
        const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, powerPreference: "low-power" });
        if (!gl) { console.error("WebGL not supported"); return; }
        glRef.current = gl;

        const vsSource = `
            attribute vec4 aVertexPosition;
            varying vec2 vTexCoord;
            void main() {
                gl_Position = aVertexPosition;
                vTexCoord = aVertexPosition.xy * 0.5 + 0.5;
            }
        `;
        const fsSource = `
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uSampler;
            uniform sampler2D uColormap;
            uniform float uGain;
            uniform float uRange;

            void main() {
                float value = texture2D(uSampler, vTexCoord).r;
                float scaledValue = (value * 255.0 + uGain - (120.0 - uRange)) / uRange;
                gl_FragColor = texture2D(uColormap, vec2(clamp(scaledValue, 0.0, 1.0), 0.5));
            }
        `;
        
        programRef.current = createProgram(gl, vsSource, fsSource);
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        
        const vpos = gl.getAttribLocation(programRef.current, 'aVertexPosition');
        gl.vertexAttribPointer(vpos, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vpos);
        
        uniformsRef.current = {
            uSampler: gl.getUniformLocation(programRef.current, 'uSampler'),
            uColormap: gl.getUniformLocation(programRef.current, 'uColormap'),
            uGain: gl.getUniformLocation(programRef.current, 'uGain'),
            uRange: gl.getUniformLocation(programRef.current, 'uRange'),
        };

        // Create texture for waterfall
        textureRef.current = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, waterfallHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Create framebuffer for texture rendering
        framebufferRef.current = gl.createFramebuffer();

    }, [width, waterfallHeight]);

    // == Colormap Update ==
    useEffect(() => {
        const gl = glRef.current;
        if (!gl || !settings.colorScheme) return;
        
        const colors = COLOR_MAPS[settings.colorScheme];
        const colorData = new Uint8Array(colors.length * 4);
        for (let i = 0; i < colors.length; i++) {
            colorData[i * 4] = colors[i][0];
            colorData[i * 4 + 1] = colors[i][1];
            colorData[i * 4 + 2] = colors[i][2];
            colorData[i * 4 + 3] = 255;
        }

        if (colormapRef.current) gl.deleteTexture(colormapRef.current);
        colormapRef.current = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, colormapRef.current);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, colors.length, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, colorData);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }, [settings.colorScheme]);

    // == Drawing Loop ==
    const draw = useCallback(() => {
        const gl = glRef.current;
        const overlayCtx = overlayCanvasRef.current.getContext('2d');
        if (!gl || !overlayCtx) return;

        // Process new FFT data
        if (fftData && fftData.length > 0) {
            const fftSize = fftData.length;
            if (!avgFftRef.current || avgFftRef.current.length !== fftSize) {
                avgFftRef.current = new Float32Array(fftSize);
                peakFftRef.current = new Float32Array(fftSize).fill(-200);
                avgCountRef.current = 0;
            }

            // Update peak hold and averaging buffers
            const newAvg = new Float32Array(fftSize);
            for (let i = 0; i < fftSize; i++) {
                if (isFinite(fftData[i])) {
                    if (settings.peakHold) peakFftRef.current[i] = Math.max(peakFftRef.current[i], fftData[i]);
                    newAvg[i] = fftData[i];
                } else {
                    newAvg[i] = -150; // default for non-finite values
                }
            }
            if (settings.averaging > 1) {
                const alpha = 2 / (settings.averaging + 1);
                for(let i=0; i < fftSize; i++) {
                     avgFftRef.current[i] = alpha * newAvg[i] + (1 - alpha) * avgFftRef.current[i];
                }
            } else {
                avgFftRef.current = newAvg;
            }
            
            // Shift waterfall down and draw new line at the top
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferRef.current);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureRef.current, 0);
            gl.viewport(0, 0, width, waterfallHeight);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
                gl.blitFramebuffer(0, 1, width, waterfallHeight, 0, 0, width, waterfallHeight - 1, gl.COLOR_BUFFER_BIT, gl.NEAREST);
            }

            const normalizedFft = new Uint8Array(width);
            for (let i = 0; i < width; i++) {
                const fftIndex = Math.floor((i / width) * fftSize);
                const shiftedIndex = (fftIndex + fftSize / 2) % fftSize;
                normalizedFft[i] = Math.max(0, Math.min(255, (avgFftRef.current[shiftedIndex] + 120)));
            }
            gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, waterfallHeight - 1, width, 1, gl.LUMINANCE, gl.UNSIGNED_BYTE, normalizedFft);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        
        // Render the main waterfall quad
        gl.viewport(0, 0, width, waterfallHeight);
        gl.useProgram(programRef.current);
        gl.uniform1f(uniformsRef.current.uGain, settings.gain);
        gl.uniform1f(uniformsRef.current.uRange, settings.range);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
        gl.uniform1i(uniformsRef.current.uSampler, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, colormapRef.current);
        gl.uniform1i(uniformsRef.current.uColormap, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // --- 2D Overlay Drawing ---
        overlayCtx.clearRect(0, 0, width, height);
        overlayCtx.save();
        overlayCtx.translate(0, SPECTRUM_HEIGHT);
        
        // Draw grid and axes
        const dbMin = -settings.range, dbMax = 0;
        const numDbLines = Math.floor(settings.range / 10);
        overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        overlayCtx.fillStyle = '#9CA3AF';
        overlayCtx.font = '10px sans-serif';

        for (let i = 0; i <= numDbLines; i++) {
            const y = (SPECTRUM_HEIGHT / numDbLines) * i;
            overlayCtx.beginPath();
            overlayCtx.moveTo(0, -y);
            overlayCtx.lineTo(width, -y);
            overlayCtx.stroke();
            overlayCtx.textAlign = 'left';
            overlayCtx.fillText(`${dbMax - (i * 10)}`, 5, -y - 10);
        }
        
        const numFreqLines = 10;
        for (let i = 0; i <= numFreqLines; i++) {
            const x = (width / numFreqLines) * i;
            overlayCtx.beginPath();
            overlayCtx.moveTo(x, 0);
            overlayCtx.lineTo(x, -SPECTRUM_HEIGHT);
            overlayCtx.stroke();
            const freqOffset = (i / numFreqLines - 0.5) * sampleRate;
            overlayCtx.textAlign = 'center';
            overlayCtx.fillText(formatFrequency(tunedFreq + freqOffset), x, 15);
        }

        // Draw spectrum plots if data exists
        if (avgFftRef.current) {
            const getPath = (data) => {
                const path = new Path2D();
                for (let i = 0; i < data.length; i++) {
                    const x = (i / data.length) * width;
                    const db = data[(i + data.length / 2) % data.length] + settings.gain - (120-settings.range);
                    const y = - (db / settings.range) * SPECTRUM_HEIGHT;
                    if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
                }
                return path;
            };
            
            if (settings.peakHold) {
                overlayCtx.strokeStyle = 'rgba(255, 100, 100, 0.7)';
                overlayCtx.lineWidth = 1;
                overlayCtx.stroke(getPath(peakFftRef.current));
            }

            overlayCtx.strokeStyle = '#38BDF8';
            overlayCtx.lineWidth = 1.5;
            overlayCtx.stroke(getPath(avgFftRef.current));
        }

        overlayCtx.restore();

    }, [fftData, width, height, waterfallHeight, sampleRate, tunedFreq, settings]);
    
    // Start/Stop animation loop
    useEffect(() => {
        const renderLoop = () => {
            draw();
            animFrameRef.current = requestAnimationFrame(renderLoop);
        };
        animFrameRef.current = requestAnimationFrame(renderLoop);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [draw]);

    const handleMouse = (e) => {
        if (!sampleRate || e.nativeEvent.offsetY > SPECTRUM_HEIGHT) {
            if(mouseInfo) setMouseInfo(null);
            return;
        }
        const x = e.nativeEvent.offsetX;
        const freqOffset = (x / width - 0.5) * sampleRate;
        const freq = tunedFreq + freqOffset;
        
        let db = 'N/A';
        if (avgFftRef.current) {
            const fftIndex = Math.floor(x / width * avgFftRef.current.length);
            const shiftedIndex = (fftIndex + avgFftRef.current.length / 2) % avgFftRef.current.length;
            const power = avgFftRef.current[shiftedIndex];
            if(isFinite(power)) db = power.toFixed(1);
        }

        setMouseInfo({ x: x, freq: formatFrequency(freq), db: `${db} dBFS` });
    };

    const handleTuneClick = () => {
        if (onTune && mouseInfo && sampleRate) {
            const freqOffset = (mouseInfo.x / width - 0.5) * sampleRate;
            onTune(tunedFreq + freqOffset);
        }
    };
    
    const containerStyle = { position: 'relative', width, height, backgroundColor: '#111827', overflow: 'hidden', cursor: onTune ? 'pointer' : 'default' };
    const canvasStyle = { position: 'absolute', top: 0, left: 0 };
    const glCanvasStyle = { ...canvasStyle, top: `${SPECTRUM_HEIGHT}px` };

    return (
      React.createElement("div", { style: containerStyle, onMouseMove: handleMouse, onMouseLeave: () => setMouseInfo(null), onClick: handleTuneClick },
        React.createElement("canvas", { ref: glCanvasRef, width: width, height: waterfallHeight, style: glCanvasStyle }),
        React.createElement("canvas", { ref: overlayCanvasRef, width: width, height: height, style: canvasStyle }),
        mouseInfo && React.createElement("div", { className: "absolute bg-black/50 text-white text-xs p-1 rounded pointer-events-none", style: { top: `${mouseInfo.x > width / 2 ? 5 : SPECTRUM_HEIGHT-35}px`, left: `${mouseInfo.x > width/2 ? mouseInfo.x - 120 : mouseInfo.x + 10}px` } },
            React.createElement("div", null, mouseInfo.freq),
            React.createElement("div", null, mouseInfo.db)
        )
      )
    );
};


Waterfall.Controls = ({ settings, setSettings, onResetPeakHold }) => {
    return React.createElement("div", { className: "space-y-4" },
        React.createElement(Select, {
            label: "Color Scheme",
            value: settings.colorScheme,
            onChange: (e) => setSettings(s => ({ ...s, colorScheme: e.target.value })),
        }, Object.keys(COLOR_MAPS).map(name => React.createElement("option", { key: name, value: name }, name))),
        React.createElement(Slider, {
            label: "Gain", value: settings.gain, unit: " dB",
            onChange: (e) => setSettings(s => ({ ...s, gain: parseInt(e.target.value, 10) })),
            min: 0, max: 100, step: 1
        }),
        React.createElement(Slider, {
            label: "Range", value: settings.range, unit: " dB",
            onChange: (e) => setSettings(s => ({ ...s, range: parseInt(e.target.value, 10) })),
            min: 20, max: 120, step: 5
        }),
        React.createElement(Slider, {
            label: "Averaging", value: settings.averaging,
            onChange: (e) => setSettings(s => ({ ...s, averaging: parseInt(e.target.value, 10) })),
            min: 1, max: 20, step: 1
        }),
        React.createElement("div", { className: "flex items-center justify-between" },
          React.createElement("label", { className: "text-sm font-medium text-gray-300" }, "Peak Hold"),
          React.createElement("button", {
            onClick: () => setSettings(s => ({...s, peakHold: !s.peakHold })),
            className: `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.peakHold ? 'bg-cyan-500' : 'bg-gray-600'}`
          }, 
            React.createElement("span", { className: `inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.peakHold ? 'translate-x-6' : 'translate-x-1'}`})
          )
        ),
        React.createElement(Button, { onClick: onResetPeakHold, fullWidth: true }, "Reset Peak Hold")
    );
};


// Add UI components here to avoid circular dependencies if they were in ui.js
const Slider = ({ label, value, onChange, min, max, step, unit = '' }) => (
    React.createElement("div", null,
        React.createElement("label", { className: "block text-sm font-medium text-gray-300 mb-1" }, `${label}: ${value}${unit}`),
        React.createElement("input", {
            type: "range",
            min: min,
            max: max,
            step: step,
            value: value,
            onChange: onChange,
            className: "w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-cyan-500"
        })
    )
);

const Select = ({ label, value, onChange, children }) => (
    React.createElement("div", null,
        React.createElement("label", { className: "block text-sm font-medium text-gray-300 mb-1" }, label),
        React.createElement("select", {
            value: value,
            onChange: onChange,
            className: "w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 focus:outline-none"
        }, children)
    )
);

const Button = ({ children, onClick, disabled = false, fullWidth = false, primary = false, ...rest }) => (
    React.createElement("button", { onClick: onClick, disabled: disabled, className: `flex items-center justify-center px-4 py-2 font-bold rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-cyan-500 ${fullWidth ? 'w-full' : ''} ${primary ? 'bg-cyan-600 text-white hover:bg-cyan-500' : 'bg-gray-700 hover:bg-gray-600'} disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed`, ...rest },
        children
    )
);

export default Waterfall;
