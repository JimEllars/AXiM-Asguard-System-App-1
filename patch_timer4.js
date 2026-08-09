const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

const truncateWalletSearch = `
                     <div className="text-slate-400 truncate">
                        {event.authorizedByWallet || 'N/A'}
                     </div>
                     <div className="text-right">
                        <button
                           onClick={() => handleCopyAuditRow(event, rowId)}
                           className="font-mono text-[10px] text-slate-400 hover:text-white transition-colors uppercase cursor-pointer"
                        >
                           {copiedAuditRow === rowId ? <span className="text-emerald-400 bg-emerald-950/50 border border-emerald-900 px-1 py-0.5 rounded">[ COPIED! ]</span> : "[ COPY ]"}
                        </button>
                     </div>
`;

const truncateWalletReplace = `
                     <div className="text-slate-400 truncate flex items-center gap-2">
                        {event.authorizedByWallet && event.authorizedByWallet.length > 20
                            ? \`\${event.authorizedByWallet.slice(0, 6)}...\${event.authorizedByWallet.slice(-4)}\`
                            : (event.authorizedByWallet || 'N/A')}
                        {event.authorizedByWallet && (
                            <button
                               onClick={() => {
                                   navigator.clipboard.writeText(event.authorizedByWallet || '');
                                   addToast("[ WALLET ADDRESS COPIED ]", "success");
                               }}
                               className="font-mono text-[9px] text-cyan-400 hover:text-cyan-300 border border-cyan-800 hover:border-cyan-600 bg-cyan-950/30 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                            >
                               [ COPY ]
                            </button>
                        )}
                     </div>
                     <div className="text-right">
                        <button
                           onClick={() => handleCopyAuditRow(event, rowId)}
                           className="font-mono text-[10px] text-slate-400 hover:text-white transition-colors uppercase cursor-pointer"
                        >
                           {copiedAuditRow === rowId ? <span className="text-emerald-400 bg-emerald-950/50 border border-emerald-900 px-1 py-0.5 rounded">[ COPIED! ]</span> : "[ COPY ROW ]"}
                        </button>
                     </div>
`;

code = code.replace(truncateWalletSearch, truncateWalletReplace);

fs.writeFileSync(file, code);
