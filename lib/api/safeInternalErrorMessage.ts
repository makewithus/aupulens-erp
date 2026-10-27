/** Public message for unexpected server failures. Keep exception details in server-side diagnostics only. */
export function safeInternalErrorMessage(): string {
  return "We couldn't complete this request. Please try again.";
}
