import { AltitudeUnit } from '../types.js';

const AircraftCard = ({ aircraft }) => {
    const timeSinceSeen = Math.round((Date.now() - aircraft.lastSeen) / 1000);
    const opacity = Math.max(0.3, 1 - timeSinceSeen / 30);

    const callsign = aircraft.callsign?.trim() || 'N/A';

    return (
        React.createElement("div", { className: "bg-gray-800 rounded-lg p-3 border border-gray-700 transition-opacity duration-500", style: { opacity } },
            React.createElement("div", { className: "flex justify-between items-center mb-2" },
                React.createElement("h4", { className: "text-md font-bold text-cyan-400" }, callsign),
                React.createElement("span", { className: "text-xs font-mono bg-gray-700 text-gray-300 px-2 py-1 rounded" }, aircraft.icao.toString(16).toUpperCase())
            ),
            React.createElement("div", { className: "grid grid-cols-2 gap-2 text-sm" },
                React.createElement("div", null, React.createElement("p", { className: "text-gray-400" }, "Altitude"), React.createElement("p", null, aircraft.altitude ? `${Math.round(aircraft.altitude)} ${aircraft.unit === AltitudeUnit.FEET ? 'ft' : 'm'}` : 'N/A')),
                React.createElement("div", null, React.createElement("p", { className: "text-gray-400" }, "Speed"), React.createElement("p", null, aircraft.speed ? `${Math.round(aircraft.speed)} kts` : 'N/A')),
                React.createElement("div", null, React.createElement("p", { className: "text-gray-400" }, "Heading"), React.createElement("p", null, aircraft.heading != null ? `${Math.round(aircraft.heading)}°` : 'N/A')),
                 React.createElement("div", null, React.createElement("p", { className: "text-gray-400" }, "Seen"), React.createElement("p", null, `${timeSinceSeen}s ago`))
            )
        )
    );
};

export default AircraftCard;
