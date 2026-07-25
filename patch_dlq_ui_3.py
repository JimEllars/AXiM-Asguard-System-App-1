import re

with open('soc-cockpit/src/components/LiveThreatFeed.tsx', 'r') as f:
    content = f.read()

# Fix header grid cols (the first replace might have missed the exact match)
old_header = """<div className="grid grid-cols-5 gap-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4">
                 <div>Timestamp</div>
                 <div>Origin Node</div>
                 <div>Dropped Route</div>
                 <div>Error Reason</div>
                 <div>Action</div>
              </div>"""

new_header = """<div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-4 mb-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 font-mono">
                 <div className="w-8 flex items-center justify-center">
                    {dlqView === 'quarantined' && (
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
                    )}
                 </div>
                 <div>Timestamp</div>
                 <div>Origin Node</div>
                 <div>Dropped Route</div>
                 <div>Error Reason</div>
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

with open('soc-cockpit/src/components/LiveThreatFeed.tsx', 'w') as f:
    f.write(content)
