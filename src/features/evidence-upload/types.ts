export type UploadPhase =
  | "idle"
  | "hashing"
  | "uploading"
  | "verified"
  | "failed"
  | "cancelled"
  | "invalidated";

export type UploadFailure =
  | "unsupported-type"
  | "too-large"
  | "network"
  | "stale"
  | "rejected"
  | "integrity-mismatch"
  | "unknown";

export type UploadState = {
  phase: UploadPhase;
  progress: number; // 0-100, bytes sent, NOT proof of integrity
  localDigest?: string;
  verifiedDigest?: string;
  failure?: UploadFailure;
  retryable: boolean;
  attempt: number;
};

export type UploadAction =
  | { type: "START" }
  | { type: "HASHED"; digest: string }
  | { type: "PROGRESS"; percent: number }
  | { type: "UPLOAD_DONE"; remoteDigest: string }
  | { type: "FAIL"; failure: UploadFailure }
  | { type: "RETRY" }
  | { type: "CANCEL" }
  | { type: "INVALIDATE" }
  | { type: "RESET" };

/** Seam to the documented canonical API/IPFS client (V2-FE-103). */
export interface UploadClient {
  upload(
    file: File,
    opts: { onProgress: (percent: number) => void; signal: AbortSignal },
  ): Promise<{ digest: string }>; // digest as reported by the canonical layer
}