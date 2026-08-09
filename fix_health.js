const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let content = fs.readFileSync(file, 'utf8');

// There is a use-effect that polls healthstate, let's see where the fetch is defined.
// If not found, we can remove the explicit call as it auto-polls, or define it locally.
if (!content.includes('const fetchHealthState =')) {
   // Remove the fetchHealthState(); call.
   content = content.replace('fetchHealthState();', '');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed fetchHealthState');
