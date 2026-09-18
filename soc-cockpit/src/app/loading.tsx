export default function Loading() {
  return (
    <div className="h-full p-6 flex flex-col gap-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-semibold">Global Threat Grid</h2>
          <p className="text-slate-400 text-sm mt-1">Monitoring active perimeter defense systems.</p>
        </div>
        <div className="text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-md text-slate-500 font-mono">
          STATUS: LOADING TELEMETRY...
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

        {/* Radar Telemetry Loader */}
        <div className="z-10 flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
            {/* Radar Sweep Animation Base */}
            <div className="absolute w-[400px] h-[400px] border border-slate-700/50 rounded-full animate-ping opacity-20"></div>
            <div className="absolute w-[250px] h-[250px] border border-emerald-900/40 rounded-full flex items-center justify-center">
                 <div className="w-1 h-1/2 bg-gradient-to-t from-emerald-500/0 to-emerald-500/50 absolute top-0 origin-bottom animate-spin" style={{ animationDuration: '2s' }}></div>
            </div>
            <div className="absolute w-[100px] h-[100px] border border-slate-600/50 rounded-full"></div>

            <div className="mt-[200px] font-mono text-emerald-500 text-sm tracking-widest uppercase animate-pulse">Establishing Secure Uplink...</div>
        </div>

        {/* Loading Skeletons */}
        <div className="z-10 bg-slate-950/80 p-2 space-y-2 opacity-60">
           {[...Array(3)].map((_, i) => (
             <div key={i} className="grid grid-cols-4 gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 animate-pulse">
               <div className="h-4 bg-slate-800 rounded w-24"></div>
               <div className="h-4 bg-slate-800 rounded w-32"></div>
               <div className="h-4 bg-slate-800 rounded w-28"></div>
               <div className="h-6 bg-slate-800 rounded w-20"></div>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
}
