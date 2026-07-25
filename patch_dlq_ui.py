import re

with open('soc-cockpit/src/components/LiveThreatFeed.tsx', 'r') as f:
    content = f.read()

# Fix grid cols header
old_header = """<div className="grid grid-cols-5 gap-4 mb-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
                     <div>Timestamp</div>
                     <div>Origin Node</div>
                     <div>Dropped Route</div>
                     <div>Error Details</div>
                     <div className="text-right">Actions</div>
                  </div>"""

new_header = """<div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-4 mb-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
                     <div className="w-8 flex items-center justify-center">
                        {dlqView === 'quarantined' && (
                           <input
                              type="checkbox"
                              className="accent-amber-500 bg-slate-900 border-slate-700"
                              checked={selectedDlqIds.length > 0 && selectedDlqIds.length === filteredDlq.filter(r => r.id).length}
                              onChange={(e) => {
                                 if (e.target.checked) {
                                    setSelectedDlqIds(filteredDlq.map(r => r.id).filter((id): id is string => !!id));
                                 } else {
                                    setSelectedDlqIds([]);
                                 }
                              }}
                           />
                        )}
                     </div>
                     <div>Timestamp</div>
                     <div>Origin Node</div>
                     <div>Dropped Route</div>
                     <div>Error Details</div>
                     <div className="text-right flex items-center justify-end gap-2">
                        {dlqView === 'quarantined' && selectedDlqIds.length > 0 && (
                           <button
                              onClick={handleBulkUnquarantine}
                              disabled={isBatchProcessing}
                              className="text-[10px] bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800 px-2 py-1 rounded transition-colors"
                           >
                              {isBatchProcessing ? "[ PROCESSING... ]" : "[ UNQUARANTINE SELECTED ]"}
                           </button>
                        )}
                        Actions
                     </div>
                  </div>"""

content = content.replace(old_header, new_header)

old_row = """<div key={`${event.originNode || "origin"}-${event.timestamp}-${idx}`} className="grid grid-cols-5 gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 hover:bg-slate-800/50 transition-colors text-sm text-slate-300 font-mono">
                     <div className="text-slate-500 font-mono">
                        {new Date(event.timestamp).toLocaleString('en-GB')}
                     </div>"""

new_row = """<div key={`${event.originNode || "origin"}-${event.timestamp}-${idx}`} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-4 items-center p-3 rounded bg-slate-900/40 border border-slate-800 hover:bg-slate-800/50 transition-colors text-sm text-slate-300 font-mono">
                     <div className="w-8 flex items-center justify-center">
                        {dlqView === 'quarantined' && event.id && (
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
                        )}
                     </div>
                     <div className="text-slate-500 font-mono">
                        {new Date(event.timestamp).toLocaleString('en-GB')}
                     </div>"""

content = content.replace(old_row, new_row)

with open('soc-cockpit/src/components/LiveThreatFeed.tsx', 'w') as f:
    f.write(content)
