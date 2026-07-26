const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let content = fs.readFileSync(file, 'utf8');

const bulkReplayFunc = `  const handleBulkReplayDLQ = async () => {
    if (selectedDlqIds.length === 0) return;
    setIsBatchProcessing(true);
    try {
      const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
      const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(\`\${workerUrl}/dlq/bulk-replay\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Asguard-Auth': apiKey || '',
        },
        body: JSON.stringify({ ids: selectedDlqIds }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error("Bulk replay failed");

      setDlqRecords(prev => prev.filter(r => !selectedDlqIds.includes(r.id)));
      setSelectedDlqIds([]);
      addToast("[ BULK REPLAY COMPLETE ]", "success");
    } catch (err) {
      addToast("Bulk replay failed", "error");
    } finally {
      setIsBatchProcessing(false);
    }
  };
`;

content = content.replace('  const handleBulkUnquarantine = async () => {', bulkReplayFunc + '\n  const handleBulkUnquarantine = async () => {');

const checkboxReplacement = `{dlqView === 'quarantined' ? (
                       <input
                          type="checkbox"
                          className="accent-amber-500 bg-slate-900 border-slate-700 cursor-pointer"
                          checked={selectedDlqIds.length > 0 && selectedDlqIds.length === filteredDlq.filter(r => r.id).length}
                          onChange={(e) => {
                             if (e.target.checked) {
                                setSelectedDlqIds(filteredDlq.map(r => r.id).filter((id): id is string => !!id));
                             } else {
                                setSelectedDlqIds([]);
                             }
                          }}
                       />
                    ) : (
                       <input
                          type="checkbox"
                          className="accent-emerald-500 bg-slate-900 border-slate-700 cursor-pointer"
                          checked={selectedDlqIds.length > 0 && selectedDlqIds.length === filteredDlq.filter(r => r.id).length}
                          onChange={(e) => {
                             if (e.target.checked) {
                                setSelectedDlqIds(filteredDlq.map(r => r.id).filter((id): id is string => !!id));
                             } else {
                                setSelectedDlqIds([]);
                             }
                          }}
                       />
                    )}`;

content = content.replace(`{dlqView === 'quarantined' && (
                       <input
                          type="checkbox"
                          className="accent-amber-500 bg-slate-900 border-slate-700 cursor-pointer"
                          checked={selectedDlqIds.length > 0 && selectedDlqIds.length === filteredDlq.filter(r => r.id).length}
                          onChange={(e) => {
                             if (e.target.checked) {
                                setSelectedDlqIds(filteredDlq.map(r => r.id).filter((id): id is string => !!id));
                             } else {
                                setSelectedDlqIds([]);
                             }
                          }}
                       />
                    )}`, checkboxReplacement);

const actionReplacement = `{dlqView === 'quarantined' && selectedDlqIds.length > 0 && (
                       <button
                          onClick={handleBulkUnquarantine}
                          disabled={isBatchProcessing}
                          className="text-[10px] bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800 px-2 py-1 rounded transition-colors"
                       >
                          {isBatchProcessing ? "[ PROCESSING... ]" : "[ UNQUARANTINE SELECTED ]"}
                       </button>
                    )}
                    {dlqView === 'active' && selectedDlqIds.length > 0 && (
                       <button
                          onClick={handleBulkReplayDLQ}
                          disabled={isBatchProcessing}
                          className="text-[10px] bg-amber-950/40 hover:bg-amber-900/60 text-amber-400 border border-amber-800 px-2 py-1 rounded transition-colors font-mono"
                       >
                          {isBatchProcessing ? "[ PROCESSING... ]" : \`[ REPLAY SELECTED (\${selectedDlqIds.length}) ]\`}
                       </button>
                    )}`;

content = content.replace(`{dlqView === 'quarantined' && selectedDlqIds.length > 0 && (
                       <button
                          onClick={handleBulkUnquarantine}
                          disabled={isBatchProcessing}
                          className="text-[10px] bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800 px-2 py-1 rounded transition-colors"
                       >
                          {isBatchProcessing ? "[ PROCESSING... ]" : "[ UNQUARANTINE SELECTED ]"}
                       </button>
                    )}`, actionReplacement);

const rowCheckboxReplacement = `{(dlqView === 'quarantined' || dlqView === 'active') && event.id && (
                           <input
                              type="checkbox"
                              className={\`\${dlqView === 'quarantined' ? 'accent-amber-500' : 'accent-emerald-500'} bg-slate-900 border-slate-700\`}
                              checked={selectedDlqIds.includes(event.id)}
                              onChange={(e) => {
                                 if (e.target.checked && event.id) {
                                    setSelectedDlqIds(prev => [...prev, event.id!]);
                                 } else {
                                    setSelectedDlqIds(prev => prev.filter(id => id !== event.id));
                                 }
                              }}
                           />
                        )}`;

content = content.replace(`{dlqView === 'quarantined' && event.id && (
                           <input
                              type="checkbox"
                              className="accent-amber-500 bg-slate-900 border-slate-700"
                              checked={selectedDlqIds.includes(event.id)}
                              onChange={(e) => {
                                 if (e.target.checked && event.id) {
                                    setSelectedDlqIds(prev => [...prev, event.id!]);
                                 } else {
                                    setSelectedDlqIds(prev => prev.filter(id => id !== event.id));
                                 }
                              }}
                           />
                        )}`, rowCheckboxReplacement);


fs.writeFileSync(file, content);
console.log("Done");
