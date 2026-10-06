
"use client";
import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const MOCK_ATTACKS = [
  { id: '1', lat: 37.7749, lng: -122.4194, severity: 'high', country: 'US' },
  { id: '2', lat: 51.5074, lng: -0.1278, severity: 'medium', country: 'UK' },
  { id: '3', lat: 35.6895, lng: 139.6917, severity: 'low', country: 'JP' },
];

export default function GlobalThreatMap() {
  const [mounted, setMounted] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [streamedAttacks, setStreamedAttacks] = useState<any[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const supabaseRef = useRef<any>(null);

  useEffect(() => {
    supabaseRef.current = createClient(supabaseUrl || 'https://mock.supabase.co', supabaseKey || 'mock-key');
    setMounted(true);
  }, [supabaseUrl, supabaseKey]);

  useEffect(() => {
    if (!mounted || !supabaseRef.current) return;

    if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || !supabaseUrl || !supabaseKey) {
        setStreamConnected(true);
        const interval = setInterval(() => {
            setStreamedAttacks(prev => {
                const randomAttack = MOCK_ATTACKS[Math.floor(Math.random() * MOCK_ATTACKS.length)];
                return [{ ...randomAttack, timestamp: Date.now() }, ...prev].slice(0, 100);
            });
        }, 2000);
        return () => clearInterval(interval);
    }

    const channel = supabaseRef.current
      .channel('schema-db-changes-map')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'threat_events',
        },
        (payload: any) => {
          // Use actual coordinates if they exist, otherwise fallback
          let lat = payload.new.metadata?.geo_lat;
          let lng = payload.new.metadata?.geo_lon;
          if (lat == null || lng == null) {
              lat = MOCK_ATTACKS[Math.floor(Math.random() * MOCK_ATTACKS.length)].lat;
              lng = MOCK_ATTACKS[Math.floor(Math.random() * MOCK_ATTACKS.length)].lng;
          }

          setStreamedAttacks((prev) => [{...payload.new, lat, lng, timestamp: Date.now()}, ...prev].slice(0, 100));
        }
      )
      .subscribe((status: any) => {
         if (status === 'SUBSCRIBED') {
            setStreamConnected(true);
         } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            setStreamConnected(false);
         }
      });

    return () => {
      if (supabaseRef.current) {
        supabaseRef.current.removeChannel(channel);
      }
    };
  }, [mounted, supabaseUrl, supabaseKey]);

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

    const render = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = '#1e293b';
      // Render simple dots for map background
      for(let i=0; i<50; i++) {
         ctx.beginPath();
         ctx.arc(Math.random() * width, Math.random() * height, 1, 0, Math.PI * 2);
         ctx.fill();
      }

      const itemsToRender = streamedAttacks.length > 0 ? streamedAttacks : MOCK_ATTACKS;

      if (Array.isArray(itemsToRender)) {
          itemsToRender.forEach((attack) => {
            const lng = attack?.lng || 0;
            const x = ((lng + 180) / 360) * width;
            const lat = attack?.lat || 0;
            const y = ((90 - lat) / 180) * height;

            const isHighSeverity = attack?.verdict === 'block' || attack?.severity === 'high';

            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = isHighSeverity ? '#ef4444' : '#00f0ff';
            ctx.fill();
          });
      }

      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [mounted, streamedAttacks]);

  if (!mounted) return null;

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[#0B0F19] rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center">
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
          <span className={"w-2 h-2 rounded-full " + (streamConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500')}></span>
          Global Threat Map
        </h3>
      </div>
      <canvas ref={canvasRef} className="w-full h-full opacity-80" />
    </div>
  );
}
