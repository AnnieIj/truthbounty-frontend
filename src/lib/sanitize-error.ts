/**
 * Sanitize errors for safe user-facing display.
 *
 * Security: never expose stack traces, calldata, private keys, or full
 * transaction hashes / addresses in production. Wagmi/Viem receipts remain
 * authoritative — this helper only formats display strings and never
 * fabricates protocol data.
 */

const GENERIC_MESSAGE =
  'Something went wrong. Please try again. Your pending transactions are preserved.';

const SENSITIVE_PATTERNS: RegExp[] = [
  /0x[a-fA-F0-9]{40}/g, // EVM addresses
  /0x[a-fA-F0-9]{64}/g, // tx hashes / calldata-like hex
  /stack\s*:.*/gi,
  /at\s+.+:\d+:\d+/g, // stack-frame lines
];

function redactSensitive(input: string): string {
  let output = input;
  for (const pattern of SENSITIVE_PATTERNS) {
    output = output.replace(pattern, '[redacted]');
  }
  return output;
}

export function toSafeErrorMessage(error: unknown): string {
  if (process.env.NODE_ENV !== 'development') {
    return GENERIC_MESSAGE;
  }
  if (error instanceof Error) {
    const firstLine = error.message.split('\n')[0]?.slice(0, 300) || GENERIC_MESSAGE;
    return redactSensitive(firstLine);
  }
  if (typeof error === 'string') {
    return redactSensitive(error.slice(0, 300)) || GENERIC_MESSAGE;
  }
  return GENERIC_MESSAGE;
}

export function getGenericErrorMessage(): string {
  return GENERIC_MESSAGE;
}
