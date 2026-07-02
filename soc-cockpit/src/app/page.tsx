import React from 'react';
import { z } from 'zod';

const TelemetryPayloadSchema = z.object({
  sourceIp: z.string().ip(),
  timestamp: z.number(),
  eventType: z.enum(['authentication_failure', 'signature_tampering', 'suspicious_activity']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  details: z.record(z.unknown()).optional(),
});
type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;

// A mock data generator for when the real endpoint is unavailable
const generateMockData = (): TelemetryPayload[] => {
  return [
    {
      sourceIp: '192.168.1.55',
      timestamp: Date.now() - 1000 * 60 * 2, // 2 mins ago
      eventType: 'authentication_failure',
      severity: 'medium',
    },
    {
      sourceIp: '10.0.0.4',
      timestamp: Date.now() - 1000 * 60 * 15, // 15 mins ago
      eventType: 'suspicious_activity',
      severity: 'high',
    },
    {
      sourceIp: '172.16.0.12',
      timestamp: Date.now() - 1000 * 60 * 45, // 45 mins ago
      eventType: 'signature_tampering',
      severity: 'critical',
    },
  ];
};

async function getTelemetryData(): Promise<TelemetryPayload[]> {
  const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
  if (!workerUrl) {
    console.warn("NEXT_PUBLIC_INTERCEPTOR_URL is not set. Using mock data.");
    return generateMockData();
  }

  try {
    const res = await fetch(`${workerUrl}/telemetry`, {
      next: { revalidate: 10 }, // Revalidate every 10 seconds
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch telemetry: ${res.statusText}`);
    }
    const data = await res.json();
    return z.array(TelemetryPayloadSchema).parse(data);
  } catch (err) {
    console.error("Error fetching telemetry, returning mock data:", err);
    throw err; // Let the error boundary catch it
  }
}

export default async function Home() {
  const data = await getTelemetryData();

  const getSeverityColor = (severity: TelemetryPayload['severity']) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-950/50 border-red-900';
      case 'high': return 'text-orange-400 bg-orange-950/50 border-orange-900';
      case 'medium': return 'text-yellow-400 bg-yellow-950/50 border-yellow-900';
      case 'low': return 'text-blue-400 bg-blue-950/50 border-blue-900';
      default: return 'text-slate-400 bg-slate-900/50 border-slate-800';
    }
  };

  const getEventName = (eventType: TelemetryPayload['eventType']) => {
    switch (eventType) {
      case 'authentication_failure': return 'Auth Failure';
      case 'signature_tampering': return 'Sig Tamper';
      case 'suspicious_activity': return 'Suspicious';
      default: return eventType;
    }
  }

  return (
    <div className="h-full p-6 flex flex-col gap-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-semibold">Global Threat Grid</h2>
          <p className="text-slate-400 text-sm mt-1">Monitoring active perimeter defense systems.</p>
        </div>
        <div className="text-xs bg-emerald-950/50 border border-emerald-900 px-3 py-1.5 rounded-md text-emerald-400 font-mono">
          STATUS: TELEMETRY ACTIVE
        </div>
      </div>

      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg relative overflow-hidden flex flex-col">
        {/* Grid Pattern Background */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        ></div>

        {/* Header */}
        <div className="z-10 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 p-4 sticky top-0">
          <div className="grid grid-cols-4 gap-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
             <div>Timestamp</div>
             <div>Source IP</div>
             <div>Event Type</div>
             <div>Severity</div>
          </div>
        </div>

        {/* Data Feed */}
        <div className="z-10 flex-1 overflow-y-auto p-2 space-y-2">
           {data.length === 0 ? (
              <div className="text-center p-8 text-slate-500">No telemetry events logged yet.</div>
           ) : (
             data.map((event, idx) => (
               <div key={idx} className="grid grid-cols-4 gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 hover:bg-slate-800/50 transition-colors text-sm text-slate-300 font-mono">
                 <div className="text-slate-500">
                    {new Date(event.timestamp).toLocaleTimeString()}
                 </div>
                 <div className="text-slate-300">
                    {event.sourceIp}
                 </div>
                 <div>
                    {getEventName(event.eventType)}
                 </div>
                 <div>
                    <span className={`px-2 py-1 rounded text-xs border ${getSeverityColor(event.severity)}`}>
                      {event.severity.toUpperCase()}
                    </span>
                 </div>
               </div>
             ))
           )}
        </div>
      </div>
    </div>
  );
}
