// === ICONS ===
const Icon = ({ path, className = "h-10 w-10 mx-auto mb-2 text-cyan-400" }) => (
    React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", className: className, viewBox: "0 0 20 20", fill: "currentColor" }, React.createElement("path", { fillRule: "evenodd", d: path, clipRule: "evenodd" }))
);
export const PlaneIcon = () => React.createElement(Icon, { path: "M19.129,10.532c-0.231-0.082-13.14-4.783-13.14-4.783s-0.54-0.197-0.788,0.177c-0.197,0.323-0.063,0.788,0.177,0.985l3.868,2.833H2.046c-0.552,0-1,0.448-1,1s0.448,1,1,1h7.201l-3.868,2.833c-0.24,0.197-0.375,0.662-0.177,0.985c0.248,0.375,0.788,0.177,0.788,0.177s12.909-4.701,13.14-4.783C19.562,11.23,19.562,10.772,19.129,10.532z" });
export const RadioIcon = () => React.createElement(Icon, { path: "M2 3a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1-1H3a1 1 0 01-1-1V3zm2 2v10h12V5H4zm2 2a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 4a1 1 0 100 2h4a1 1 0 100-2H7z" });
export const AmIcon = () => React.createElement(Icon, { path: "M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm2 0v10h10V5H5zm2.5 1.5a.5.5 0 00-.5.5v5a.5.5 0 00.5.5h.75a.5.5 0 00.5-.5V7a.5.5 0 00-.5-.5h-.75zM9.5 6a.5.5 0 00-.5.5v5a.5.5 0 00.5.5h.75a.5.5 0 00.5-.5V7.43l1.23 2.46a.5.5 0 00.66.22l.1-.05a.5.5 0 00.22-.66L11.07 7.5H12a.5.5 0 000-1h-2.5z" });
export const CloudIcon = () => React.createElement(Icon, { path: "M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" });
export const SpectrumIcon = () => React.createElement(Icon, { path: "M3 10a1 1 0 011-1h1.5a1 1 0 011 1v5a1 1 0 01-1 1H4a1 1 0 01-1-1v-5zM9 5a1 1 0 011-1h1.5a1 1 0 011 1v10a1 1 0 01-1 1H10a1 1 0 01-1-1V5zM15 8a1 1 0 011-1h1.5a1 1 0 011 1v7a1 1 0 01-1 1H16a1 1 0 01-1-1V8z" });
export const WifiIcon = ({ className = "h-8 w-8 mr-3" }) => React.createElement(Icon, { className: className, path: "M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071a10 10 0 0114.142 0M1.393 9.393a15 15 0 0121.214 0" });
export const UsbIcon = () => React.createElement(Icon, { className: "h-6 w-6 mr-2 inline", path: "M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" });

// === BUTTON ===
export const Button = ({ children, onClick, disabled = false, fullWidth = false, primary = false, ...rest }) => (
    React.createElement("button", { onClick: onClick, disabled: disabled, className: `flex items-center justify-center px-6 py-4 font-bold rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-cyan-500 ${fullWidth ? 'w-full' : ''} ${primary ? 'bg-cyan-600 text-white hover:bg-cyan-500' : 'bg-gray-700 hover:bg-gray-600'} disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed`, ...rest },
        children
    )
);

// === CARD ===
export const Card = ({ children, className }) => React.createElement("div", { className: `bg-gray-800/80 backdrop-blur-sm rounded-lg p-6 border border-gray-700 shadow-lg ${className}` }, children);
