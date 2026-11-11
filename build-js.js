const esbuild = require('esbuild');
const fs = require('fs');

async function build() {
  console.log('⚡ Building JavaScript for Modern Browsers (ES2022+ Target)...');

  // Build Modern Bundle: Targets modern browsers without transpiling ES6+ features
  // Preserves native classes, arrow functions, destructuring, async/await, optional chaining
  await esbuild.build({
    entryPoints: ['app.js', 'cloud-sync.js'],
    outdir: 'dist/modern',
    bundle: false,
    minify: true,
    target: [
      'es2022'
    ],
    sourcemap: true,
    legalComments: 'none'
  });

  // Build Legacy Target: Targets ES2021 (preserving standard destructuring while downleveling stage-3+ features if any)
  console.log('🛡️  Building Legacy Fallback Bundle (ES2021 Target)...');
  await esbuild.build({
    entryPoints: ['app.js', 'cloud-sync.js'],
    outdir: 'dist/legacy',
    bundle: false,
    minify: true,
    target: [
      'es2021'
    ],
    sourcemap: true,
    legalComments: 'none'
  });

  const modernApp = fs.statSync('dist/modern/app.js').size;
  const legacyApp = fs.statSync('dist/legacy/app.js').size;
  console.log(`\n✅ Build Complete!`);
  console.log(`📦 Modern App: ${(modernApp / 1024).toFixed(2)} KB (Zero ES5 downleveling bloat)`);
  console.log(`📦 Legacy App: ${(legacyApp / 1024).toFixed(2)} KB (Targeted fallback bundle)`);
  console.log(`⚡ Modern browsers execute native ES6+ without Babel/ES5 runtime overhead!`);
}

build().catch(err => {
  console.error('Build error:', err);
  process.exit(1);
});
