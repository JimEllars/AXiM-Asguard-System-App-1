const fs = require('fs');
let path = 'asguard-interceptor/tests/interceptor.test.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
    /const event = { cron: "0 0 \* \* \*" }; \/\/ daily/,
    `vi.clearAllMocks();
      const event = { cron: "0 0 * * *" }; // daily`
);

fs.writeFileSync(path, code);
