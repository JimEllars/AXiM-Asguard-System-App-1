const fs = require('fs');
const file = 'asguard-interceptor/src/telemetry.ts';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes("'AXiM Onyx Pipeline'")) {
    content = content.replace(
        "'AXiM Macro Core Gateway'",
        "'AXiM Macro Core Gateway',\n    'AXiM Onyx Pipeline',\n    'axim-asguard'"
    );
}

fs.writeFileSync(file, content);
console.log('patched telemetry app origins');
