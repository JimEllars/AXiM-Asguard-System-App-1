const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

const hook = `  const fetchDlqRecords = useCallback(async (view: 'active' | 'quarantined') => {
    try {
      const authKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY || '';
      const prefix = view === 'active' ? 'dlq:active:' : 'dlq:';
      const res = await fetch(\`\${process.env.NEXT_PUBLIC_ASGUARD_WORKER_URL}/admin/dlq?prefix=\${prefix}\`, {
        headers: { 'X-Asguard-Auth': authKey }
      });
      if (res.ok) {
        const data = await res.json();
        setDlqRecords(data.records || []);
      } else {
        console.error("Failed to fetch DLQ records");
      }
    } catch (e) {
      console.error(e);
    }
  }, []);`;

const fixedHook = `  const fetchDlqRecords = useCallback(async (view: 'active' | 'quarantined') => {
    try {
      const authKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY || '';
      const prefix = view === 'active' ? 'dlq:active:' : 'dlq:';
      const res = await fetch(\`\${process.env.NEXT_PUBLIC_ASGUARD_WORKER_URL}/admin/dlq?prefix=\${prefix}\`, {
        headers: { 'X-Asguard-Auth': authKey }
      });
      if (res.ok) {
        const data = await res.json();
        setDlqRecords(data.records || []);
      } else {
        console.error("Failed to fetch DLQ records");
      }
    } catch (e) {
      console.error(e);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps`;

code = code.replace(hook, fixedHook);
fs.writeFileSync(file, code);
