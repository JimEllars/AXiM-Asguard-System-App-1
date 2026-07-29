const fs = require('fs');
const path = 'asguard-interceptor/tests/interceptor.test.ts';
const code = fs.readFileSync(path, 'utf8');

// I'll add a console log inside the index.ts scheduled to see what event is.
let indexPath = 'asguard-interceptor/src/index.ts';
let indexCode = fs.readFileSync(indexPath, 'utf8');
indexCode = indexCode.replace(/const isDaily = event && event\.cron === "0 0 \* \* \*";/, 'console.log("EVENT IS:", event); const isDaily = event && event.cron === "0 0 * * *";');
fs.writeFileSync(indexPath, indexCode);
