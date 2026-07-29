const fs = require('fs');
const path = 'asguard-interceptor/tests/interceptor.test.ts';

let code = fs.readFileSync(path, 'utf8');

// Is it possible event is undefined or wrapped?
// In wrangler, cron trigger event has property `cron`. `event.cron` is correct.
// Let's modify the index.ts to check `event?.cron === "0 0 * * *"` just in case.

let indexPath = 'asguard-interceptor/src/index.ts';
let indexCode = fs.readFileSync(indexPath, 'utf8');
indexCode = indexCode.replace(/const isDaily = event\.cron === "0 0 \* \* \*";/, 'const isDaily = event && event.cron === "0 0 * * *";');
fs.writeFileSync(indexPath, indexCode);
