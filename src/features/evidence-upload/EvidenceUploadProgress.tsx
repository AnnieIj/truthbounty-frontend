import type { UploadFailure, UploadState } from "./types";

const FAILURE_TEXT: Record<UploadFailure, string> = {
  "unsupported-type": "This file type is not supported. Choose a different file.",
  "too-large": "This file is too large. Choose a smaller file.",
  network: "The connection failed. You can retry without choosing the file again.",
  stale: "The upload session is out of date. You can retry.",
  rejected: "The upload was rejected. Choose a different file or check your access.",
  "integrity-mismatch": "Integrity check failed: the uploaded data did not match your file. Nothing was accepted. Choose the file again.",
  unknown: "Something went wrong. Nothing was accepted.",
};

export function EvidenceUploadProgress({
  state,
  onRetry,
  onCancel,
  onChooseAgain,
}: {
  state: UploadState;
  onRetry: () => void;
  onCancel: () => void;
  onChooseAgain: () => void;
}) {
  const { phase, progress, failure, retryable } = state;
  if (phase === "idle") return null;

  const busy = phase === "hashing" || phase === "uploading";

  return (
    <section aria-labelledby="upload-heading" className="rounded-lg border p-4">
      <h3 id="upload-heading" className="font-semibold">Evidence upload</h3>

      {/* Polite live region: announces state changes to screen readers */}
      <p role="status" aria-live="polite">
        {phase === "hashing" && "Checking your file's integrity locally."}
        {phase === "uploading" && `Uploading, ${progress}% sent. Not confirmed yet.`}
        {phase === "verified" && "Upload verified: the stored data matches your file."}
        {phase === "cancelled" && "Upload cancelled. Nothing was submitted."}
        {phase === "invalidated" && "Your account or network changed. The upload was cancelled; choose the file again."}
      </p>

      {phase === "uploading" && (
        <progress value={progress} max={100} aria-label="Upload progress" className="w-full motion-reduce:transition-none" />
      )}

      {phase === "failed" && failure && (
        <p role="alert">{FAILURE_TEXT[failure]}</p>
      )}

      <div className="mt-2 flex gap-2">
        {busy && (
          <button type="button" onClick={onCancel} className="rounded border px-3 py-1 text-sm">
            Cancel
          </button>
        )}
        {phase === "failed" && retryable && (
          <button type="button" onClick={onRetry} className="rounded border px-3 py-1 text-sm">
            Retry upload
          </button>
        )}
        {(phase === "failed" && !retryable) || phase === "cancelled" || phase === "invalidated" ? (
          <button type="button" onClick={onChooseAgain} className="rounded border px-3 py-1 text-sm">
            Choose file again
          </button>
        ) : null}
      </div>
    </section>
  );
}