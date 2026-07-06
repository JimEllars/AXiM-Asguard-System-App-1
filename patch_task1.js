const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'soc-cockpit/src/components/LiveThreatFeed.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add imports
content = content.replace(
  "import React, { useEffect, useState } from 'react';",
  "import React, { useEffect, useState, useCallback, useRef } from 'react';\nimport { useRouter, useSearchParams, usePathname } from 'next/navigation';"
);

// 2. Add router hooks and replace state initialization
content = content.replace(
  /export default function LiveThreatFeed\(\) {/,
  `export default function LiveThreatFeed() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
`
);

// We need to carefully replace the useState for search, filter, etc.
content = content.replace(
  /const \[severityFilter, setSeverityFilter\] = useState<'all' \| 'high' \| 'medium' \| 'low'>\('all'\);/,
  "const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>((searchParams.get('severity') as any) || 'all');"
);

content = content.replace(
  /const \[appOriginFilter, setAppOriginFilter\] = useState<string>\('all'\);/,
  "const [appOriginFilter, setAppOriginFilter] = useState<string>(searchParams.get('origin') || 'all');"
);

content = content.replace(
  /const \[searchQuery, setSearchQuery\] = useState\(''\);/,
  "const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');"
);

// 3. Add effect to sync state to URL
const syncEffect = `

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (searchQuery) {
      params.set('search', searchQuery);
    } else {
      params.delete('search');
    }
    if (severityFilter && severityFilter !== 'all') {
      params.set('severity', severityFilter);
    } else {
      params.delete('severity');
    }
    if (appOriginFilter && appOriginFilter !== 'all') {
      params.set('origin', appOriginFilter);
    } else {
      params.delete('origin');
    }
    router.replace(\`\${pathname}?\${params.toString()}\`, { scroll: false });
  }, [searchQuery, severityFilter, appOriginFilter, pathname, router, searchParams]);

`;

content = content.replace(
  /const \[telemetryPage, setTelemetryPage\] = useState\(0\);/,
  `${syncEffect}  const [telemetryPage, setTelemetryPage] = useState(0);`
);


fs.writeFileSync(filePath, content);
