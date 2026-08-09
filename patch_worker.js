const fs = require('fs');
const file = 'asguard-interceptor/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `        const listResult = await env.ASGUARD_TELEMETRY.list({ prefix: "dlq:", limit: 100 });
        const records = await Promise.all(
          listResult.keys.map(async (key) => {
             const data = await env.ASGUARD_TELEMETRY.get(key.name);
             try {
                return data ? JSON.parse(data) : null;
             } catch(e) {
                return null;
             }
          })
        );
        const validRecords = records.filter(r => r !== null && r.status !== "quarantined");`;

const replacementStr = `        const listResult = await env.ASGUARD_TELEMETRY.list({ prefix: "dlq:", limit: 100 });
        const records = await Promise.all(
          listResult.keys.map(async (key) => {
             const data = await env.ASGUARD_TELEMETRY.get(key.name);
             try {
                return data ? JSON.parse(data) : null;
             } catch(e) {
                return null;
             }
          })
        );
        const view = url.searchParams.get("view") || "active";
        const validRecords = records.filter(r => {
          if (r === null) return false;
          if (view === "quarantined") {
            return r.status === "quarantined";
          }
          return r.status !== "quarantined";
        });`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync(file, code);
  console.log('Successfully patched index.ts');
} else {
  console.log('Could not find target string in index.ts');
}
