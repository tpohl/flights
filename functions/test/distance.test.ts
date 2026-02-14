import "./test-setup";
import { expect } from "chai";
import * as sinon from "sinon";
import proxyquire from "proxyquire";
import * as functions from "firebase-functions/v1";

// Mock flight data
const mockFlightData = {
    from: "FRA",
    to: "JFK",
};

const mockAirportFRA = {
    latitude: 50.033333,
    longitude: 8.570556
};

const mockAirportJFK = {
    latitude: 40.639751,
    longitude: -73.778925
};

describe("Distance Cloud Function", () => {
    let computeDistance: any;
    let adminMock: any;
    let databaseStub: sinon.SinonStub;

    before(() => {
        // Mock firebase-admin
        const refStub = sinon.stub();
        databaseStub = sinon.stub().returns({ ref: refStub });

        // Setup default responses
        refStub.withArgs("/airports/FRA").returns({
            once: sinon.stub().resolves({ val: () => mockAirportFRA })
        });
        refStub.withArgs("/airports/JFK").returns({
            once: sinon.stub().resolves({ val: () => mockAirportJFK })
        });

        adminMock = {
            initializeApp: sinon.stub(),
            database: databaseStub,
            apps: []
        };

        // Use proxyquire to load the module with mocks
        // Note: We need to point to the built file or allow ts-node to handle it.
        // proxyquire works best with CJS. Since we are using ts-node/register, it should work for .ts files too.
        const module = proxyquire("../src/distance/index", {
            "firebase-admin": adminMock
        });
        computeDistance = module.computeDistance;
    });

    it("should calculate distance correctly", async () => {
        const setStub = sinon.stub().resolves();

        const flightRefStub = {
            key: "flightDistanceTest",
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
            params: { userId: "testUser", flightId: "flightDistanceTest" }
        } as unknown as functions.EventContext;

        await computeDistance(snapshotStub, context);

        // Approx distance FRA-JFK is ~6200 km.
        expect(setStub.calledOnce).to.be.true;
        const distanceArg = setStub.firstCall.args[0];
        expect(distanceArg).to.be.greaterThan(6100);
        expect(distanceArg).to.be.lessThan(6300);
    });
});
