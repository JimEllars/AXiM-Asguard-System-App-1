const { execSync } = require('child_process');
try {
  execSync('git push -f origin HEAD');
  console.log('pushed');
} catch (e) {
  console.log(e.message);
}
