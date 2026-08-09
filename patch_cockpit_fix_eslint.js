const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

// Fix useCallback missing dlqView dependency
const targetCallback = `  const handleManualSync = React.useCallback(async () => {
    if (!autoRefreshRef.current) {
       setAutoRefresh(true);
    }
    const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
    const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;

    if (!workerUrl || !apiKey) {
      return;
    }
    if (syncAbortControllerRef.current) {
        syncAbortControllerRef.current.abort();
    }
    syncAbortControllerRef.current = new AbortController();
    const signal = syncAbortControllerRef.current.signal;
    const authHeaders = { 'X-Asguard-Auth': apiKey };

    try {
      const [healthRes, dlqRes, blocklistRes, auditRes] = await Promise.all([
        fetch(\`\${workerUrl}/health\`, { headers: authHeaders, signal }),
        fetch(\`\${workerUrl}/api/dlq?view=\${dlqView}\`, { headers: authHeaders, signal }),
        fetch(\`\${workerUrl}/api/blocklist\`, { headers: authHeaders, signal }),
        fetch(\`\${workerUrl}/api/audit\`, { headers: authHeaders, signal })
      ]);
      if (healthRes.ok) setHealthStatus('online'); else setHealthStatus('degraded');
      if (dlqRes.ok) setDlqRecords(await dlqRes.json().then(d => d.slice(0, 50)));
      if (blocklistRes.ok) setBlocklist(await blocklistRes.json().then(d => d.slice(0, 50)));
      if (auditRes.ok) setAuditLogs(await auditRes.json().then(d => d.slice(0, 100)));

    } catch (e) {
      // Ignored manually aborted sync
    }
  }, []);`;

const replaceCallback = `  const handleManualSync = React.useCallback(async () => {
    if (!autoRefreshRef.current) {
       setAutoRefresh(true);
    }
    const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
    const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;

    if (!workerUrl || !apiKey) {
      return;
    }
    if (syncAbortControllerRef.current) {
        syncAbortControllerRef.current.abort();
    }
    syncAbortControllerRef.current = new AbortController();
    const signal = syncAbortControllerRef.current.signal;
    const authHeaders = { 'X-Asguard-Auth': apiKey };

    try {
      const [healthRes, dlqRes, blocklistRes, auditRes] = await Promise.all([
        fetch(\`\${workerUrl}/health\`, { headers: authHeaders, signal }),
        fetch(\`\${workerUrl}/api/dlq?view=\${dlqView}\`, { headers: authHeaders, signal }),
        fetch(\`\${workerUrl}/api/blocklist\`, { headers: authHeaders, signal }),
        fetch(\`\${workerUrl}/api/audit\`, { headers: authHeaders, signal })
      ]);
      if (healthRes.ok) setHealthStatus('online'); else setHealthStatus('degraded');
      if (dlqRes.ok) setDlqRecords(await dlqRes.json().then(d => d.slice(0, 50)));
      if (blocklistRes.ok) setBlocklist(await blocklistRes.json().then(d => d.slice(0, 50)));
      if (auditRes.ok) setAuditLogs(await auditRes.json().then(d => d.slice(0, 100)));

    } catch (e) {
      // Ignored manually aborted sync
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dlqView]);`;

code = code.replace(targetCallback, replaceCallback);

const removeUnused1 = `    const interval = setInterval(fetchBackgroundStatus, 10000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dlqView]);`;
const replacement1 = `    const interval = setInterval(fetchBackgroundStatus, 10000);
    return () => clearInterval(interval);
  }, [dlqView]);`;

code = code.replace(removeUnused1, replacement1);

const removeUnused2 = `    return () => {
      if (channel) supabase.removeChannel(channel);
      if (timeoutId) clearTimeout(timeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dlqView]);`;
const replacement2 = `    return () => {
      if (channel) supabase.removeChannel(channel);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [dlqView]);`;

code = code.replace(removeUnused2, replacement2);

fs.writeFileSync(file, code);
