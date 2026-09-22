# Flights

[![Known Vulnerabilities](https://snyk.io/test/github/tpohl/flights/badge.svg)](https://snyk.io/test/github/tpohl/flights)

## Editing flights

Times are entered in each airport's local timezone and saved with **Save**.
Use the arrival date for overnight or date-line flights; it can differ from the
departure date in either direction. During a repeated daylight-saving hour,
choose the UTC offset to identify the intended occurrence.

Unknown times stay empty. Older timestamps without a timezone are preserved on
unrelated edits and must be explicitly replaced before changing their date or
airport. Clearing a time also clears the derived duration.

Edits remain local until saved. Background updates preserve unsaved fields, and
explicitly edited flight details are marked as manual overrides so enrichment
cannot replace them. Private CSV and Firebase exports belong in the ignored
repository-root `data/` directory.

## myFlightradar24 CSV import and export

The **Import Flights** page accepts the standard myFlightradar24 CSV export,
including quoted commas, quotes, and multiline notes. It validates the named
columns regardless of their order, resolves airport-local departure and arrival
times through each airport's IANA timezone, and infers the missing arrival date
only when the supplied duration identifies one unique UTC result. DST gaps,
unresolved overlaps, unknown airports, malformed rows, and duplicate rows are
shown for review.

Parsing only creates a preview. A separate **Import Ready Flights** action
writes valid, non-duplicate rows in one idempotent Firebase transaction.
myFlightradar24 imports deliberately do **not** start AeroAPI enrichment;
the editor's manual autocomplete button remains available afterward.

The **Export Flights** page downloads active, complete flights as
`myflightradar24-flights-YYYY-MM-DD.csv`. Times are converted back to airport
local time, output is formula-injection safe, and skipped incomplete flights
are reported. JSON export continues to contain every active flight, including
records that are incomplete for CSV export.

## AeroAPI enrichment

Flight completion runs only in Firebase Functions. Creating or changing a
flight number starts an AeroAPI lookup; the editor's autocomplete action does
the same by saving `needsAutocomplete`. The API key remains in the
`FLIGHTS_CONFIG` Firebase secret and is never sent to the browser.

Candidates are matched by flight number, origin-local date, and any route the
user supplied. Ambiguous results are not applied automatically. Gate and runway
times retain their scheduled, estimated, and actual values, while the primary
departure and arrival fields use the best available gate time. Manual
overrides always take precedence.

An hourly Firebase Function refreshes only explicitly queued, incomplete
flights after arrival. Refreshes stop after three attempts or once actual gate
times and an actual track are available. Every billable request is guarded by
account-wide usage and a short-lived transactional reservation ledger. Calls
stop at USD 4.50 per UTC month, leaving a safety margin below the Personal
tier's USD 5 credit. The implementation does not use AeroAPI's comparatively
expensive operator or aircraft-type endpoints.

## Historical cleanup preview

Historical cleanup is deliberately offline and preview-only. It reads Firebase
exports, never connects to Firebase or AeroAPI, and writes an auditable JSON
artifact containing proposed changes plus exact rollback values:

```bash
cd functions
npm run history-cleanup-preview -- \
  --flights ../data/<firebase-export.json> \
  --airports ../data/<airports-export.json> \
  --output ../data/history-cleanup-preview.json
```

The preview only fills missing values from trusted cached provider data or
unambiguous local evidence. Existing values are preserved, except that legacy
timezone-less timestamps can be converted using the corresponding airport's
IANA timezone. Ambiguous timestamps, conflicting provider data, possible
duplicates, and contradictory aircraft mappings are listed for manual review.
The generated artifact remains under the ignored `data/` directory and is not
an automatic import or migration.

Flights that cannot be represented in the myFlightradar24 export are listed on
the Anomalies page with the exact missing or invalid fields. Opening the flight
from that list allows the data to be corrected before exporting again.
