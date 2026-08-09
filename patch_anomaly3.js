const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let content = fs.readFileSync(file, 'utf8');

const stray = `
          {anomalyQueue?.status === 'pending_onyx_triage' && (
            <div
              onClick={() => setShowTriageModal(true)}
              className="mb-6 border border-amber-500/50 bg-amber-500/10 rounded font-mono p-4 text-center text-sm text-amber-500 cursor-pointer hover:bg-amber-500/20 transition-colors animate-pulse"
            >
              [ ONYX ANOMALY QUEUE: IP {anomalyQueue.anomalyIp} ({anomalyQueue.requestCount1h} req/hr) STAGED FOR TRIAGE ]
            </div>
          )}
`;
// Let's strip the end of file stray elements
const endOfFileIndex = content.lastIndexOf('export default function LiveThreatFeed');
if (endOfFileIndex !== -1) {
    // Actually the component is a default export at the top, let's find `); \n }` at the end
}
// Clean up all stray banners:
content = content.split(stray).join('');

const targetStr = '<div className="grid grid-cols-1 md:grid-cols-2 gap-6">';
if (content.includes(targetStr)) {
  content = content.replace(targetStr, stray + targetStr);
} else {
  // Let's look for another landmark
  const targetStr2 = '<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">';
  if (content.includes(targetStr2)) {
     content = content.replace(targetStr2, stray + targetStr2);
  } else {
      const targetStr3 = '<main className="p-8 max-w-7xl mx-auto space-y-6">';
      if (content.includes(targetStr3)) {
          content = content.replace(targetStr3, targetStr3 + stray);
      }
  }
}

fs.writeFileSync(file, content, 'utf8');
console.log('patched 3');
