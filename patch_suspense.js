const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'soc-cockpit/src/app/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');
if (!content.includes('Suspense')) {
  content = content.replace(
    "import LiveThreatFeed from '@/components/LiveThreatFeed';",
    "import LiveThreatFeed from '@/components/LiveThreatFeed';\nimport { Suspense } from 'react';"
  );
  content = content.replace(
    "<LiveThreatFeed />",
    "<Suspense fallback={<div>Loading...</div>}>\n        <LiveThreatFeed />\n      </Suspense>"
  );
  fs.writeFileSync(filePath, content);
}
