"use client";
import React, { useState } from 'react';

export default function OnyxPipeline() {
  const [targetValue, setTargetValue] = useState('');
  const [action, setAction] = useState('block_ip');
  const [threatId, setThreatId] = useState('11111111-1111-1111-1111-111111111111');
  const [dispatchState, setDispatchState] = useState<'idle' | 'pending' | 'acknowledged' | 'failed'>('idle');
  const [responseDetails, setResponseDetails] = useState<any>(null);

  const handleDispatch = async () => {
    setDispatchState('pending');
    setResponseDetails(null);
    try {
       const res = await fetch('/api/v1/triage/dispatch', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
              threatId,
              action,
              severity: 'HIGH',
              targetValue
           })
       });

       const data = await res.json();
       if (res.ok && data.success) {
           setDispatchState('acknowledged');
           setResponseDetails(data);
       } else {
           setDispatchState('failed');
           setResponseDetails(data);
       }
    } catch(e) {
       setDispatchState('failed');
       setResponseDetails({ error: String(e) });
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded p-6 font-mono text-slate-300">
       <h3 className="text-lg mb-4 text-white">Onyx Action Agent Pipeline</h3>

       <div className="flex flex-col gap-4 max-w-md">
          <input
             type="text"
             placeholder="Threat UUID"
             value={threatId}
             onChange={e => setThreatId(e.target.value)}
             className="bg-slate-900 border border-slate-700 p-2 rounded"
          />

          <select
             value={action}
             onChange={e => setAction(e.target.value)}
             className="bg-slate-900 border border-slate-700 p-2 rounded"
          >
             <option value="block_ip">Block IP</option>
             <option value="quarantine_user">Quarantine User</option>
             <option value="revoke_session">Revoke Session</option>
             <option value="isolate_host">Isolate Host</option>
          </select>

          <input
             type="text"
             placeholder="Target Value (IP, Email, User)"
             value={targetValue}
             onChange={e => setTargetValue(e.target.value)}
             className="bg-slate-900 border border-slate-700 p-2 rounded"
          />

          <button
             onClick={handleDispatch}
             disabled={dispatchState === 'pending' || !targetValue || !threatId}
             className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded disabled:opacity-50"
          >
             {dispatchState === 'pending' ? 'Dispatching...' : 'Dispatch Mitigation Action'}
          </button>
       </div>

       <div className="mt-6">
          <h4 className="text-sm font-bold mb-2">Execution Status</h4>
          <div className="flex items-center gap-2 mb-2">
             <span className={`w-3 h-3 rounded-full ${dispatchState === 'idle' ? 'bg-slate-500' : dispatchState === 'pending' ? 'bg-amber-500 animate-pulse' : dispatchState === 'acknowledged' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
             <span className="uppercase text-xs font-bold">{dispatchState}</span>
          </div>
          {responseDetails && (
             <pre className="text-[10px] bg-slate-900 border border-slate-700 p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(responseDetails, null, 2)}
             </pre>
          )}
       </div>
    </div>
  );
}
