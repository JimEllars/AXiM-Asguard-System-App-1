const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

const oldHook = `  const fetchDlqRecords = useCallback(async () => {
       if (activeTab === 'dlq') {
           setIsSyncing(true);
           try {
               const authKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY || '';
               const prefix = dlqView === 'active' ? 'dlq:active:' : 'dlq:';
               const res = await fetch(\`\${process.env.NEXT_PUBLIC_ASGUARD_WORKER_URL}/admin/dlq?prefix=\${prefix}\`, {
                 headers: { 'X-Asguard-Auth': authKey },
                 signal: AbortSignal.timeout(5000)
               });
               if (res.ok) {
                   const data = await res.json();
                   setDlqRecords(data.records || []);
               } else {
                   addToast('[ DLQ FETCH FAILED: ACCESS DENIED ]', 'error');
               }
           } catch (e) {
               console.error(e);
               addToast('[ DLQ FETCH FAILED: EDGE UNREACHABLE ]', 'error');
           } finally {
               setIsSyncing(false);
           }
       }
    }
  }, [addToast]);`;

const newHook = `  const fetchDlqRecords = useCallback(async () => {
       if (activeTab === 'dlq') {
           setIsSyncing(true);
           try {
               const authKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY || '';
               const prefix = dlqView === 'active' ? 'dlq:active:' : 'dlq:';
               const res = await fetch(\`\${process.env.NEXT_PUBLIC_ASGUARD_WORKER_URL}/admin/dlq?prefix=\${prefix}\`, {
                 headers: { 'X-Asguard-Auth': authKey },
                 signal: AbortSignal.timeout(5000)
               });
               if (res.ok) {
                   const data = await res.json();
                   setDlqRecords(data.records || []);
               } else {
                   addToast('[ DLQ FETCH FAILED: ACCESS DENIED ]', 'error');
               }
           } catch (e) {
               console.error(e);
               addToast('[ DLQ FETCH FAILED: EDGE UNREACHABLE ]', 'error');
           } finally {
               setIsSyncing(false);
           }
       }
  }, [addToast, dlqView, activeTab]);`;

code = code.replace(oldHook, newHook);
fs.writeFileSync(file, code);
