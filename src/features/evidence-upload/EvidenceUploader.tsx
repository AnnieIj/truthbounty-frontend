"use client";
import { useEffect, useMemo } from "react";
import { useAccount, useChainId } from "wagmi";
import { useEvidenceUpload } from "./useEvidenceUpload";
import { EvidenceUploadProgress } from "./EvidenceUploadProgress";
import type { UploadClient } from "./types";

// SET THIS (1 of 2): use the documented evidence upload endpoint from V2-FE-103.
// If it is not set, the uploader fails closed and nothing can be submitted.
const UPLOAD_URL = process.env.NEXT_PUBLIC_EVIDENCE_UPLOAD_URL ?? "";

// Confirm these limits against the repo docs / maintainers.
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "application/pdf"];

function createXhrClient(url: string): UploadClient {
  return {
    upload(file, { onProgress, signal }) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const body = JSON.parse(xhr.responseText);
              // SET THIS (2 of 2): the digest field the canonical API returns.
              // It must be a SHA-256 hex string comparable to sha256Hex(file).
              const digest = body?.digest;
              if (typeof digest === "string" && digest.length > 0) return resolve({ digest });
            } catch {
              /* fall through */
            }
            return reject(new Error("invalid upload response")); // integrity uncertain: fail closed
          }
          reject(Object.assign(new Error("upload failed"), { status: xhr.status }));
        };

        xhr.onerror = () => reject(new TypeError("network error"));
        xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
        signal.addEventListener("abort", () => xhr.abort());

        const form = new FormData();
        form.append("file", file);
        xhr.send(form);
      });
    },
  };
}

export function EvidenceUploader({
  onVerifiedChange,
}: {
  /** Called with the canonical digest when verified, or null otherwise. */
  onVerifiedChange: (digest: string | null) => void;
}) {
  const { address } = useAccount();
  const chainId = useChainId();

  const client = useMemo(() => (UPLOAD_URL ? createXhrClient(UPLOAD_URL) : null), []);

  const { state, start, retry, cancel, reset } = useEvidenceUpload({
    client,
    maxBytes: MAX_BYTES,
    allowedTypes: ALLOWED_TYPES,
    resetKey: `${address ?? "none"}:${chainId}`,
  });

  useEffect(() => {
    onVerifiedChange(state.phase === "verified" ? state.verifiedDigest ?? null : null);
  }, [state.phase, state.verifiedDigest, onVerifiedChange]);

  return (
    <div>
      <label htmlFor="evidence-file" className="block text-sm font-medium">
        Upload evidence
      </label>
      <input
        id="evidence-file"
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        disabled={!client}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) start(f);
          e.target.value = "";
        }}
      />
      {!client && (
        <p role="alert">Evidence upload is not configured. Submission is disabled.</p>
      )}
      <EvidenceUploadProgress state={state} onRetry={retry} onCancel={cancel} onChooseAgain={reset} />
    </div>
  );
}