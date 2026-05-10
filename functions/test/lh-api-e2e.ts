import fs from 'fs';
import path from 'path';

// Load secrets manually for the test
const secretPath = path.join(__dirname, '../.secret.json');
if (fs.existsSync(secretPath)) {
  const secretData = fs.readFileSync(secretPath, 'utf8');
  process.env.FLIGHTS_CONFIG = secretData;
} else {
  console.error("No .secret.json found. Please run: firebase functions:secrets:access FLIGHTS_CONFIG --project flights-159420 > .secret.json");
  process.exit(1);
}

// Set environment variables for logger to output correctly outside of Firebase runtime
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "flights-159420" });

// Import after setting the env var so defineJsonSecret can pick it up
import FlightAutoCompleter from '../src/autocomplete/lufthansa-api-autocompletion';
import { Flight } from '../src/models/flight';
import DayJS from 'dayjs';

async function run() {
  const flightNo = process.argv[2] || "LH400";
  const date = process.argv[3] || DayJS().format('YYYY-MM-DD');

  console.log(`Running end-to-end test for Lufthansa API...`);
  console.log(`Flight: ${flightNo}, Date: ${date}`);

  try {
    const existingFlight = new Flight();
    const result = await FlightAutoCompleter.autocomplete(flightNo, date, existingFlight);
    console.log("Autocomplete result:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Test failed with error:", err);
  }
}

run();
