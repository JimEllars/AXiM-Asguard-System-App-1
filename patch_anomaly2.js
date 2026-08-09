const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let content = fs.readFileSync(file, 'utf8');

const bannerBlock2 = `          {anomalyQueue?.status === 'pending_onyx_triage' && (
            <div
              onClick={() => setShowTriageModal(true)}
              className="mb-6 border border-amber-500/50 bg-amber-500/10 rounded font-mono p-4 text-center text-sm text-amber-500 cursor-pointer hover:bg-amber-500/20 transition-colors animate-pulse"
            >
              [ ONYX ANOMALY QUEUE: IP {anomalyQueue.anomalyIp} ({anomalyQueue.requestCount1h} req/hr) STAGED FOR TRIAGE ]
            </div>
          )}`;
// Try to remove stray code block completely:
content = content.replace(bannerBlock2, "");
content = content.replace(bannerBlock2, ""); // In case of multiples

const properTarget = `<main className="max-w-7xl mx-auto px-4 py-8 relative">`;
if (content.includes(properTarget)) {
   content = content.replace(properTarget, properTarget + '\n' + bannerBlock2);
   console.log('injected at proper target');
} else {
   console.log('Proper target missing');
}
fs.writeFileSync(file, content, 'utf8');
