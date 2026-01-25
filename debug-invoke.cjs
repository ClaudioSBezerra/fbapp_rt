const https = require('https');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env
const envConfig = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '.env')));
const SUPABASE_URL = envConfig.VITE_SUPABASE_URL;
const serviceKey = envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY;
const realKey = (serviceKey && !serviceKey.includes('INSIRA_SUA')) 
  ? serviceKey 
  : envConfig.VITE_SUPABASE_PUBLISHABLE_KEY;

const JOB_ID = "848ea202-1e75-4346-9c25-041d0a5f9d85"; // ID from check-jobs.cjs
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/process-efd-job`;

console.log(`Testing connection to: ${FUNCTION_URL}`);
console.log(`Using key: ${realKey === serviceKey ? 'SERVICE_ROLE' : 'ANON'}`);
console.log(`Job ID: ${JOB_ID}`);

const data = JSON.stringify({
  job_id: JOB_ID
});

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${realKey}`,
    'apikey': realKey
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
