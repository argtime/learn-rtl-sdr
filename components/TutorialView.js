import { Card, Button } from './ui.js';
import Waterfall from './Waterfall.js';
import AircraftCard from './AircraftCard.js';
import RadioTuner from './RadioTuner.js';

const { useEffect } = React;

const TUTORIAL_STEP_COUNT = 6;

const TutorialStep = ({ title, explanation, children, onNext, onPrev, currentStep }) => {
    return (
        React.createElement("div", { className: "max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in" },
            React.createElement(Card, { className: "lg:col-span-1" },
                React.createElement("h2", { className: "text-2xl font-bold text-cyan-400 mb-3" }, "Step ", currentStep, ": ", title),
                React.createElement("div", { className: "text-gray-300 space-y-4" }, explanation)
            ),
            React.createElement("div", { className: "lg:col-span-2" },
                React.createElement(Card, { className: "h-full flex flex-col overflow-hidden" },
                    React.createElement("div", { className: "flex-grow min-h-0 overflow-y-auto" }, children),
                    React.createElement("div", { className: "flex justify-between items-center mt-4 pt-4 border-t border-gray-700" },
                        React.createElement(Button, { onClick: onPrev },
                            "Previous Step"
                        ),
                         React.createElement("span", { className: "text-sm text-gray-500" }, "Step ", currentStep, " of ", TUTORIAL_STEP_COUNT),
                        React.createElement(Button, { onClick: onNext, primary: true },
                            currentStep === TUTORIAL_STEP_COUNT ? 'Finish & Enter Freestyle' : 'Next Step'
                        )
                    )
                )
            )
        )
    );
};

const WarningCard = ({ children }) => (
    React.createElement("div", { className: "text-sm text-yellow-300 bg-yellow-900/50 p-3 rounded-md border border-yellow-800 mt-4" }, children)
);

const TutorialView = ({ sdr, currentStep, setStep }) => {
    const nextStep = () => setStep(s => s + 1);
    const prevStep = () => {
        if (currentStep <= 1) { // Go back to connect screen
            sdr.disconnect();
            setStep(1);
        } else {
            setStep(s => s - 1);
        }
    }

    // This effect manages the SDR state based on the current tutorial step
    useEffect(() => {
        sdr.stopActivity();
        if(sdr.status === 'connected') {
            switch (currentStep) {
                case 1: sdr.startMode('spectrum_explorer', 98.5e6); break;
                case 2: sdr.startMode('fm', 98.5e6); break;
                case 3: sdr.startMode('am', 870e3); break;
                case 4: sdr.startMode('adsb'); break;
                case 5: sdr.startMode('weather_broadcast', 162.55e6); break;
                case 6: sdr.startMode('idle'); break;
            }
        }
    // sdr object is intentionally omitted from dependencies to avoid re-triggering on every fftData update
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStep, sdr.status]);
    
    const renderStepContent = () => {
        switch (currentStep) {
            case 1: return (
                 React.createElement(TutorialStep, { currentStep: 1, title: "The Radio Spectrum", onNext: nextStep, onPrev: prevStep, explanation: React.createElement(React.Fragment, null, React.createElement("p", null, "Radio isn't just one \"channel\"; it's a vast ", React.createElement("b", null, "spectrum"), " of frequencies. In the next step, we'll use a \"waterfall\" display to visualize this spectrum."), React.createElement("p", null, "In this visualization, ", React.createElement("b", null, "Time"), " flows from top to bottom, and ", React.createElement("b", null, "frequency"), " is from left to right. Bright vertical lines indicate strong, active radio signals."), React.createElement("p", null, "We are currently tuned to the FM broadcast band, around 98.5 ", React.createElement("b", null, "MHz"), " (MegaHertz). You can't see or hear anything yet, but the device is receiving data.")) },
                      React.createElement("div", { className: "p-4 flex flex-col h-full items-center justify-center text-gray-500" }, React.createElement("h4", { className: "text-lg font-semibold text-center mb-2" }, "Ready to see the spectrum..."))
                 )
            );
            case 2: return (
                 React.createElement(TutorialStep, { currentStep: 2, title: "FM Radio", onNext: nextStep, onPrev: prevStep, explanation: React.createElement(React.Fragment, null, React.createElement("p", null, "Now let's listen to a signal. This is the same FM radio you have in your car."), React.createElement("p", null, "FM stands for ", React.createElement("b", null, "Frequency Modulation"), ". The audio information is encoded by making tiny changes to the signal's frequency. This makes it resistant to noise and allows for high-fidelity stereo sound."), React.createElement("p", null, "Use the tuner below to enter the frequency of a known local station to hear it.")) },
                      React.createElement("div", { className: "flex flex-col h-full" },
                           React.createElement(RadioTuner, { onTune: (f) => sdr.startMode('fm', f), isDemo: sdr.isDemo, mode: 'fm', initialFreq: sdr.isDemo ? 98.5 : sdr.tunedFreq/1e6 || 98.5, unit: "MHz", step: 0.1, min: 87.5, max: 108.0 })
                      )
                 )
            );
            case 3: return (
                 React.createElement(TutorialStep, { currentStep: 3, title: "AM Radio", onNext: nextStep, onPrev: prevStep, explanation: React.createElement(React.Fragment, null, React.createElement("p", null, "AM radio uses a different method and a different frequency band (530-1700 ", React.createElement("b", null, "kHz"), ")."), React.createElement("p", null, "AM stands for ", React.createElement("b", null, "Amplitude Modulation"), ". The audio is encoded by changing the signal's power (amplitude). It's an older technology that travels further, but is more susceptible to noise."), React.createElement(WarningCard, null, React.createElement("b", null, "Note:"), " AM signals can be difficult to receive without a long wire antenna. You may only hear static.")) },
                      React.createElement("div", { className: "flex flex-col h-full" },
                           React.createElement(RadioTuner, { onTune: (f) => sdr.startMode('am', f), isDemo: sdr.isDemo, mode: 'am', initialFreq: sdr.isDemo ? 870 : sdr.tunedFreq/1e3 || 870, unit: "kHz", step: 10, min: 530, max: 1700 })
                      )
                 )
            );
            case 4: return (
                React.createElement(TutorialStep, { currentStep: 4, title: "Aircraft Radar (ADS-B)", onNext: nextStep, onPrev: prevStep, explanation: React.createElement(React.Fragment, null, React.createElement("p", null, "Most commercial aircraft constantly broadcast their position, altitude, and speed using a system called ", React.createElement("b", null, "ADS-B"), " (Automatic Dependent Surveillance–Broadcast)."), React.createElement("p", null, "We are now tuned to the ADS-B frequency (1090 MHz). The list on the right will populate with any aircraft detected nearby."), React.createElement(WarningCard, null, React.createElement("b", null, "Note:"), " Seeing aircraft depends on your antenna and location. You may not see any signals.")) },
                     React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2 p-2 overflow-y-auto h-[45vh]" }, sdr.aircrafts.map(ac => React.createElement(AircraftCard, { key: ac.icao, aircraft: ac })), sdr.aircrafts.length === 0 && React.createElement("div", { className: "md:col-span-2 flex items-center justify-center h-full text-gray-500" }, React.createElement("p", null, "Listening for aircraft signals...")))
                )
            );
            case 5: return (
                 React.createElement(TutorialStep, { currentStep: 5, title: "NOAA Weather Radio", onNext: nextStep, onPrev: prevStep, explanation: React.createElement(React.Fragment, null, React.createElement("p", null, "The National Oceanic and Atmospheric Administration (NOAA) broadcasts continuous weather information on specific frequencies in North America."), React.createElement("p", null, "These are narrow-band FM signals. Click one of the common frequencies below to tune in."), React.createElement(WarningCard, null, React.createElement("b", null, "Note:"), " NOAA broadcasts are only available in North America.")) },
                      React.createElement("div", { className: "flex flex-col h-full" },
                           React.createElement("div", { className: "p-4 text-center space-y-3" },
                                sdr.isDemo && (React.createElement(WarningCard, null, React.createElement("b", null, "DEMO:"), " This simulates a weather broadcast using your browser's text-to-speech engine.")),
                                React.createElement("div", { className: "flex flex-wrap gap-2 pt-2 justify-center" },
                                    [162.400, 162.475, 162.550].map(f => React.createElement(Button, { key: f, onClick: () => sdr.startMode('weather_broadcast', f * 1e6) }, "Tune ", f, " MHz"))
                                )
                           )
                      )
                 )
            );
            case 6: return (
                 React.createElement(TutorialStep, { currentStep: 6, title: "Next Steps & Desktop Software", onNext: nextStep, onPrev: prevStep, explanation: React.createElement(React.Fragment, null, React.createElement("p", null, "Congratulations, you've learned the basics!"), React.createElement("p", null, "While this tool is great for starting, dedicated desktop applications offer more power and better performance."), React.createElement("p", null, "When you're ready to dive deeper, check out these popular free programs:"), React.createElement("ul", { className: "list-disc list-inside pl-2" }, React.createElement("li", null, React.createElement("a", { href: "https://airspy.com/download/", target: "_blank", rel: "noopener noreferrer", className: "text-cyan-300 underline" }, "SDR# (SDRSharp)"), " for Windows"), React.createElement("li", null, React.createElement("a", { href: "https://www.sdrpp.org/", target: "_blank", rel: "noopener noreferrer", className: "text-cyan-300 underline" }, "SDR++ (SDRPlusPlus)"), " for Windows, Mac, and Linux"))) },
                      React.createElement("div", { className: "p-4 space-y-4" },
                        React.createElement("h4", { className: "text-xl font-bold" }, "Driver Setup for Desktop Apps"),
                        React.createElement("div", { className: "text-left text-gray-300 space-y-4 text-sm" },
                            React.createElement("p", null, "To use desktop software, you often need to install a special driver. This process replaces the default driver, allowing the software to talk to the SDR directly."),
                            React.createElement("div", null,
                                React.createElement("h3", { className: "font-bold text-cyan-400" }, "Windows Users:"),
                                React.createElement("p", null, "You must replace the default DVB-T drivers with a generic WinUSB driver. The easiest way is with a tool called ", React.createElement("a", { href: "https://zadig.akeo.ie/", target: "_blank", rel: "noopener noreferrer", className: "text-cyan-300 underline" }, "Zadig"), "."),
                                React.createElement("ol", { className: "list-decimal list-inside pl-4 mt-2" },
                                    React.createElement("li", null, "Download and run Zadig."),
                                    React.createElement("li", null, "Go to Options and check \"List All Devices\"."),
                                    React.createElement("li", null, "Select \"Bulk-In, Interface (Interface 0)\" from the dropdown."),
                                    React.createElement("li", null, "Ensure the target driver is ", React.createElement("b", { className: "text-white" }, "WinUSB"), "."),
                                    React.createElement("li", null, "Click \"Replace Driver\".")
                                )
                            ),
                             React.createElement("div", null,
                                React.createElement("h3", { className: "font-bold text-cyan-400" }, "macOS & Linux Users:"),
                                React.createElement("p", null, "You usually don't need special drivers for desktop software, but you may need to prevent the operating system from claiming the device by \"blacklisting\" the default drivers.")
                            )
                        )
                      )
                 )
            );
            default: return null;
        }
    };
    
    return renderStepContent();
};

export default TutorialView;