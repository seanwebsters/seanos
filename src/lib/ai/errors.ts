/** A task can't continue until Sean does something (connect a key, raise a budget). */
export class BlockedError extends Error {
  constructor(public readonly need: string, message: string) {
    super(message);
    this.name = "BlockedError";
  }
}

/** A transient failure the engine should retry with backoff. */
export class RetryableError extends Error {
  constructor(message: string, public readonly retryAfterMs = 0) {
    super(message);
    this.name = "RetryableError";
  }
}
