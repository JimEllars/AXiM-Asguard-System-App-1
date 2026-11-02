/**
 * Asguard edge threat inspection engine.
 *
 * Runs statelessly on every request before any application logic executes.
 * Confirmed CRITICAL findings are hard-failed by the caller with HTTP 403.
 */

export type ThreatSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'NONE';

export interface ThreatVerdict {
  isThreat: boolean;
  category: string;
  severity: ThreatSeverity;
}

/**
 * PHP-CGI argument injection (CVE-2024-4577 family).
 *
 * A vulnerable php-cgi binary re-parses the raw query string into CLI arguments,
 * so `?-d allow_url_include=1 -d auto_prepend_file=php://input` becomes real
 * ini directives and yields remote code execution. The payload is routinely
 * obscured with `%2d` / `%ad` (soft hyphen) best-fit mappings, which is why the
 * raw (undecoded) query string is inspected alongside the decoded one.
 */
const CGI_DIRECTIVE_PATTERNS: RegExp[] = [
  // `-d` / `-r` appearing as a leading argument in the query string.
  // `%2d` and `%ad` (soft hyphen, UTF-8 0xC2 0xAD byte 0xAD) both best-fit to `-`.
  /(?:^|[?&;\s])\s*(?:-|%2d|%ad)\s*(?:d|r|%64)\s*(?:\+|%20|=|&|;|$)/i,
  /auto_prepend_file\s*[=+%]/i,
  /auto_append_file\s*[=+%]/i,
  /allow_url_include\s*[=+%]/i,
  /disable_functions\s*[=+%]/i,
  /safe_mode\s*[=+%]/i,
  /open_basedir\s*[=+%]/i,
];

/** PHP shell drop / reconnaissance probes: `.php` targets and the wp-admin surface. */
const PHP_SHELL_PATTERNS: RegExp[] = [
  /\.php(?:$|[/?#])/i,
  /\.phtml(?:$|[/?#])/i,
  /\.phar(?:$|[/?#])/i,
  /\/wp-admin(?:$|[/?#])/i,
  /\/wp-content\/uploads\//i,
];

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Malformed percent-encoding (or a raw 0xAD best-fit byte). The caller
    // inspects the raw value as well, so returning it unchanged is safe.
    return value;
  }
}

function matchesAny(patterns: RegExp[], values: string[]): boolean {
  for (const pattern of patterns) {
    for (const value of values) {
      if (pattern.test(value)) return true;
    }
  }
  return false;
}

export function inspectRequest(request: Request, clientIp: string): ThreatVerdict {
  const url = new URL(request.url);
  const path = url.pathname;
  const rawSearch = url.search;
  const decodedSearch = decodeSafely(url.search);
  // Double-encoding is a common WAF bypass (`%252e%252e` -> `%2e%2e` -> `..`).
  const doubleDecodedSearch = decodeSafely(decodedSearch);
  const decodedPath = decodeSafely(path);
  const doubleDecodedPath = decodeSafely(decodedPath);

  const searchCandidates = [rawSearch, decodedSearch, doubleDecodedSearch];
  const pathCandidates = [path, decodedPath, doubleDecodedPath];

  // CGI argument injection (PHP2Shell / CVE-2024-4577). Checked first because
  // these payloads also carry `php://` and are otherwise filed as traversal.
  if (matchesAny(CGI_DIRECTIVE_PATTERNS, searchCandidates)) {
    return { isThreat: true, category: 'CGI_INJECTION', severity: 'CRITICAL' };
  }

  // PHP shell drop / wp-admin reconnaissance
  if (matchesAny(PHP_SHELL_PATTERNS, pathCandidates)) {
    return { isThreat: true, category: 'PHP_SHELL_PROBE', severity: 'CRITICAL' };
  }

  // Path Traversal & LFI
  const traversalMarkers = [
    '../', '..\\', '/etc/passwd', 'boot.ini', 'proc/self/environ', 'php://',
    '%2e%2e', '%252e%252e', '....//',
  ];
  const hitTraversal = traversalMarkers.some(
    (marker) =>
      pathCandidates.some((value) => value.toLowerCase().includes(marker)) ||
      searchCandidates.some((value) => value.toLowerCase().includes(marker)),
  );
  if (hitTraversal) {
    return { isThreat: true, category: 'PATH_TRAVERSAL', severity: 'CRITICAL' };
  }

  // SQL Injection (SQLi)
  const sqliPatterns = /union\s+select|exec\(|waitfor\s+delay|sleep\(|benchmark\(|'\s+or\s+'1'='1|;\s*drop\s+table/i;
  if (pathCandidates.some((v) => sqliPatterns.test(v)) || searchCandidates.some((v) => sqliPatterns.test(v))) {
    return { isThreat: true, category: 'SQL_INJECTION', severity: 'CRITICAL' };
  }

  // Cross-Site Scripting (XSS)
  const xssPatterns = /<script|javascript:|onerror=|onload=|eval\(|document\.cookie/i;
  if (pathCandidates.some((v) => xssPatterns.test(v)) || searchCandidates.some((v) => xssPatterns.test(v))) {
    return { isThreat: true, category: 'CROSS_SITE_SCRIPTING', severity: 'CRITICAL' };
  }

  // Remote Code Execution (RCE) / Command Injection
  const rcePatterns = /;|\||&&|`|\$\(|bin\/sh|bin\/bash|nc\s+-e|powershell/i;
  if (pathCandidates.some((v) => rcePatterns.test(v)) || searchCandidates.some((v) => rcePatterns.test(v))) {
    return { isThreat: true, category: 'REMOTE_CODE_EXECUTION', severity: 'CRITICAL' };
  }

  // SSRF & Cloud Metadata Probing
  const ssrfPatterns = /169\.254\.169\.254|metadata\.google\.internal|127\.0\.0\.1|localhost/i;
  let hasSsrf = pathCandidates.some((v) => ssrfPatterns.test(v)) || searchCandidates.some((v) => ssrfPatterns.test(v));
  if (!hasSsrf) {
    request.headers.forEach((value) => {
      if (ssrfPatterns.test(value)) hasSsrf = true;
    });
  }
  if (hasSsrf) {
    return { isThreat: true, category: 'SSRF', severity: 'CRITICAL' };
  }

  // AI Prompt Injection & Jailbreak Defense
  const promptInjectionPatterns = /ignore\s+(all\s+)?previous\s+instructions|system\s+prompt\s+override|you\s+are\s+now\s+dan|developer\s+mode\s+enabled|jailbreak\s+mode|reveal\s+your\s+(system\s+)?instructions|bypass\s+security\s+rules/i;
  if (searchCandidates.some((v) => promptInjectionPatterns.test(v)) || pathCandidates.some((v) => promptInjectionPatterns.test(v))) {
    return { isThreat: true, category: 'AI_PROMPT_INJECTION', severity: 'CRITICAL' };
  }

  // Anomalous headers — low confidence, never hard-failed on its own.
  const userAgent = request.headers.get('User-Agent') || '';
  if (userAgent === '' || userAgent.includes('curl') || userAgent.includes('python-requests')) {
    return { isThreat: true, category: 'ANOMALOUS_USER_AGENT', severity: 'MEDIUM' };
  }

  return { isThreat: false, category: 'NONE', severity: 'NONE' };
}

/**
 * Deterministic classification used when the AI classifier is unavailable.
 * Kept in the interceptor (not the AI service) so the verdict is stable and
 * independent of any upstream provider behaviour.
 */
export function deterministicFallbackClassification(reason: string) {
  return {
    risk: 'medium' as const,
    summary: 'Automated heuristic fallback triggered',
    recommendedActions: ['Monitor IP', 'Review Logs'],
    rationale: reason,
    degraded: true,
  };
}
