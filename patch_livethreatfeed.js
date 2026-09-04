const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let content = fs.readFileSync(file, 'utf8');

// I need to add: "Mark as False Positive & Replay" button
const newButtonStr = `
                <button
                  onClick={async () => {
                    const ip = selectedThreat.sourceIp;
                    const reqId = selectedThreat.id || selectedThreat.details?.requestId || 'unknown_req_id';
                    const originalPayload = selectedThreat.details?.originalPayload || {};
                    setIsInspectionDrawerOpen(false);

                    // 1. Whitelist the IP
                    try {
                      await fetch(\`\${process.env.NEXT_PUBLIC_INTERCEPTOR_URL}/api/v1/blocklist/add\`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'X-Asguard-Auth': process.env.NEXT_PUBLIC_ASGUARD_API_KEY || ''
                        },
                        body: JSON.stringify({ ip, reason: "False positive replay whitelist", type: "whitelist" })
                      });
                    } catch (e) { console.error('Whitelist failed', e); }

                    // 2. Dispatch webhook to Echo Recovery Manager
                    try {
                      const recoveryUrl = process.env.NEXT_PUBLIC_ECHO_RECOVERY_URL || 'http://localhost:3000';
                      await fetch(\`\${recoveryUrl}/api/v1/recovery/replay-disputed\`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'X-Axim-Signature': process.env.NEXT_PUBLIC_AXIM_INTERNAL_KEY || 'test-key'
                        },
                        body: JSON.stringify({
                          original_payload: originalPayload,
                          request_id: reqId
                        })
                      });
                      // Assuming success, toast would be nice but not available natively without context
                    } catch (e) { console.error('Echo replay failed', e); }
                  }}
                  className="w-full bg-blue-950/40 hover:bg-blue-900/60 border border-blue-900/50 text-blue-500 py-2 rounded transition-colors text-xs font-bold tracking-widest mt-2"
                >
                  [ MARK AS FALSE POSITIVE & REPLAY ]
                </button>
`;

const insertIndex = content.indexOf('[ WHITELIST IP ]\n                </button>');
if (insertIndex > -1) {
    const afterInsert = insertIndex + '[ WHITELIST IP ]\n                </button>'.length;
    content = content.substring(0, afterInsert) + newButtonStr + content.substring(afterInsert);
    fs.writeFileSync(file, content, 'utf8');
} else {
    console.error("Could not find insert point in LiveThreatFeed");
}
