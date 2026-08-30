const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "setFeed(prev => {",
  "setAuditLog((prev: any) => {"
);
// replace setFeed variable usage inside the setState
content = content.replace(
  "const newFeed = [{",
  "const newFeed = [{"
);

fs.writeFileSync(file, content);
console.log('patched LiveThreatFeed.tsx state bug');
