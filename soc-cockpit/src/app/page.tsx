export default function Home() {
  return (
    <div className="h-full p-6 flex flex-col gap-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-semibold">Global Threat Grid</h2>
          <p className="text-slate-400 text-sm mt-1">Monitoring active perimeter defense systems.</p>
        </div>
        <div className="text-xs bg-slate-800 px-3 py-1.5 rounded-md text-slate-300 font-mono">
          STATUS: ACTIVATING BASELINE TELEMETRY
        </div>
      </div>

      {/* Empty Grid for Threat Map */}
      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg relative overflow-hidden flex items-center justify-center">
        {/* Grid Pattern Background */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        ></div>

        <div className="z-10 text-center flex flex-col items-center gap-4 p-8 bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800">
           <svg className="w-12 h-12 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
           <div>
            <h3 className="text-lg font-medium text-slate-300">Visualization Layer Offline</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">Threat telemetry data binding is currently in progress. The visualization grid will be available upon completion of the telemetry contracts.</p>
           </div>
        </div>
      </div>
    </div>
  );
}
