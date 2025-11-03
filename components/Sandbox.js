import { Button, Card, PlaneIcon, RadioIcon, AmIcon, CloudIcon, SpectrumIcon } from './ui.js';
import Waterfall from './Waterfall.js';
import AircraftCard from './AircraftCard.js';
import RadioTuner from './RadioTuner.js';

const { useState, useCallback } = React;

const ModeButton = ({ icon, title, mode, onClick, isActive }) => {
    const clickHandlers = {
        'spectrum_explorer': () => onClick('spectrum_explorer', 100e6),
        'fm': () => onClick('fm', 98.5e6),
        'am': () => onClick('am', 870e3),
        'adsb': () => onClick('adsb'),
        'weather_broadcast': () => onClick('weather_broadcast', 162.550e6),
    }
    return (
        React.createElement("button", { 
            onClick: clickHandlers[mode], 
            className: `w-full flex flex-col items-center text-center p-3 rounded-lg border transition-colors ${isActive ? 'bg-cyan-900/50 border-cyan-400 text-cyan-300' : 'bg-gray-700/50 border-gray-600 hover:bg-gray-600/50'}`
        },
            icon, ' ', React.createElement("span", { className: "font-semibold mt-1 text-sm" }, title)
        )
    );
}

const Sandbox = ({ sdr, onReset }) => {
    const { aircrafts, fftData, startMode, tunedFreq, sampleRate, isDemo } = sdr;
    const [activeTab, setActiveTab] = useState('spectrum_explorer');
    const [waterfallSettings, setWaterfallSettings] = useState({
        gain: 40,
        range: 60,
        colorScheme: 'SDR Blue',
        averaging: 4,
        peakHold: true,
    });
    const waterfallRef = React.useRef();

    const handleModeClick = useCallback((newMode, freq) => {
        setActiveTab(newMode);
        startMode(newMode, freq);
    }, [startMode]);

    const handleResetPeakHold = useCallback(() => {
        // A bit of a hack: re-mount waterfall by changing key to reset its internal state
        waterfallRef.current = Math.random(); 
        setWaterfallSettings(s => ({...s})); // force re-render
    }, []);

    const renderContent = () => {
         switch(activeTab) {
            case 'adsb':
                return (
                    React.createElement("div", { className: "p-4" },
                        React.createElement("h3", { className: "text-xl font-bold mb-4" }, "Aircraft Radar (ADS-B)"),
                        React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 overflow-y-auto h-[65vh] pr-2" },
                            aircrafts.map(ac => React.createElement(AircraftCard, { key: ac.icao, aircraft: ac })),
                            aircrafts.length === 0 && React.createElement("div", { className: "col-span-full flex items-center justify-center h-full text-gray-500" }, React.createElement("p", null, "Listening for aircraft signals on 1090 MHz..."))
                        )
                    )
                );
            case 'fm':
            case 'am':
            case 'weather_broadcast':
            case 'spectrum_explorer':
                 const isExplorer = activeTab === 'spectrum_explorer';
                 return (
                    React.createElement("div", { className: "flex flex-col h-full p-2" },
                        activeTab === 'fm' && React.createElement(RadioTuner, { onTune: (f) => startMode('fm', f), isDemo: isDemo, mode: 'fm', initialFreq: tunedFreq/1e6 || 98.5, unit: "MHz", step: 0.1, min: 87.5, max: 108.0 }),
                        activeTab === 'am' && React.createElement(RadioTuner, { onTune: (f) => startMode('am', f), isDemo: isDemo, mode: 'am', initialFreq: tunedFreq/1e3 || 870, unit: "kHz", step: 10, min: 530, max: 1700 }),
                        activeTab === 'weather_broadcast' && React.createElement("div", { className: "flex flex-wrap gap-2 justify-center p-4" }, [162.400, 162.475, 162.550].map(f => React.createElement(Button, { key: f, onClick: () => startMode('weather_broadcast', f * 1e6), primary: tunedFreq === f * 1e6 }, "Tune ", f, " MHz"))),
                        activeTab === 'spectrum_explorer' && React.createElement(RadioTuner, { onTune: (f) => startMode('spectrum_explorer', f), isDemo: isDemo, mode: 'spectrum_explorer', initialFreq: tunedFreq/1e6 || 100, unit: "MHz", step: 1, min: 24, max: 1700 }),
                        
                        React.createElement("div", { className: "flex-grow pt-4 min-h-0" },
                             React.createElement("div", { className: "h-[400px] bg-black rounded-md border border-gray-700 mx-auto" },
                                React.createElement(Waterfall, { 
                                  key: waterfallRef.current,
                                  fftData: fftData, 
                                  width: 800, 
                                  height: 400, 
                                  tunedFreq: tunedFreq,
                                  sampleRate: sampleRate,
                                  settings: waterfallSettings,
                                  onTune: isExplorer ? (f) => startMode('spectrum_explorer', f) : undefined
                                })
                            )
                        )
                    ));
            default:
                return null;
        }
    };

    const isRadioMode = ['fm', 'am', 'weather_broadcast', 'spectrum_explorer'].includes(activeTab);

    return (
         React.createElement("div", { className: "max-w-screen-2xl mx-auto animate-fade-in" },
            React.createElement(Card, { className: "mb-4" },
                React.createElement("div", { className: "flex justify-between items-center" },
                    React.createElement("div", null,
                        React.createElement("h2", { className: "text-2xl font-bold text-cyan-400" }, "Freestyle Mode"),
                        React.createElement("p", { className: "text-gray-300" }, "You've completed the tutorial! Feel free to explore all the SDR features.")
                    ),
                    React.createElement(Button, { onClick: onReset }, "Start Over")
                )
            ),
            React.createElement("div", { className: "grid grid-cols-1 lg:grid-cols-5 gap-6" },
                React.createElement(Card, { className: "lg:col-span-1" },
                    React.createElement("h3", { className: "text-lg font-bold mb-4" }, "Controls"),
                    React.createElement("div", { className: "space-y-3" },
                         React.createElement(ModeButton, { icon: React.createElement(SpectrumIcon, null), title: "Spectrum Explorer", mode: "spectrum_explorer", onClick: handleModeClick, isActive: activeTab === 'spectrum_explorer' }),
                         React.createElement(ModeButton, { icon: React.createElement(RadioIcon, null), title: "FM Radio", mode: "fm", onClick: handleModeClick, isActive: activeTab === 'fm' }),
                         React.createElement(ModeButton, { icon: React.createElement(AmIcon, null), title: "AM Radio", mode: "am", onClick: handleModeClick, isActive: activeTab === 'am' }),
                         React.createElement(ModeButton, { icon: React.createElement(PlaneIcon, null), title: "Aircraft Radar", mode: "adsb", onClick: handleModeClick, isActive: activeTab === 'adsb' }),
                         React.createElement(ModeButton, { icon: React.createElement(CloudIcon, null), title: "Weather Radio", mode: "weather_broadcast", onClick: handleModeClick, isActive: activeTab === 'weather_broadcast' })
                    )
                ),
                React.createElement(Card, { className: `lg:col-span-${isRadioMode ? '3' : '4'} min-h-[70vh]` },
                    renderContent()
                ),
                 isRadioMode && (
                     React.createElement(Card, { className: "lg:col-span-1" },
                        React.createElement("h3", { className: "text-lg font-bold mb-4" }, "Display Controls"),
                        React.createElement(Waterfall.Controls, { settings: waterfallSettings, setSettings: setWaterfallSettings, onResetPeakHold: handleResetPeakHold })
                    )
                )
            )
        )
    );
};

export default Sandbox;