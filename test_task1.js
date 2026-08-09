const fs = require('fs');
const file = 'asguard-interceptor/src/index.ts';
const code = fs.readFileSync(file, 'utf8');

if (code.includes('globalThreatLevel = "CRITICAL"')) {
    console.log("Success: Task 1 changes found.");
} else {
    console.log("Error: Task 1 changes missing.");
}
