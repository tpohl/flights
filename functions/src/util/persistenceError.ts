export class PersistenceError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "PersistenceError";
  }
}
