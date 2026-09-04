const { execSync } = require('child_process');
execSync('git add .');
execSync('git commit -m "feat: Echo recovery replay bridge and global threat map"');
