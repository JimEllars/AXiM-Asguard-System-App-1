import React, { useEffect, useState } from 'react';

const MOCK_ATTACKS = [
  { id: 1, lat: 55.7558, lng: 37.6173, country: 'RU', intensity: 8 }, // Moscow
  { id: 2, lat: 39.9042, lng: 116.4074, country: 'CN', intensity: 7 }, // Beijing
  { id: 3, lat: -15.7938, lng: -47.8827, country: 'BR', intensity: 5 }, // Brasilia
  { id: 4, lat: 38.9072, lng: -77.0369, country: 'US', intensity: 4 }, // Washington
];

export default function GlobalThreatMap() {
  const [pulses, setPulses] = useState<number[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newPulse = Math.floor(Math.random() * MOCK_ATTACKS.length);
      setPulses(prev => [...prev.slice(-4), newPulse]);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full relative bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center p-4">
      <div className="absolute top-4 left-4 z-10">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21.128 12A10.01 10.01 0 0012 2.012A10.01 10.01 0 002.872 12A10.01 10.01 0 0012 21.988 10.01 10.01 0 0021.128 12z"></path></svg>
          Global Attack Map Visualizer
        </h3>
        <p className="text-xs text-slate-500 font-mono mt-1">Live threat burst vectors</p>
      </div>

      <svg viewBox="0 0 800 400" className="w-full h-full opacity-80" preserveAspectRatio="xMidYMid meet">
        {/* Simple world map approximation dots */}
        <g className="fill-slate-800">
          <circle cx="200" cy="150" r="2" />
          <circle cx="210" cy="160" r="2" />
          <circle cx="220" cy="140" r="2" />
          <circle cx="180" cy="130" r="2" />
          <circle cx="150" cy="170" r="2" />
          <circle cx="280" cy="250" r="2" />
          <circle cx="290" cy="270" r="2" />
          <circle cx="270" cy="280" r="2" />
          <circle cx="400" cy="120" r="2" />
          <circle cx="420" cy="110" r="2" />
          <circle cx="450" cy="100" r="2" />
          <circle cx="430" cy="130" r="2" />
          <circle cx="550" cy="150" r="2" />
          <circle cx="580" cy="140" r="2" />
          <circle cx="600" cy="160" r="2" />
          <circle cx="500" cy="200" r="2" />
          <circle cx="520" cy="220" r="2" />
          <circle cx="510" cy="240" r="2" />
        </g>

        {/* Render Attack Nodes */}
        {MOCK_ATTACKS.map((attack, index) => {
          // Approximate lat/lng to svg x/y
          const x = (attack.lng + 180) * (800 / 360);
          const y = (90 - attack.lat) * (400 / 180);
          const isPulsing = pulses.includes(index);

          return (
            <g key={attack.id} transform={`translate(${x}, ${y})`}>
              <circle
                cx="0" cy="0" r={attack.intensity}
                className={`fill-red-500 ${isPulsing ? 'animate-ping' : ''}`}
                opacity="0.8"
              />
              {isPulsing && (
                <circle
                  cx="0" cy="0" r={attack.intensity * 3}
                  className="fill-transparent stroke-red-400 stroke-2 animate-pulse"
                />
              )}
              <text x="10" y="4" className="text-[8px] fill-slate-400 font-mono">{attack.country}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
