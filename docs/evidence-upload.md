# Evidence upload: progress and recovery

## States
idle → hashing → uploading → verified | failed | cancelled | invalidated

- Progress is bytes sent. It is capped at 99% until the canonical layer's digest matches the local SHA-256.
- Only `verified` allows claim submission.

## Failures
| Failure | Retry? | User action |
|---|---|---|
| network, stale | Yes | Retry without re-picking the file |
| rejected, too-large, unsupported-type | No | Choose another file |
| integrity-mismatch | No | Choose the file again; nothing was accepted |

## Wallet changes
An account or chain change aborts the upload and invalidates it. The user must choose the file again.

## Privacy
File names, contents and digests are never logged or sent to telemetry.

## Known limits
Hashing reads the whole file into memory.