export function TransactionStatus({
  status,
}: {
  status: 'idle' | 'pending' | 'success' | 'error';
}) {
  if (status === 'pending') {
    return (
      <p role="status" aria-live="polite" aria-atomic="true">
        Transaction pending...
      </p>
    );
  }
  if (status === 'success') {
    return (
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="text-green-600"
      >
        Verification submitted
      </p>
    );
  }
  if (status === 'error') {
    return (
      <p role="alert" aria-live="assertive" aria-atomic="true" className="text-red-600">
        Transaction failed
      </p>
    );
  }
  return null;
}
