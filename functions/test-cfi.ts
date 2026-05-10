import fs from 'fs';
import path from 'path';

const secretPath = path.join(__dirname, '.secret.json');
const secretData = JSON.parse(fs.readFileSync(secretPath, 'utf8'));

import { ClientCredentials } from 'simple-oauth2';

async function run() {
  const oauth2 = new ClientCredentials({
    client: {
      id: secretData.lhapi.clientid,
      secret: secretData.lhapi.clientsecret
    },
    auth: {
      tokenHost: 'https://api.lufthansa.com/v1',
      tokenPath: '/v1/oauth/token'
    }
  });

  const token = await oauth2.getToken({});
  const apiToken = token.token.access_token;
  const flightNo = process.argv[2] || "OS260";
  const date = process.argv[3] || "2026-05-11";
  const url = `https://api.lufthansa.com/v1/operations/customerflightinformation/${flightNo}/${date}`;

  console.log(`curl -X GET "${url}" -H "Accept: application/json" -H "Authorization: Bearer ${apiToken}"`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiToken}`
    }
  });

  const data = await response.text();
  console.log(data);
}
run();
