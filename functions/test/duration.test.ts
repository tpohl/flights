import "./test-setup";
import { expect } from "chai";
import * as sinon from "sinon";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { computeDuration } from "../src/duration/index";

// Mock flight data
const mockFlightData = {
    departureTime: "2023-10-27T10:00:00.000Z",
    arrivalTime: "2023-10-27T12:00:00.000Z",
};

describe("Duration Cloud Function", () => {
    // Global mock of initializeApp is handled in test-setup.ts
    // We only need to clean up other stubs if necessary

    it("should calculate duration correctly (2 hours)", async () => {
        const setStub = sinon.stub().resolves();

        // Mock the snapshot structure required by loadFlight and computeDuration
        // loadFlight calls snapshot.ref.once('value') -> returns { val: () => flight }
        // computeDuration calls snapshot.ref.parent -> which is the flightRef

        // Structure:
        // snapshot.ref.parent (flightRef)
        //   .once('value') -> returns flight data
        //   .child('durationMilliseconds')
        //     .set(duration)

        const flightRefStub = {
            key: "flight123",
            once: sinon.stub().resolves({
                val: () => mockFlightData,
                exists: () => true
            }),
            child: sinon.stub().returns({
                set: setStub
            })
        };

        const snapshotStub = {
            ref: {
                parent: flightRefStub
            }
        } as unknown as functions.database.DataSnapshot;

        const context = {
            params: { userId: "testUser", flightId: "flight123" }
        } as unknown as functions.EventContext;

        await computeDuration(snapshotStub, context);

        // 2 hours = 7,200,000 ms
        expect(setStub.calledOnce).to.be.true;
        expect(setStub.firstCall.args[0]).to.equal(7200000);
    });

    it("should not set duration if times are missing", async () => {
        const setStub = sinon.stub().resolves();
        const flightRefStub = {
            key: "flight123",
            once: sinon.stub().resolves({
                val: () => ({ ...mockFlightData, arrivalTime: null }),
                exists: () => true
            }),
            child: sinon.stub().returns({
                set: setStub
            })
        };

        const snapshotStub = {
            ref: {
                parent: flightRefStub
            }
        } as unknown as functions.database.DataSnapshot;

        const context = {
            params: { userId: "testUser", flightId: "flight123" }
        } as unknown as functions.EventContext;

        await computeDuration(snapshotStub, context);

        expect(setStub.called).to.be.false;
    });
});
