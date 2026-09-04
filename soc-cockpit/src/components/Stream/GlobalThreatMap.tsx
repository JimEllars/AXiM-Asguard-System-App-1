import React, { useEffect, useState, useRef } from 'react';

const MOCK_ATTACKS = [
  { id: 1, lat: 55.7558, lng: 37.6173, country: 'RU', intensity: 8, severity: 'high' },
  { id: 2, lat: 39.9042, lng: 116.4074, country: 'CN', intensity: 7, severity: 'high' },
  { id: 3, lat: -15.7938, lng: -47.8827, country: 'BR', intensity: 5, severity: 'medium' },
  { id: 4, lat: 38.9072, lng: -77.0369, country: 'US', intensity: 4, severity: 'low' },
  { id: 5, lat: 51.5074, lng: -0.1278, country: 'UK', intensity: 6, severity: 'high' },
  { id: 6, lat: 28.6139, lng: 77.2090, country: 'IN', intensity: 5, severity: 'medium' },
];

export default function GlobalThreatMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pulses, setPulses] = useState<{index: number, timestamp: number}[]>([]);

  // Animation and resize logic for WebGL/Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = container.clientWidth;
    let height = container.clientHeight;

    const resize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = width;
      canvas.height = height;
    };

    window.addEventListener('resize', resize);
    resize();

    // Pulse generator
    const pulseInterval = setInterval(() => {
      const index = Math.floor(Math.random() * MOCK_ATTACKS.length);
      setPulses(prev => {
        const now = Date.now();
        const active = prev.filter(p => now - p.timestamp < 2000); // keep alive for 2 seconds
        return [...active, { index, timestamp: now }];
      });
    }, 800);

    const render = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      const now = Date.now();

      // Draw world map approximation dots
      ctx.fillStyle = '#1e293b'; // slate-800
      const dots = [
        [0.25, 0.375], [0.2625, 0.4], [0.275, 0.35], [0.225, 0.325],
        [0.1875, 0.425], [0.35, 0.625], [0.3625, 0.675], [0.3375, 0.7],
        [0.5, 0.3], [0.525, 0.275], [0.5625, 0.25], [0.5375, 0.325],
        [0.6875, 0.375], [0.725, 0.35], [0.75, 0.4], [0.625, 0.5],
        [0.65, 0.55], [0.6375, 0.6]
      ];

      dots.forEach(([px, py]) => {
        ctx!.beginPath();
        ctx!.arc(px * width, py * height, 2, 0, Math.PI * 2);
        ctx!.fill();
      });

      // Render attacks
      MOCK_ATTACKS.forEach((attack, i) => {
        // Approximate lat/lng to canvas x/y
        const x = ((attack.lng + 180) / 360) * width;
        const y = ((90 - attack.lat) / 180) * height;

        const isHighSeverity = attack.severity === 'high';

        // Base dot
        ctx!.beginPath();
        ctx!.arc(x, y, 3, 0, Math.PI * 2);
        ctx!.fillStyle = isHighSeverity ? '#ef4444' : '#00f0ff'; // Crimson for high severity, Cyan for normal
        ctx!.fill();

        // Label
        ctx!.fillStyle = '#94a3b8'; // slate-400
        ctx!.font = '10px monospace';
        ctx!.fillText(attack.country, x + 8, y + 4);

        // Render active pulses
        const activePulses = pulses.filter(p => p.index === i);
        activePulses.forEach(pulse => {
          const age = now - pulse.timestamp;
          if (age < 2000) {
            const progress = age / 2000;
            const radius = 3 + (progress * attack.intensity * 4);
            const opacity = 1 - progress;

            ctx!.beginPath();
            ctx!.arc(x, y, radius, 0, Math.PI * 2);
            ctx!.strokeStyle = isHighSeverity ? `rgba(239, 68, 68, ${opacity})` : `rgba(0, 240, 255, ${opacity})`;
            ctx!.lineWidth = 2;
            ctx!.stroke();

            // Render trajectory arc to arbitrary center (representing Edge / Origin)
            const targetX = width / 2;
            const targetY = height / 2;

            ctx!.beginPath();
            ctx!.moveTo(x, y);
            // control point for arc
            const cpX = (x + targetX) / 2;
            const cpY = Math.min(y, targetY) - 50;
            ctx!.quadraticCurveTo(cpX, cpY, targetX, targetY);

            // Gradient for arc
            const grad = ctx!.createLinearGradient(x, y, targetX, targetY);
            if (isHighSeverity) {
               grad.addColorStop(0, `rgba(239, 68, 68, ${opacity * 0.5})`);
               grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
            } else {
               grad.addColorStop(0, `rgba(0, 240, 255, ${opacity * 0.5})`);
               grad.addColorStop(1, 'rgba(0, 240, 255, 0)');
            }

            ctx!.strokeStyle = grad;
            ctx!.lineWidth = 1;
            ctx!.stroke();
          }
        });
      });

      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener('resize', resize);
      clearInterval(pulseInterval);
      cancelAnimationFrame(animationFrameId);
    };
  }, [pulses]);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center p-4">
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21.128 12A10.01 10.01 0 0012 2.012A10.01 10.01 0 002.872 12A10.01 10.01 0 0012 21.988 10.01 10.01 0 0021.128 12z"></path></svg>
          Global Attack Map Visualizer
        </h3>
        <p className="text-xs text-slate-500 font-mono mt-1">Live threat burst vectors</p>
        <div className="flex gap-3 mt-2 font-mono text-[10px]">
           <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400"></span> <span className="text-slate-400">Blocked Edge Probes</span></div>
           <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span> <span className="text-slate-400">Quarantined Attacks</span></div>
        </div>
      </div>

      <canvas ref={canvasRef} className="w-full h-full opacity-80" />
    </div>
  );
}
