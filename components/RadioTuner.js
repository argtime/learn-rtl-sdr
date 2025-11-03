import { Button } from './ui.js';

const { useState } = React;

const RadioTuner = ({ onTune, isDemo, mode, initialFreq, unit, step, min, max }) => {
    const [freq, setFreq] = useState(initialFreq);
    
    const handleTune = (e) => {
        e.preventDefault();
        onTune(freq * (unit === 'MHz' ? 1e6 : 1e3));
    };
    
    const demoFreq = mode === 'fm' ? 98.5 : 870;
    const demoUnit = mode === 'fm' ? 'MHz' : 'kHz';
    
    const WarningCard = ({ children }) => React.createElement("div", { className: "text-sm text-yellow-300 bg-yellow-900/50 p-3 rounded-md border border-yellow-800 mt-4 max-w-md mx-auto" }, children);


    return (
        React.createElement("div", { className: "p-4 text-center" },
            isDemo && React.createElement(WarningCard, null, React.createElement("b", null, "DEMO:"), " Tune to ", React.createElement("b", null, demoFreq, " ", demoUnit), " to hear a simulated station!"),
            React.createElement("form", { onSubmit: handleTune, className: "flex items-center justify-center gap-2 mt-4" },
                React.createElement("input", { 
                    type: "number", 
                    value: freq, 
                    onChange: e => setFreq(parseFloat(e.target.value)), 
                    step: step, 
                    min: min, 
                    max: max, 
                    className: "bg-gray-900 border border-gray-600 rounded-md w-32 text-center p-3 text-lg appearance-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 focus:outline-none",
                    style: { MozAppearance: 'textfield' }
                }),
                React.createElement("span", { className: "font-bold text-lg" }, unit),
                React.createElement(Button, { type: "submit", primary: true }, "Tune")
            )
        )
    );
};

export default RadioTuner;
