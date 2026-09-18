'use client'; // Error components must be Client Components

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="h-full p-6 flex flex-col gap-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-semibold">Global Threat Grid</h2>
          <p className="text-slate-400 text-sm mt-1">Monitoring active perimeter defense systems.</p>
        </div>
        <div className="text-xs bg-amber-950/50 border border-amber-900 px-3 py-1.5 rounded-md text-amber-400 font-mono">
          STATUS: CONNECTION ALERT
        </div>
      </div>

      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg relative overflow-hidden flex items-center justify-center">
        {/* Grid Pattern Background */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        ></div>

        <div className="z-10 text-center flex flex-col items-center gap-4 p-8 bg-slate-900/80 backdrop-blur-sm rounded-xl border border-amber-900/50">
           <svg className="w-12 h-12 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
           </svg>
           <div>
            <h3 className="text-lg font-medium text-slate-300">Telemetry Stream Disconnected</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">Failed to fetch the live threat feed. Please check the network connection to the interceptor node.</p>
           </div>
           <button
             onClick={() => reset()}
             className="mt-4 px-6 py-2 bg-emerald-900/50 hover:bg-emerald-800/80 text-emerald-400 rounded-md text-sm font-mono transition-all border border-emerald-800 shadow-[0_0_15px_rgba(4,120,87,0.3)] flex items-center gap-2"
           >
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
             Retry Stream / Recover Session
           </button>
        </div>
      </div>
    </div>
  );
}
