const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let content = fs.readFileSync(file, 'utf8');

const strayModal = `        {showTriageModal && anomalyQueue && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="border border-slate-800 bg-slate-950 p-6 rounded-lg max-w-lg w-full font-mono shadow-xl relative">
              <button onClick={() => setShowTriageModal(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <h2 className="text-xl text-amber-500 mb-6 flex items-center gap-2">
                <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                ONYX AI TRIAGE REQUIRED
              </h2>

              <div className="space-y-4 text-sm mb-8">
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500">Target IP Address</span>
                  <span className="text-slate-300">{anomalyQueue.anomalyIp}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500">1-Hour Request Velocity</span>
                  <span className="text-red-400 font-bold">{anomalyQueue.requestCount1h} req/hr</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500">Staged Timestamp & Origin Details</span>
                  <span className="text-slate-300">{new Date(anomalyQueue.timestamp).toLocaleString()} (ONYX_ANOMALY_ENGINE)</span>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => handleTriageAnomaly('block')}
                  className="flex-1 bg-red-950 hover:bg-red-900 border border-red-500/50 text-red-500 py-3 rounded text-sm transition-colors"
                >
                  [ AUTO-BLOCK 24H ]
                </button>
                <button
                  onClick={() => handleTriageAnomaly('dismiss')}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 py-3 rounded text-sm transition-colors"
                >
                  [ DISMISS ]
                </button>
              </div>
            </div>
          </div>
        )}
`;

content = content.replace(strayModal, '');

const endOfMain = `      </main>`;
if (content.includes(endOfMain)) {
    content = content.replace(endOfMain, strayModal + '\n' + endOfMain);
} else {
    console.log('could not find end of main');
}

fs.writeFileSync(file, content, 'utf8');
