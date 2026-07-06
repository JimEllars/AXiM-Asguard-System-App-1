const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'soc-cockpit/src/components/LiveThreatFeed.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

content = content.replace(
  "import React, { useEffect, useState, useCallback, useRef } from 'react';",
  "import React, { useEffect, useState, useRef } from 'react';"
);

content = content.replace(
  "const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>((searchParams.get('severity') as any) || 'all');",
  "const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>((searchParams.get('severity') as 'all' | 'high' | 'medium' | 'low') || 'all');"
);

fs.writeFileSync(filePath, content);
