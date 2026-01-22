import fs from 'fs';
import { execSync } from 'child_process';

console.log('Diagnosing and fixing project setup...');

try {
  // 1. Fix package.json
  const pkgPath = 'package.json';
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    
    let modified = false;
    
    // Ensure scripts exist
    if (!pkg.scripts) pkg.scripts = {};
    
    if (!pkg.scripts.test) {
      pkg.scripts.test = "vitest run";
      console.log('Added "test" script.');
      modified = true;
    }
    
    // Ensure devDependencies exist
    if (!pkg.devDependencies) pkg.devDependencies = {};
    
    if (!pkg.devDependencies.vitest) {
      pkg.devDependencies.vitest = "^1.3.1";
      console.log('Added "vitest" dependency.');
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      console.log('✅ package.json updated successfully.');
    } else {
      console.log('✅ package.json is already correct.');
    }
  } else {
    console.error('❌ package.json not found!');
    process.exit(1);
  }

  // 2. Check for node_modules/vitest
  const vitestPath = './node_modules/.bin/vitest';
  const vitestExists = fs.existsSync(vitestPath) || fs.existsSync(vitestPath + '.cmd') || fs.existsSync(vitestPath + '.ps1');
  
  if (!vitestExists) {
    console.log('⚠️ Vitest binary not found. You need to run "npm install".');
  } else {
    console.log('✅ Vitest binary found.');
  }

} catch (error) {
  console.error('❌ Error:', error.message);
}