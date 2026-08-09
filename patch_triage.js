const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add handleTriageAnomaly
if (!content.includes('const handleTriageAnomaly = ')) {
  const insertIndex = content.indexOf('const handleCopyAuditRow');
  const handleTriageStr = `
  const handleTriageAnomaly = async (action: 'block' | 'dismiss') => {
    if (!anomalyQueue) return;

    try {
      const authKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY || '';
      const walletAddr = activeAccount?.address || 'UNKNOWN';
      const res = await fetch(\`\${workerUrl}/admin/anomaly/triage\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Asguard-Auth': authKey,
          'X-Asguard-Signature': walletAddr,
        },
        body: JSON.stringify({ ip: anomalyQueue.anomalyIp, action })
      });

      if (res.ok) {
        setAnomalyQueue(null);
        setShowTriageModal(false);
        fetchHealthState();
        setToasts(prev => [...prev, { id: Math.random().toString(), message: \`[ ANOMALY TRIAGED: \${action.toUpperCase()} ]\`, type: 'emerald' }]);
      } else {
        throw new Error('Failed to triage anomaly');
      }
    } catch (e) {
      console.error(e);
      setToasts(prev => [...prev, { id: Math.random().toString(), message: '[ TRIAGE FAILED ]', type: 'error' }]);
    }
  };

`;
  content = content.slice(0, insertIndex) + handleTriageStr + content.slice(insertIndex);
}

// 2. Add Anomaly Banner
if (!content.includes('ONYX ANOMALY QUEUE: IP')) {
  // Find where to place the banner, "above the telemetry grid"
  const gridIndex = content.indexOf('<div className="grid grid-cols-1 md:grid-cols-3 gap-6">');
  const bannerStr = `
          {anomalyQueue?.status === 'pending_onyx_triage' && (
            <div
              onClick={() => setShowTriageModal(true)}
              className="mb-6 border border-amber-500/50 bg-amber-500/10 rounded font-mono p-4 text-center text-sm text-amber-500 cursor-pointer hover:bg-amber-500/20 transition-colors animate-pulse"
            >
              [ ONYX ANOMALY QUEUE: IP {anomalyQueue.anomalyIp} ({anomalyQueue.requestCount1h} req/hr) STAGED FOR TRIAGE ]
            </div>
          )}
`;
  content = content.slice(0, gridIndex) + bannerStr + content.slice(gridIndex);
}

// 3. Add Triage Modal
if (!content.includes('Staged Timestamp & Origin Details')) {
  const modalIndex = content.lastIndexOf('</main>');
  const modalStr = `
        {showTriageModal && anomalyQueue && (
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
  content = content.slice(0, modalIndex) + modalStr + content.slice(modalIndex);
}

fs.writeFileSync(file, content, 'utf8');
console.log('Done');
