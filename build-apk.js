const { execSync } = require('child_process');
const path = require('path');

try {
  try { execSync('subst X: /D'); } catch (e) {}
  const targetPath = path.resolve(__dirname);
  console.log('Mounting X: to', targetPath);
  execSync(`subst X: "${targetPath}"`);
  console.log('Running gradlew assembleRelease...');
  const result = execSync('gradlew.bat assembleRelease', { cwd: 'X:\\android', stdio: 'inherit' });
  console.log('Build finished successfully!');
} catch (err) {
  console.error('Build failed:', err);
  process.exit(1);
} finally {
  try { execSync('subst X: /D'); } catch (e) {}
}
