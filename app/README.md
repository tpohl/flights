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
