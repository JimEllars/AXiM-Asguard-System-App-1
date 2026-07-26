const fs = require('fs');
const file = 'asguard-interceptor/src/index.ts';
let content = fs.readFileSync(file, 'utf8');

const replacement = `    const newResponse = new Response(response.body, response);
    let serverTiming = \`edge-exec;dur=\${duration};desc="Stateless Perimeter Check"\`;
    if ((request as any).aiDuration) {
      serverTiming += \`, ai-eval;dur=\${(request as any).aiDuration};desc="Llama Guard 3 8B"\`;
    }
    newResponse.headers.set("Server-Timing", serverTiming);
    return newResponse;`;

content = content.replace(`    const newResponse = new Response(response.body, response);
    newResponse.headers.set("Server-Timing", \`edge-exec;dur=\${duration};desc="Stateless Perimeter Check"\`);
    return newResponse;`, replacement);

fs.writeFileSync(file, content);
console.log("Done");
