// Errors whose message is written for the person and safe to show them.
// Anything else is logged on the server and replaced with a general message.
export class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// A rate limit, quota or cost cap was reached.
export class LimitReached extends UserError {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message, 429);
  }
}
