const fs = require('fs');

let path = 'asguard-interceptor/src/index.ts';
let code = fs.readFileSync(path, 'utf8');

// I notice: `if (isDaily) {`
// Let's add console logs inside the true branch of `if (isDaily)`
code = code.replace(/if\s*\(isDaily\)\s*\{/, 'if (isDaily) { console.log("isDaily is TRUE");');

fs.writeFileSync(path, code);
