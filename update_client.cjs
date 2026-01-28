const fs = require('fs');
const path = require('path');

const clientPath = path.join('..', 'fcapp_rt01', 'src', 'integrations', 'supabase', 'client_fc01.ts');
let content = fs.readFileSync(clientPath, 'utf8');

// Replace tenant_fc01 with public
content = content.replace("schema: 'tenant_fc01'", "schema: 'public'");

fs.writeFileSync(clientPath, content, 'utf8');
console.log('Updated client_fc01.ts to use public schema');