const fs = require('fs');
const path = 'asguard-interceptor/tests/interceptor.test.ts';
let code = fs.readFileSync(path, 'utf8');

// I suspect `npm run build` hasn't been run or vitest uses index.js instead of index.ts because of caching or built files.
// Ah, `vitest run` on `src/index.ts` should be correct, but let me check if there's an `index.js` in `src`.
// "Vitest test runs in the asguard-interceptor project can fail or behave unexpectedly if tsc (npm run build) has left stale .js files in the src or tests directories. Ensure .js files are cleared if tests are running against outdated transpiled code instead of the current .ts source."
