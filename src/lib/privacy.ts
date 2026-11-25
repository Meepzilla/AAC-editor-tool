/**
 * Privacy guards for logging and user-facing error handling.
 *
 * Hard rule: Logs and error messages must never include button labels,
 * word lists, or student names.
 */

/**
 * Extracts a safe, generic error code/category without propagating arbitrary
 * user content or raw SQL rows into logs or error strings.
 */
export function toSafeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof SafeClinicalError) {
    return error.message;
  }
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') {
      return 'Device storage is full. Export a backup and clear space before saving.';
    }
    return `${fallback} (${error.name})`;
  }
  return fallback;
}

/**
 * Error subclass guaranteed by construction to contain only structural,
 * non-student-identifying text (no names, no labels, no word lists).
 */
export class SafeClinicalError extends Error {
  readonly code: string;

  constructor(code: string, safeMessage: string) {
    super(safeMessage);
    this.name = 'SafeClinicalError';
    this.code = code;
  }
}
