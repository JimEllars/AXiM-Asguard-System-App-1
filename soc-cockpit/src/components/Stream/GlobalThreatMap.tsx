import React, { useEffect, useRef, useState } from 'react';

const MOCK_ATTACKS = [
  { id: 1, lat: 40.7128, lng: -74.0060, country: 'US', intensity: 8, severity: 'critical' },
  { id: 2, lat: 35.6762, lng: 139.6503, country: 'JP', intensity: 6, severity: 'high' },
  { id: 3, lat: -15.7938, lng: -47.8827, country: 'BR', intensity: 5, severity: 'medium' },
  { id: 4, lat: 38.9072, lng: -77.0369, country: 'US', intensity: 4, severity: 'low' },
  { id: 5, lat: 51.5074, lng: -0.1278, country: 'UK', intensity: 6, severity: 'high' },
  { id: 6, lat: 28.6139, lng: 77.2090, country: 'IN', intensity: 5, severity: 'medium' },
];

interface ThreatEvent {
  id: string;
  lat: number;
  lng: number;
  country: string;
  severity: string;
  timestamp: number;
}

export default function GlobalThreatMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  const [streamedAttacks, setStreamedAttacks] = useState<ThreatEvent[]>([]);
  const [pulses, setPulses] = useState<{id: string, lat: number, lng: number, severity: string, timestamp: number}[]>([]);
  const [streamConnected, setStreamConnected] = useState<boolean>(true);
  const [packetLatency, setPacketLatency] = useState<number>(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout;
    let retryCount = 0;

    const connectStream = () => {
      try {
        eventSource = new EventSource('/api/ingest/stream');

        eventSource.onopen = () => {
          setStreamConnected(true);
          retryCount = 0;
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'ping') {
               const latency = Date.now() - new Date(data.timestamp).getTime();
               setPacketLatency(latency);
               return;
            }
            if (data.type === 'connected') return;

            setStreamedAttacks(prev => {
              const updated = [data, ...prev].slice(0, 100);
              return updated;
            });

            setPulses(prev => {
              const now = Date.now();
              const active = prev.filter(p => now - p.timestamp < 2000);
              return [...active, {
                id: data.id || Math.random().toString(36).substr(2, 9),
                lat: data.lat || 0,
                lng: data.lng || 0,
                severity: data.severity || 'low',
                timestamp: now
              }];
            });
          } catch (err) {
            console.error("Error parsing stream event", err);
          }
        };

        eventSource.onerror = (e) => {
          console.error("Stream map connection error", e);
          if (eventSource) {
            eventSource.close();
          }
          setStreamConnected(false);
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
          retryCount++;
          reconnectTimeout = setTimeout(connectStream, delay);
        };
      } catch (e) {
        setStreamConnected(false);
      }
    };

    connectStream();

    return () => {
      clearTimeout(reconnectTimeout);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;

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

    const pulseInterval = setInterval(() => {
      if (streamedAttacks.length === 0) {
        const mockAttack = MOCK_ATTACKS[Math.floor(Math.random() * MOCK_ATTACKS.length)];
        setPulses(prev => {
          const now = Date.now();
          const active = prev.filter(p => now - p.timestamp < 2000);
          return [...active, {
            id: mockAttack.id.toString() + now,
            lat: mockAttack.lat,
            lng: mockAttack.lng,
            severity: mockAttack.severity,
            timestamp: now
          }];
        });
      }
    }, 800);

    const render = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      const now = Date.now();

      ctx.fillStyle = '#1e293b';
      const dots = [
        [0.25, 0.375], [0.2625, 0.4], [0.275, 0.35], [0.225, 0.325],
        [0.1875, 0.425], [0.35, 0.625], [0.3625, 0.675], [0.3375, 0.7],
        [0.5, 0.3], [0.525, 0.275], [0.5625, 0.25], [0.5375, 0.325],
        [0.6875, 0.375], [0.725, 0.35], [0.75, 0.4], [0.625, 0.5],
        [0.65, 0.55], [0.6375, 0.6]
      ];

      dots.forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(px * width, py * height, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      const itemsToRender = streamedAttacks.length > 0 ? streamedAttacks : MOCK_ATTACKS;

      itemsToRender.forEach((attack) => {
        const x = ((attack.lng + 180) / 360) * width;
        const y = ((90 - attack.lat) / 180) * height;

        const isHighSeverity = attack.severity === 'high' || attack.severity === 'critical';

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = isHighSeverity ? '#ef4444' : '#00f0ff';
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(attack.country || 'XX', x + 8, y + 4);
      });

      pulses.forEach(pulse => {
        const x = ((pulse.lng + 180) / 360) * width;
        const y = ((90 - pulse.lat) / 180) * height;
        const isHighSeverity = pulse.severity === 'high' || pulse.severity === 'critical';
        const age = now - pulse.timestamp;

        if (age < 2000) {
          const progress = age / 2000;
          const radius = 3 + (progress * 32);
          const opacity = 1 - progress;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = isHighSeverity ? `rgba(239, 68, 68, ${opacity})` : `rgba(0, 240, 255, ${opacity})`;
          ctx.lineWidth = 2;
          ctx.stroke();

          const targetX = width / 2;
          const targetY = height / 2;

          ctx.beginPath();
          ctx.moveTo(x, y);
          const cpX = (x + targetX) / 2;
          const cpY = Math.min(y, targetY) - 50;
          ctx.quadraticCurveTo(cpX, cpY, targetX, targetY);

          const grad = ctx.createLinearGradient(x, y, targetX, targetY);
          if (isHighSeverity) {
             grad.addColorStop(0, `rgba(239, 68, 68, ${opacity * 0.5})`);
             grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
          } else {
             grad.addColorStop(0, `rgba(0, 240, 255, ${opacity * 0.5})`);
             grad.addColorStop(1, 'rgba(0, 240, 255, 0)');
          }

          ctx.strokeStyle = grad;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener('resize', resize);
      clearInterval(pulseInterval);
      cancelAnimationFrame(animationFrameId);
    };
  }, [mounted, pulses, streamedAttacks]);

  if (!mounted) {
    return (
      <div className="w-full h-full relative bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center p-4">
        <div className="border border-slate-800/50 bg-slate-950/20 rounded font-mono p-6 text-center text-xs text-slate-500">
          Loading Tactical View...
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center p-4">
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
          <svg className={`w-4 h-4 ${streamConnected ? 'text-emerald-500 animate-pulse' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21.128 12A10.01 10.01 0 0012 2.012A10.01 10.01 0 002.872 12A10.01 10.01 0 0012 21.988 10.01 10.01 0 0021.128 12z"></path></svg>
          Global Attack Map Visualizer
        </h3>
        {!streamConnected && (
          <div className="mt-1 text-[10px] text-red-400 font-mono bg-red-950/50 px-2 py-0.5 rounded border border-red-900/50 inline-block">
            [ CONNECTION LOST ]
          </div>
        )}
        <p className="text-xs text-slate-500 font-mono mt-1">Live threat burst vectors</p>
        <div className="flex gap-3 mt-2 font-mono text-[10px]">
           <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,240,255,0.8)]"></span> <span className="text-slate-400">Blocked Edge Probes</span></div>
           <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span> <span className="text-slate-400">Quarantined Attacks</span></div>
        </div>
        <div className="mt-2 text-[10px] text-slate-500 font-mono flex items-center gap-2">
            <span>PACKET LATENCY:</span>
            <span className={packetLatency > 500 ? 'text-amber-400' : 'text-emerald-400'}>{packetLatency}ms</span>
        </div>
      </div>

      <canvas ref={canvasRef} className="w-full h-full opacity-80" />
    </div>
  );
}
