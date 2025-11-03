import { Demodulator } from '../lib/sdr.js';
import { fft } from '../lib/fft.js';
import { AltitudeUnit } from '../types.js';

const { useState, useCallback, useRef, useEffect } = React;

const ADS_B_FREQ = 1090000000;
const ADS_B_SAMPLE_RATE = 2000000;
const WIDE_SAMPLE_RATE = 2400000;
const RADIO_SAMPLE_RATE = 240000;
const RADIO_SAMPLES_TO_READ = 16 * 1024;
const FFT_SIZE = 2048;
const FM_DECIMATION = 5;
const AM_DECIMATION = 10;
const DEMO_FM_STATION_HZ = 98.5;
const DEMO_AM_STATION_HZ = 870;
const DEMO_WEATHER_TEXT = "This is a simulated NOAA weather radio broadcast. A weak cold front will move through the region this afternoon, bringing scattered showers. Winds will be from the southwest at 10 to 15 miles per hour. Highs today in the upper 60s. Conditions will clear overnight with lows in the mid 40s.";

const sampleAircraft = [
    { icao: 0xAC824D, callsign: 'AAL2304', altitude: 32000, speed: 450, heading: 120, lastSeen: 0, unit: AltitudeUnit.FEET },
    { icao: 0xA4A273, callsign: 'SWA433', altitude: 28500, speed: 420, heading: 275, lastSeen: 0, unit: AltitudeUnit.FEET },
    { icao: 0xADAFB1, callsign: 'UAL1889', altitude: 39000, speed: 480, heading: 85, lastSeen: 0, unit: AltitudeUnit.FEET },
];
let demoAircrafts = new Map();
sampleAircraft.forEach(ac => demoAircrafts.set(ac.icao, { ...ac, lastSeen: Date.now() }));

export const useSdr = () => {
  const [status, setStatus] = useState('idle');
  const [mode, setMode] = useState('idle');
  const [error, setError] = useState(null);
  const [aircrafts, setAircrafts] = useState(new Map());
  const [isDemo, setIsDemo] = useState(false);
  const [fftData, setFftData] = useState(null);
  const [tunedFreq, setTunedFreq] = useState(0);
  const [sampleRate, setSampleRate] = useState(0);
  const [isTunedDemo, setIsTunedDemo] = useState(false);

  const device = useRef(null);
  const stopReading = useRef(true);
  const demodulator = useRef(null);
  const simulationInterval = useRef(null);
  const demoSignalPosition = useRef(Math.floor(FFT_SIZE / 2));
  const demoSignalDirection = useRef(1);
  const activeMode = useRef('idle');
  const audioContext = useRef(null);
  const audioProcessor = useRef(null);
  const audioQueue = useRef([]);
  const audioGain = useRef(null);
  const lastPhase = useRef(0);
  const amDcOffset = useRef(0);

  const onMessage = useCallback((msg) => {
    if (msg.crcOk && msg.icao) {
      setAircrafts(prev => {
        const newAircrafts = new Map(prev);
        const existing = newAircrafts.get(msg.icao) || { icao: msg.icao };
        const data = { ...existing, ...msg, lastSeen: Date.now() };
        newAircrafts.set(msg.icao, data);
        return newAircrafts;
      });
    }
  }, []);

  const demodulateFm = useCallback((samples) => {
    const output = new Float32Array(samples.length / 2);
    for (let i = 0; i < samples.length; i += 2) {
      const I = (samples[i] - 127.5) / 127.5;
      const Q = (samples[i + 1] - 127.5) / 127.5;
      const phase = Math.atan2(Q, I);
      let deltaPhase = phase - lastPhase.current;
      if (deltaPhase > Math.PI) deltaPhase -= 2 * Math.PI;
      if (deltaPhase < -Math.PI) deltaPhase += 2 * Math.PI;
      output[i / 2] = deltaPhase;
      lastPhase.current = phase;
    }
    return output;
  }, []);
  
  const demodulateAm = useCallback((samples) => {
      const output = new Float32Array(samples.length / 2);
      let currentDc = 0;
      for (let i = 0; i < samples.length; i += 2) {
          const I = (samples[i] - 127.5);
          const Q = (samples[i + 1] - 127.5);
          currentDc += Math.sqrt(I*I + Q*Q);
      }
      currentDc /= (samples.length / 2);
      amDcOffset.current = amDcOffset.current === 0 ? currentDc : amDcOffset.current * 0.95 + currentDc * 0.05;

      for (let i = 0; i < samples.length; i+=2) {
          const I = (samples[i] - 127.5);
          const Q = (samples[i + 1] - 127.5);
          const mag = Math.sqrt(I*I + Q*Q);
          output[i/2] = (mag - amDcOffset.current) / 127.5;
      }
      return output;
  }, []);

  function filterAndDecimate(audio, factor) {
      const decimatedLength = Math.floor(audio.length / factor);
      const decimated = new Float32Array(decimatedLength);
      for (let i = 0; i < decimatedLength; i++) {
          let sum = 0;
          for (let j = 0; j < factor; j++) sum += audio[i * factor + j];
          decimated[i] = sum / factor;
      }
      return decimated;
  }

  const processRadioSamples = useCallback((samples) => {
    const data = new Uint8Array(samples);
    const complexSamples = { real: new Array(FFT_SIZE).fill(0), imag: new Array(FFT_SIZE).fill(0) };
    for (let i = 0; i < FFT_SIZE; i++) {
        complexSamples.real[i] = (data[i * 2] - 127.5) / 127.5;
        complexSamples.imag[i] = (data[i * 2 + 1] - 127.5) / 127.5;
    }
    
    for (let i=0; i < FFT_SIZE; i++) {
        const windowFactor = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
        complexSamples.real[i] *= windowFactor;
        complexSamples.imag[i] *= windowFactor;
    }
    const fftResult = fft(complexSamples);
    const mags = fftResult.real.map((re, i) => 10 * Math.log10(re * re + fftResult.imag[i] * fftResult.imag[i]));
    setFftData(mags);

    let rawAudio;
    let decimatedAudio = null;
    
    if (audioGain.current) audioGain.current.gain.value = 1.0;

    if (activeMode.current === 'fm' || activeMode.current === 'weather_broadcast') {
        rawAudio = demodulateFm(data);
        decimatedAudio = filterAndDecimate(rawAudio, FM_DECIMATION);
    } else if (activeMode.current === 'am') {
        rawAudio = demodulateAm(data);
        decimatedAudio = filterAndDecimate(rawAudio, AM_DECIMATION);
        if (audioGain.current) audioGain.current.gain.value = 5.0;
    }
    
    if (decimatedAudio) audioQueue.current.push(decimatedAudio);
  }, [demodulateAm, demodulateFm]);

  const readLoop = useCallback(async () => {
    if (!device.current || stopReading.current) return;
    try {
      const samplesToRead = activeMode.current === 'adsb' ? 128 * 1024 : RADIO_SAMPLES_TO_READ;
      const samples = await device.current.readSamples(samplesToRead);
      if(activeMode.current === 'adsb') {
        demodulator.current?.process(new Uint8Array(samples), samples.byteLength, onMessage);
      } else {
        processRadioSamples(samples);
      }
      if (!stopReading.current) requestAnimationFrame(readLoop);
    } catch (e) {
      console.error("Error reading samples:", e);
      setError("Failed to read data. The device might have been disconnected. Please try connecting again.");
      setStatus('error');
    }
  }, [onMessage, processRadioSamples]);
  
  const setupAudio = useCallback(() => {
    if (!audioContext.current) {
      const isAm = activeMode.current === 'am';
      const targetSampleRate = RADIO_SAMPLE_RATE / (isAm ? AM_DECIMATION : FM_DECIMATION);
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: targetSampleRate });
      audioProcessor.current = audioContext.current.createScriptProcessor(4096, 1, 1);
      audioGain.current = audioContext.current.createGain();
      
      audioProcessor.current.onaudioprocess = (e) => {
        const outputBuffer = e.outputBuffer.getChannelData(0);
        if (isDemo && activeMode.current !== 'weather_broadcast') {
            const time = e.playbackTime;
            for (let i = 0; i < outputBuffer.length; i++) {
                const sampleTime = time + i / e.outputBuffer.sampleRate;
                if (isTunedDemo) {
                    const tone = Math.sin(sampleTime * 2 * Math.PI * 440) * (isAm ? Math.sin(sampleTime * 2 * Math.PI * 2) : 1) * 0.3;
                    outputBuffer[i] = tone + (Math.random() * 2 - 1) * 0.02;
                } else {
                    outputBuffer[i] = (Math.random() * 2 - 1) * 0.1;
                }
            }
            return;
        }

        if (isDemo && activeMode.current === 'weather_broadcast') {
           for (let i = 0; i < outputBuffer.length; i++) outputBuffer[i] = (Math.random() * 2 - 1) * 0.05;
           return;
        }

        let i = 0;
        while(i < outputBuffer.length && audioQueue.current.length > 0) {
          const chunk = audioQueue.current[0];
          const toCopy = Math.min(outputBuffer.length - i, chunk.length);
          outputBuffer.set(chunk.subarray(0, toCopy), i);
          if(toCopy < chunk.length) { audioQueue.current[0] = chunk.subarray(toCopy); } 
          else { audioQueue.current.shift(); }
          i += toCopy;
        }
        while(i < outputBuffer.length) { outputBuffer[i++] = 0; }
      };
      
      audioProcessor.current.connect(audioGain.current);
      audioGain.current.connect(audioContext.current.destination);
    }
    if (audioContext.current.state === 'suspended') audioContext.current.resume();
  }, [isDemo, isTunedDemo]);

  const stopActivity = useCallback(async (isDisconnecting = false) => {
    stopReading.current = true;
    if (simulationInterval.current) clearInterval(simulationInterval.current);
    simulationInterval.current = null;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    
    if (audioContext.current && audioContext.current.state !== 'closed') {
      await audioContext.current.close().catch(console.error);
      audioContext.current = null;
      if (audioProcessor.current) audioProcessor.current.disconnect();
      audioProcessor.current = null;
      audioQueue.current = [];
    }

    setMode('idle');
    activeMode.current = 'idle';
    setFftData(null);
    setAircrafts(new Map());
    setTunedFreq(0);
    setSampleRate(0);

    if (isDisconnecting) {
        setIsDemo(false);
        setStatus('idle');
        setError(null);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }, []);

  const startMode = useCallback(async (newMode, freq) => {
    await stopActivity();
    setMode(newMode);
    activeMode.current = newMode;
    setError(null);
    setTunedFreq(freq || 0);
    
    if (isDemo) {
        let currentSampleRate = WIDE_SAMPLE_RATE;
        if(newMode === 'fm' || newMode === 'am' || newMode === 'weather_broadcast') currentSampleRate = RADIO_SAMPLE_RATE;
        setSampleRate(currentSampleRate);

        const simulate = () => {
            if (activeMode.current !== newMode) return;
            if (newMode === 'adsb') {
                demoAircrafts.forEach(ac => {
                    ac.lastSeen = Date.now();
                    ac.altitude = (ac.altitude || 30000) + (Math.random() - 0.5) * 25;
                    ac.heading = ((ac.heading || 0) + (Math.random() - 0.4) * 0.5 + 360) % 360;
                });
                setAircrafts(new Map(demoAircrafts));
            } else if (freq) {
                const isOnFm = newMode === 'fm' && Math.abs(freq / 1e6 - DEMO_FM_STATION_HZ) < 0.1;
                const isOnAm = newMode === 'am' && Math.abs(freq / 1e3 - DEMO_AM_STATION_HZ) < 10;
                setIsTunedDemo(isOnAm || isOnFm);

                demoSignalPosition.current += demoSignalDirection.current * 2;
                if (demoSignalPosition.current <= 100 || demoSignalPosition.current >= FFT_SIZE - 100) {
                    demoSignalDirection.current *= -1;
                }

                let fakeMags = new Array(FFT_SIZE).fill(-120).map(() => -120 + Math.random() * 20 + (Math.random() > 0.95 ? Math.random() * 15 : 0));
                
                let peakPosition = FFT_SIZE / 2;
                if (newMode === 'spectrum_explorer') {
                    peakPosition = demoSignalPosition.current;
                }

                if(isOnFm || isOnAm || newMode === 'spectrum_explorer') {
                    const width = (isOnFm || isOnAm) ? 20 : 5;
                    fakeMags[peakPosition] = -10;
                    for(let i=1; i<width; i++) {
                        const falloff = -10 - i * (50 / width);
                        if (peakPosition-i >= 0) fakeMags[peakPosition-i] = Math.max(fakeMags[peakPosition-i], falloff);
                        if (peakPosition+i < FFT_SIZE) fakeMags[peakPosition+i] = Math.max(fakeMags[peakPosition+i], falloff);
                    }
                } else if (newMode === 'weather_broadcast') {
                    const peak = FFT_SIZE / 2;
                    for(let i=0; i<5; i++) fakeMags[peak - i] = fakeMags[peak + i] = -25 + Math.random()*10;
                }
                setFftData(fakeMags);
            }
        };
        simulate();
        simulationInterval.current = window.setInterval(simulate, 100);
        if (['fm', 'am', 'weather_broadcast'].includes(newMode)) setupAudio();
        if (newMode === 'weather_broadcast' && window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(DEMO_WEATHER_TEXT);
            utterance.rate = 0.9;
            utterance.onend = () => { if(activeMode.current === 'weather_broadcast' && simulationInterval.current) setTimeout(() => window.speechSynthesis.speak(utterance), 2000); };
            window.speechSynthesis.speak(utterance);
        }
    } else {
        if (!device.current) {
          setError("SDR Device is not connected.");
          setStatus('error');
          return;
        }
        let currentSampleRate = RADIO_SAMPLE_RATE;
        if (newMode === 'adsb') currentSampleRate = ADS_B_SAMPLE_RATE;
        if (newMode === 'spectrum_explorer') currentSampleRate = WIDE_SAMPLE_RATE;

        try {
            await device.current.setSampleRate(currentSampleRate);
            setSampleRate(currentSampleRate);
            await device.current.setCenterFrequency(freq || (newMode === 'adsb' ? ADS_B_FREQ : 100e6));
            
            if (newMode === 'adsb') demodulator.current = new Demodulator({ fixErrors: true, aggressive: true });
            if (['fm', 'am', 'weather_broadcast'].includes(newMode)) setupAudio();

            await device.current.resetBuffer();
            stopReading.current = false;
            readLoop();
        } catch(e) {
            console.error("Failed to configure device:", e);
            setError(`Failed to configure device: ${e.message}. It might be disconnected.`);
            setStatus('error');
        }
    }
  }, [isDemo, stopActivity, setupAudio, readLoop]);

  const connect = useCallback(async () => {
    if (device.current) return;
    setStatus('connecting');
    setError(null);
    try {
      device.current = await window.RtlSdr.requestDevice();
      await device.current.open({ ppm: 0.5, gain: null });
      setStatus('connected'); 
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("No device selected") ? "You didn't select a device." : `Connection failed: ${msg}. If on Windows, you may need to run Zadig to install the correct WebUSB driver.`);
      setStatus('error');
      device.current = null;
    }
  }, []);

  const disconnect = useCallback(async () => {
    await stopActivity(true);
    if (device.current) {
      try {
        await device.current.close();
      } catch (e) {
        console.warn("Could not close device, it may have been unplugged:", e);
      }
      device.current = null;
    }
  }, [stopActivity]);
  
  useEffect(() => {
    const timer = setInterval(() => {
        setAircrafts((prev) => {
            let changed = false;
            const newMap = new Map(prev);
            for (const [key, ac] of newMap.entries()) {
                if(Date.now() - ac.lastSeen > 60000) {
                    newMap.delete(key);
                    changed = true;
                }
            }
            return changed ? newMap : prev;
        })
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return { 
      status, mode, error, isDemo, fftData, tunedFreq, sampleRate,
      aircrafts: Array.from(aircrafts.values()).sort((a, b) => b.lastSeen - a.lastSeen), 
      connect, disconnect, stopActivity, startMode,
      startDemoMode: () => { setIsDemo(true); setStatus('connected'); setError(null); },
      exitDemoMode: () => disconnect(),
  };
};