
"use client";
import React, { useState, useEffect } from 'react';

export default function OnyxPipeline() {
  const [targetValue, setTargetValue] = useState('');
  const [action, setAction] = useState('block_ip');
  const [threatId, setThreatId] = useState('11111111-1111-1111-1111-111111111111');
  const [dispatchState, setDispatchState] = useState<'idle' | 'pending' | 'acknowledged' | 'failed'>('idle');
  const [responseDetails, setResponseDetails] = useState<any>(null);

  const [fileHash, setFileHash] = useState('');
  const [coords, setCoords] = useState<{lat: number, lon: number} | null>(null);

  const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

  useEffect(() => {
     if (navigator.geolocation) {
         navigator.geolocation.getCurrentPosition((pos) => {
             setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
         }, (err) => {
             console.warn("Geolocation denied or failed", err);
         }, { timeout: 5000 });
     }
  }, []);

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

  const handleQuarantine = async () => {
     if (!targetValue) return;
     if (action === 'block_ip' && !ipv4Regex.test(targetValue) && !ipv6Regex.test(targetValue)) {
         setResponseDetails({ error: "Invalid IP Address format for 1-Click Quarantine." });
         setDispatchState('failed');
         return;
     }

     setDispatchState('pending');
     try {
         const res = await fetch(process.env.NEXT_PUBLIC_INTERCEPTOR_URL + '/blocklist', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                 action: 'block',
                 ip: targetValue,
                 ttl: 86400
             })
         });
         const data = await res.json();
         if (res.ok) {
             setDispatchState('acknowledged');
             setResponseDetails(data);
         } else {
             setDispatchState('failed');
             setResponseDetails(data);
         }
     } catch (e) {
         setDispatchState('failed');
         setResponseDetails({ error: String(e) });
     }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
          setResponseDetails({ error: "Invalid MIME type. Must be image or video." });
          return;
      }
      if (file.size > 50 * 1024 * 1024) {
          setResponseDetails({ error: "File exceeds 50MB limit." });
          return;
      }

      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setFileHash(hashHex);
  };

  return (
    <div className="bg-[#0B0F19] border border-slate-800 rounded p-6 font-mono text-slate-300">
       <h3 className="text-lg mb-4 text-[#FDD023]">Onyx Action Agent Pipeline</h3>

       <div className="flex flex-col gap-4 max-w-md">
          {/* Drag-and-Drop Zone */}
          <div className="border-2 border-dashed border-slate-700 bg-[#111827] p-4 text-center text-sm text-slate-400 rounded relative hover:bg-slate-800">
              <input type="file" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              Drop Media Here for Analysis<br/>
              (Images/Video, Max 50MB)
              {fileHash && <div className="mt-2 text-[10px] text-emerald-500 truncate">SHA256: {fileHash}</div>}
          </div>

          <div className="bg-[#111827] p-2 text-xs border border-slate-800 rounded flex justify-between">
              <span>Geo-Telemetry:</span>
              <span className={coords ? "text-emerald-500" : "text-amber-500"}>
                 {coords ? coords.lat.toFixed(4) + ", " + coords.lon.toFixed(4) : "Locating..."}
              </span>
          </div>

          <input
             type="text"
             placeholder="Threat UUID"
             value={threatId}
             onChange={e => setThreatId(e.target.value)}
             className="bg-[#1F2937] border border-slate-700 p-2 rounded text-slate-200"
          />

          <select
             value={action}
             onChange={e => setAction(e.target.value)}
             className="bg-[#1F2937] border border-slate-700 p-2 rounded text-slate-200"
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
             className="bg-[#1F2937] border border-slate-700 p-2 rounded text-slate-200"
          />

          <div className="flex gap-2">
              <button
                 onClick={handleDispatch}
                 disabled={dispatchState === 'pending' || !targetValue || !threatId}
                 className="flex-1 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded disabled:opacity-50 text-sm"
              >
                 {dispatchState === 'pending' ? 'Dispatching...' : 'Dispatch Action'}
              </button>

              <button
                 onClick={handleQuarantine}
                 disabled={dispatchState === 'pending' || !targetValue}
                 className="flex-1 bg-red-600 hover:bg-red-700 text-white p-2 rounded disabled:opacity-50 text-sm"
              >
                 1-Click Quarantine
              </button>
          </div>
       </div>

       <div className="mt-6">
          <h4 className="text-sm font-bold mb-2">Execution Status</h4>
          <div className="flex items-center gap-2 mb-2">
             <span className={"w-3 h-3 rounded-full " + (dispatchState === 'idle' ? 'bg-slate-500' : dispatchState === 'pending' ? 'bg-amber-500 animate-pulse' : dispatchState === 'acknowledged' ? 'bg-emerald-500' : 'bg-red-500')}></span>
             <span className="uppercase text-xs font-bold">{dispatchState}</span>
          </div>
          {responseDetails && (
             <pre className="text-[10px] bg-black border border-slate-800 p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(responseDetails, null, 2)}
             </pre>
          )}
       </div>
    </div>
  );
}
