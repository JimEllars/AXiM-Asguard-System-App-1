import re

with open('soc-cockpit/src/components/LiveThreatFeed.tsx', 'r') as f:
    content = f.read()

bulk_unquarantine_func = """
  const handleBulkUnquarantine = async () => {
    if (selectedDlqIds.length === 0) return;
    setIsBatchProcessing(true);
    try {
      const workerUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
      const apiKey = process.env.NEXT_PUBLIC_ASGUARD_API_KEY;
      await Promise.all(
        selectedDlqIds.map(id =>
          fetch(`${workerUrl}/dlq/unquarantine`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Asguard-Auth': apiKey || '',
              'X-Asguard-Signature': activeAccount?.address || 'UNKNOWN'
            },
            body: JSON.stringify({ id })
          })
        )
      );
      setDlqRecords(prev => prev.map(r => selectedDlqIds.includes(r.id) ? { ...r, status: undefined } : r));
      setSelectedDlqIds([]);
      addToast("[ BULK UNQUARANTINE COMPLETE ]", "success");
    } catch (err) {
      addToast("Bulk unquarantine failed", "error");
    } finally {
      setIsBatchProcessing(false);
    }
  };
"""

content = content.replace("const handleUnquarantine = async (id: string) => {", bulk_unquarantine_func + "\n  const handleUnquarantine = async (id: string) => {")

with open('soc-cockpit/src/components/LiveThreatFeed.tsx', 'w') as f:
    f.write(content)
