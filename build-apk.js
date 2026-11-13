const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

try {
  console.log('Syncing www web assets directly to android assets...');
  const wwwDir = path.resolve(__dirname, 'www');
  const targetAssetsDir = path.resolve(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');
  if (fs.existsSync(wwwDir)) {
    fs.cpSync(wwwDir, targetAssetsDir, { recursive: true, force: true });
    console.log('✓ Assets synced successfully to android/app/src/main/assets/public');
  }

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
