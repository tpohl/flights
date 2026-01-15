import functionsTest from "firebase-functions-test";

const test = functionsTest();

// Mock config values
test.mockConfig({
    jwt: { secret: "test-secret" },
    aeroapi: { apikey: "test-api-key" },
    lhapi: { clientid: "test-id", clientsecret: "test-secret" },
    flightaware: { username: "test-user", apikey: "test-key" }
});

// Initialize a dummy app to satisfy firebase-admin's internal registry
// This prevents "no app" errors when admin.database() is called (even if we stub it later, the getApp check might run first)
import * as admin from "firebase-admin";

if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: "test-project",
        databaseURL: "https://test-project.firebaseio.com"
    });
}

export default test;
