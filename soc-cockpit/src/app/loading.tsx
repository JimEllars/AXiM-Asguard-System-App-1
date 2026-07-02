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

        {/* Loading Skeletons */}
        <div className="z-10 flex-1 overflow-y-auto p-2 space-y-2">
           {[...Array(5)].map((_, i) => (
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
