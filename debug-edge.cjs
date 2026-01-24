const https = require('https');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env
const envConfig = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '.env')));
const SUPABASE_URL = envConfig.VITE_SUPABASE_URL;
const ANON_KEY = envConfig.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/parse-efd-v13`;

console.log(`Testing connection to: ${FUNCTION_URL}`);

const data = JSON.stringify({
  // Minimal body to trigger validation error instead of crash
  empresa_id: "00000000-0000-0000-0000-000000000000",
  file_path: "test/file.txt"
});

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ANON_KEY}`,
    'apikey': ANON_KEY
  }
};

const req = https.request(FUNCTION_URL, options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log(`BODY: ${body}`);
  });
});

req.on('error', (e) => {
  console.error(`PROBLEM WITH REQUEST: ${e.message}`);
});

req.write(data);
req.end();
