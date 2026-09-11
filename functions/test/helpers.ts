import * as sinon from "sinon";

export const logger = {
  log: sinon.stub(),
  debug: sinon.stub(),
  info: sinon.stub(),
  warn: sinon.stub(),
  error: sinon.stub()
};

const handler = (_options: unknown, callback: unknown) => callback;
export const databaseTriggers = {
  onValueCreated: handler,
  onValueUpdated: handler,
  onValueWritten: handler,
  onValueDeleted: handler
};

// Retry the transaction callback with newer server data before committing.
export const flightReference = (initial: any) => {
  let current = structuredClone(initial);
  let track: any = null;
  let retries: any[] = [];
  const trackSet = sinon.stub().resolves();
  trackSet.callsFake(async (value) => { track = structuredClone(value); });
  const trackRef = {
    once: sinon.stub().callsFake(async () => ({ val: () => structuredClone(track) })),
    set: trackSet
  };
  const reference = {
    key: "flight123",
    get current() { return structuredClone(current); },
    set current(value: any) { current = structuredClone(value); },
    retryWith(...values: any[]) { retries = values; },
    once: sinon.stub().callsFake(async () => ({ val: () => structuredClone(current) })),
    transaction: sinon.stub().callsFake(async (update: (value: any) => any) => {
      let proposed = update(structuredClone(current));
      for (const value of retries) {
        current = structuredClone(value);
        proposed = update(structuredClone(current));
      }
      retries = [];
      if (proposed !== undefined) current = structuredClone(proposed);
      return { committed: proposed !== undefined, snapshot: { val: () => structuredClone(current) } };
    }),
    trackSet,
    parent: { parent: { child: sinon.stub().returns({ child: sinon.stub().returns(trackRef) }) } }
  };
  return reference;
};
