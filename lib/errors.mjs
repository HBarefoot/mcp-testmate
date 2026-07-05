/**
 * An error whose message is safe and useful to show the user as-is.
 * The CLI renders it as a branded error block and exits 2 — never a stack.
 *
 *   message — what failed, one line
 *   likely  — most likely cause (optional)
 *   fix     — the exact command or action to try (optional)
 */
export class UserError extends Error {
  constructor(message, { likely, fix } = {}) {
    super(message);
    this.likely = likely;
    this.fix = fix;
  }
}
