export function inspectRequest(request: Request, clientIp: string): { isThreat: boolean; category: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'NONE' } {
    const url = new URL(request.url);
    const path = url.pathname;
    const decodedSearch = decodeURIComponent(url.search);

    // Path Traversal & LFI
    if (path.includes('../') || path.includes('..\\') || path.includes('/etc/passwd') || path.includes('boot.ini') || path.includes('proc/self/environ') || path.includes('php://')) {
        return { isThreat: true, category: 'PATH_TRAVERSAL', severity: 'CRITICAL' };
    }

    // SQL Injection (SQLi)
    const sqliPatterns = /union\s+select|exec\(|waitfor\s+delay|sleep\(|benchmark\(|'\s+or\s+'1'='1|;\s*drop\s+table/i;
    if (sqliPatterns.test(path) || sqliPatterns.test(decodedSearch)) {
         return { isThreat: true, category: 'SQL_INJECTION', severity: 'CRITICAL' };
    }

    // Cross-Site Scripting (XSS)
    const xssPatterns = /<script|javascript:|onerror=|onload=|eval\(|document\.cookie/i;
    if (xssPatterns.test(path) || xssPatterns.test(decodedSearch)) {
        return { isThreat: true, category: 'CROSS_SITE_SCRIPTING', severity: 'CRITICAL' };
    }

    // Remote Code Execution (RCE) / Command Injection
    const rcePatterns = /;|\||&&|`|\$\(|bin\/sh|bin\/bash|nc\s+-e|powershell/i;
    if (rcePatterns.test(path) || rcePatterns.test(decodedSearch)) {
        return { isThreat: true, category: 'REMOTE_CODE_EXECUTION', severity: 'CRITICAL' };
    }

    // SSRF & Cloud Metadata Probing
    const ssrfPatterns = /169\.254\.169\.254|metadata\.google\.internal|127\.0\.0\.1|localhost/i;
    if (ssrfPatterns.test(path) || ssrfPatterns.test(decodedSearch) || (() => {
        let hasSSRF = false;
        request.headers.forEach((value) => {
            if (ssrfPatterns.test(value)) hasSSRF = true;
        });
        return hasSSRF;
    })()) {
        return { isThreat: true, category: 'SSRF', severity: 'CRITICAL' };
    }

    // AI Prompt Injection & Jailbreak Defense
    const promptInjectionPatterns = /ignore\s+(all\s+)?previous\s+instructions|system\s+prompt\s+override|you\s+are\s+now\s+dan|developer\s+mode\s+enabled|jailbreak\s+mode|reveal\s+your\s+(system\s+)?instructions|bypass\s+security\s+rules/i;
    if (promptInjectionPatterns.test(decodedSearch) || promptInjectionPatterns.test(path)) {
        return { isThreat: true, category: 'AI_PROMPT_INJECTION', severity: 'CRITICAL' };
    }

    // Anomalous headers
    const userAgent = request.headers.get('User-Agent') || '';
    if (userAgent.includes('curl') || userAgent === '' || userAgent.includes('python-requests')) {
         // Might just be anomalous or low level scanner
         return { isThreat: true, category: 'ANOMALOUS_USER_AGENT', severity: 'MEDIUM' };
    }

    return { isThreat: false, category: 'NONE', severity: 'NONE' };
}
