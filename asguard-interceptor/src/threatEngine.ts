export function inspectRequest(request: Request, clientIp: string): { isThreat: boolean; category: string; severity: string } {
    const url = new URL(request.url);
    const path = url.pathname;

    // Check for path traversal
    if (path.includes('../') || path.includes('..\\')) {
        return { isThreat: true, category: 'PATH_TRAVERSAL', severity: 'CRITICAL' };
    }

    // Simple SQLi patterns
    const sqliPatterns = /union\s+select|select\s+.*\s+from|insert\s+into|update\s+.*\s+set|delete\s+from|drop\s+table/i;
    if (sqliPatterns.test(path) || sqliPatterns.test(url.search)) {
         return { isThreat: true, category: 'SQL_INJECTION', severity: 'CRITICAL' };
    }

    // Anomalous headers
    const userAgent = request.headers.get('User-Agent') || '';
    if (userAgent.includes('curl') || userAgent === '' || userAgent.includes('python-requests')) {
         // Might just be anomalous or low level scanner
         return { isThreat: true, category: 'ANOMALOUS_USER_AGENT', severity: 'MEDIUM' };
    }

    return { isThreat: false, category: 'NONE', severity: 'NONE' };
}
