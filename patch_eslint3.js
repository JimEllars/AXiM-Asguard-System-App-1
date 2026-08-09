const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

const hookDef = `  const forceSync = useCallback(async () => {
    if (activeTab === 'dlq') {
       fetchDlqRecords();
       return;
    }
    if (activeTab === 'network') {`;

const newHookDef = `  const forceSync = useCallback(async () => {
    if (activeTab === 'dlq') {
       fetchDlqRecords();
       return;
    }
    if (activeTab === 'network') {`;

const oldDeps = `               console.error("Manual sync failed", err);
               setIsSyncing(false);
           }
       }
    }
  }, [addToast]);`;

const newDeps = `               console.error("Manual sync failed", err);
               setIsSyncing(false);
           }
       }
    }
  }, [addToast, dlqView, fetchDlqRecords, activeTab]);`;

code = code.replace(oldDeps, newDeps);
fs.writeFileSync(file, code);
