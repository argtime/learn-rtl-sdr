import { useSdr } from './hooks/useSdr.js';
import { Card, Button, WifiIcon } from './components/ui.js';
import Sandbox from './components/Sandbox.js';
import TutorialView from './components/TutorialView.js';

const { useState, useCallback, useEffect } = React;

const App = () => {
    const [step, setStep] = useState(0);
    const sdr = useSdr();

    const resetTutorial = useCallback(() => {
        sdr.disconnect();
        setStep(1);
    }, [sdr]);
    
    const startDemo = useCallback(() => {
        sdr.startDemoMode();
        setStep(2);
    }, [sdr]);

    useEffect(() => {
        if (step === 1 && sdr.status === 'connected' && !sdr.isDemo) {
            setStep(2);
        }
    }, [step, sdr.status, sdr.isDemo]);

    const Header = () => (
      React.createElement("header", { className: "py-4 px-8 bg-gray-900/70 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-10" },
        React.createElement("h1", { className: "text-2xl font-bold text-cyan-400 flex items-center" },
            React.createElement(WifiIcon, { className: "h-8 w-8 mr-3" }), "Web SDR Tutorial"),
        React.createElement("p", { className: "text-gray-400" }, "An interactive guide to the world of radio signals.")
      )
    );

    const WelcomeScreen = ({ onStart, onStartDemo }) => (
        React.createElement("div", { className: "text-center max-w-2xl mx-auto animate-fade-in" },
            React.createElement(Card, null,
                React.createElement("h2", { className: "text-4xl font-bold mb-4" }, "Welcome to the Web SDR Tutorial"),
                React.createElement("p", { className: "text-lg text-gray-300 mb-4" },
                    "This interactive application lets you explore the invisible world of radio signals using an inexpensive RTL-SDR dongle, right from your web browser."
                ),
                React.createElement("p", { className: "text-lg text-gray-300 mb-8" },
                    React.createElement("b", null, "Software Defined Radio (SDR)"), " turns your computer into a universal radio scanner. You'll track aircraft, listen to radio stations, and visualize the radio spectrum."
                ),
                React.createElement("div", { className: "flex flex-col sm:flex-row gap-4" },
                    React.createElement(Button, { onClick: onStart, primary: true, fullWidth: true }, "Connect Your SDR"),
                    React.createElement(Button, { onClick: onStartDemo, fullWidth: true }, "Try Demo Mode")
                )
            )
        )
    );
    
    const ConnectScreen = () => {
        const isUsbSupported = 'usb' in navigator;

        return (
            React.createElement("div", { className: "text-center max-w-lg mx-auto animate-fade-in" },
                React.createElement(Card, null,
                    React.createElement("h2", { className: "text-3xl font-bold mb-4" }, "Connect Your Device"),
                    React.createElement("p", { className: "text-gray-300 mb-2" }, "Plug in your ", React.createElement("b", null, "RTL-SDR USB dongle"), " with an antenna, then click the connect button below."),
                    React.createElement("p", { className: "text-sm text-gray-400 mb-6" }, "Your browser will ask for permission to access the device you select."),
                    
                    !isUsbSupported && (
                        React.createElement("div", { className: "text-yellow-300 text-sm bg-yellow-900/50 p-3 rounded-md border border-yellow-800 mb-4" },
                            React.createElement("p", { className: "font-bold mb-2" }, "Browser May Not Be Fully Supported"),
                            React.createElement("p", null, "Your browser doesn't seem to support ", React.createElement("b", null, "WebUSB"), ", which is needed to connect to a real SDR. You can still use ", React.createElement("b", null, "Demo Mode"), " to follow the tutorial!")
                        )
                    ),
                    
                    React.createElement("div", { className: "space-y-4" },
                        React.createElement(Button, { onClick: () => sdr.connect(), disabled: sdr.status === 'connecting' || !isUsbSupported, fullWidth: true },
                            sdr.status === 'connecting' ? 'Connecting...' : 'Connect RTL-SDR'
                        ),
                         React.createElement("button", { onClick: () => setStep(0), className: "w-full text-center text-sm text-cyan-400 hover:underline" },
                            "Back"
                        )
                    ),
                    sdr.error && React.createElement("div", { className: "text-red-400 mt-4 text-sm bg-red-900/50 p-3 rounded-md border border-red-800" },
                        React.createElement("p", { className: "font-bold mb-2" }, "Connection Error"),
                        React.createElement("p", null, sdr.error)
                    )
                )
            )
        );
    };
    
    const renderContent = () => {
        if (step === 0) return React.createElement(WelcomeScreen, { onStart: () => setStep(1), onStartDemo: startDemo });
        if (step === 1) return React.createElement(ConnectScreen, null);
        if (step >= 2 && step <= 7) return React.createElement(TutorialView, { sdr: sdr, currentStep: step - 1, setStep: setStep });
        if (step === 8) return React.createElement(Sandbox, { sdr: sdr, onReset: resetTutorial });
        return React.createElement(WelcomeScreen, { onStart: () => setStep(1), onStartDemo: startDemo });
    }

    return (
        React.createElement("div", { className: "min-h-screen font-sans" },
            React.createElement(Header, null),
            React.createElement("main", { className: "p-4 md:p-8" },
                renderContent()
            )
        )
    );
}

export default App;
