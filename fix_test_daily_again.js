const fs = require('fs');
let path = 'asguard-interceptor/src/index.ts';
let code = fs.readFileSync(path, 'utf8');

// The issue might be how `env.ASGUARD_TELEMETRY.put` is called or there might be two `put` calls.
// Wait! `await env.ASGUARD_TELEMETRY.put("system_health_heartbeat", ...`
// Let's check the test mock calls.
// In tests: `const heartbeatCall = putCalls.find(c => c[0] === "system_health_heartbeat");`
// If `isDaily` is true, does it hit a different `put`?
// Maybe the previous test called scheduled and left `put` mocked calls in the array, and `find` is returning the FIRST call which is from the hourly test?
// Ah! `putCalls.find` will return the first occurrence! Which is the hourly heartbeat!
// We need to clear mock calls between tests!
