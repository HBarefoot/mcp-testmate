/**
 * An error whose message is safe and useful to show the user as-is.
 * The CLI prints it on one line and exits 2 — no stack trace.
 */
export class UserError extends Error {}
