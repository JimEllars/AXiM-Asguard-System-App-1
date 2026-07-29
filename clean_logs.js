const fs = require('fs');

let path = 'asguard-interceptor/src/index.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/console\.log\("EVENT IS:", event\);\s*/, '');
code = code.replace(/if\s*\(isDaily\)\s*\{\s*console\.log\("isDaily is TRUE"\);/, 'if (isDaily) {');

fs.writeFileSync(path, code);
