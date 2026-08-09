const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

const oldDeps = `               console.error("Manual sync failed", err);
               setIsSyncing(false);
           }
       }
    }
  }, [addToast, dlqView, fetchDlqRecords, activeTab]);`;

const newDeps = `               console.error("Manual sync failed", err);
               setIsSyncing(false);
           }
       }
    }
  }, [addToast, dlqView]);`;

code = code.replace(oldDeps, newDeps);
fs.writeFileSync(file, code);
