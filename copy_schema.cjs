const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, 'docs', 'database-setup.sql');
const destPath = path.join('..', 'fcapp_rt01', 'install_schema.sql');

try {
  const content = fs.readFileSync(sourcePath, 'utf8');
  fs.writeFileSync(destPath, content, 'utf8');
  console.log('✅ Schema file copied to:', destPath);
} catch (error) {
  console.error('❌ Error copying schema:', error.message);
}