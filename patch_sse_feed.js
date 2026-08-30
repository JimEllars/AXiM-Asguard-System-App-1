const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let content = fs.readFileSync(file, 'utf8');

// Inject the SSE hook
const sseHook = `
  useEffect(() => {
    let source = null;
    const sseUrl = \`\${process.env.NEXT_PUBLIC_AXIM_CORE_API_URL || 'https://api.axim.us.com'}/api/v1/onyx/stream\`;
    try {
      source = new EventSource(sseUrl);
      source.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          // Assuming the event matches our telemetry types or something similar
          if (['threat.blocked', 'rate_limit.exceeded', 'suspicious_activity', 'bot_challenge.failed', 'ip.quarantined'].includes(parsed.event_type || parsed.eventType)) {
            setFeed(prev => {
              const newFeed = [{
                ...parsed,
                id: \`sse-\${Date.now()}-\${Math.random()}\`,
                timestamp: parsed.timestamp || Date.now(),
                isNewStreamEvent: true // mark to trigger flashing animation
              }, ...prev].slice(0, 100);
              return newFeed;
            });
            setLastSynced(new Date());
          }
        } catch (e) {
          // ignore parse errors
        }
      };
      source.onerror = (e) => {
        console.error("SSE connection error", e);
      };
    } catch (e) {
      console.error("Failed to establish SSE", e);
    }

    return () => {
      if (source) {
        source.close();
      }
    };
  }, []);
`;

content = content.replace(
  "export default function LiveThreatFeed() {",
  `export default function LiveThreatFeed() {${sseHook}`
);

// update the item rendering to support flashing (if we can find the rendering of the items)
// The feed is likely rendered using the `feed` state. We added a new boolean flag `isNewStreamEvent`.
content = content.replace(
  /className="p-4 rounded-xl flex flex-col sm:flex-row gap-4 sm:items-start relative border /g,
  "className={`p-4 rounded-xl flex flex-col sm:flex-row gap-4 sm:items-start relative border transition-colors duration-1000 ${item.isNewStreamEvent ? 'animate-pulse bg-red-950/40 border-red-500' : ''} `"
);

fs.writeFileSync(file, content);
console.log('patched LiveThreatFeed.tsx for SSE');
