/**
 * V2-FE-148 — Staging smoke configuration.
 *
 * Single typed view over `staging-smoke.json` (the canonical artifact). Used by:
 *  - `scripts/verify-staging-smoke.mjs` (staging-gate enforcement)
 *  - `src/lib/staging-smoke/*` (fail-closed smoke classification)
 *
 * Security/architecture invariants:
 *  - Targets are FAIL CLOSED: an unknown/missing target is NULL — callers must
 *    treat it as unknown and never fabricate a pass.
 *  - Latency is a bound (positive, finite) latency budget in milliseconds; a
 *    target absent from the artifact is never verified as healthy.
 *  - No telemetry, secrets, or network calls are introduced here.
 */

import smokeJson from './staging-smoke.json';

export type StagingSmokeTargetKind = 'page' | 'api';

export interface StagingSmokeTarget {
  readonly id: string;
  readonly kind: StagingSmokeTargetKind;
  /** Display name used in gate output. */
  readonly name: string;
  /** Canonical route/handler path matched at verification time. */
  readonly path: string;
  /** HTTP status that proves the target is healthy. */
  readonly expectedStatus: number;
  /** Latency budget in milliseconds; a positive finite number. */
  readonly latencyMs: number;
}

export interface StagingSmokeConfig {
  readonly schemaVersion: number;
  readonly description: string;
  readonly stalenessMs: number;
  readonly targets: readonly StagingSmokeTarget[];
}

export interface StagingSmokeProbe {
  readonly targetId: string;
  /** Measured HTTP status, or null when the probe could not be captured. */
  readonly status: number | null;
  /** Measured latency in milliseconds, or null when not captured. */
  readonly latencyMs: number | null;
}

export interface StagingSmokeProbeResult {
  readonly targetId: string;
  readonly status: number | null;
  readonly latencyMs: number | null;
  readonly statusOk: boolean;
  readonly withinLatency: boolean;
  readonly passed: boolean;
  readonly reason: string | null;
}

export type StagingSmokeStatus = 'healthy' | 'failed' | 'unknown';

export interface StagingSmokeClassification {
  readonly status: StagingSmokeStatus;
  readonly passed: number;
  readonly failed: number;
  readonly unknown: number;
  readonly results: readonly StagingSmokeProbeResult[];
}

/**
 * Loader for the canonical staging artifact. The literal union is recovered
 * with a cast because JSON imports widen `kind` to `string`; the artifact's
 * schema itself is validated at build time by
 * `scripts/verify-staging-smoke.mjs`.
 */
export const STAGING_SMOKE_CONFIG: StagingSmokeConfig =
  smokeJson as unknown as StagingSmokeConfig;

export function getStagingSmokeTargets(): readonly StagingSmokeTarget[] {
  return STAGING_SMOKE_CONFIG.targets;
}

export function getStagingSmokeStalenessMs(): number {
  return STAGING_SMOKE_CONFIG.stalenessMs;
}

/**
 * Match a target by id. Unknown ids are NULL — callers fail closed, never
 * fabricating a pass for an unconfigured target.
 */
export function getStagingSmokeTarget(id: string): StagingSmokeTarget | null {
  return getStagingSmokeTargets().find((t) => t.id === id) ?? null;
}

/**
 * Classify a single probe against its target. FAILS CLOSED: an unknown target,
 * non-finite status, or over-latency probe is never a pass.
 */
export function classifyStagingSmokeProbe(
  target: StagingSmokeTarget | null,
  probe: StagingSmokeProbe,
): StagingSmokeProbeResult {
  if (!target) {
    return {
      targetId: probe.targetId,
      status: probe.status,
      latencyMs: probe.latencyMs,
      statusOk: false,
      withinLatency: false,
      passed: false,
      reason: 'Target not configured; refusing to fabricate a pass.',
    };
  }

  const status = probe.status;
  const latencyMs = probe.latencyMs;
  const statusOk = status !== null && Number.isFinite(status) && status === target.expectedStatus;
  const withinLatency =
    latencyMs !== null && Number.isFinite(latencyMs) && latencyMs <= target.latencyMs;
  const passed = statusOk && withinLatency;

  return {
    targetId: target.id,
    status: probe.status,
    latencyMs: probe.latencyMs,
    statusOk,
    withinLatency,
    passed,
    reason: passed ? null : 'Staging smoke target not satisfied; refusing to pass.',
  };
}

/**
 * Aggregate per-target probe results into a single gate verdict. FAILS CLOSED:
 * `healthy` requires every target to pass; any unknown/missing probe yields
 * `unknown`, never a fabricated pass.
 */
export function classifyStagingSmokeGate(
  probes: readonly StagingSmokeProbe[],
): StagingSmokeClassification {
  const results = probes.map((probe) =>
    classifyStagingSmokeProbe(getStagingSmokeTarget(probe.targetId), probe),
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed && r.status !== null).length;
  const unknown = results.filter((r) => r.status === null).length;

  const status: StagingSmokeStatus =
    failed > 0 ? 'failed' : unknown > 0 ? 'unknown' : passed === results.length ? 'healthy' : 'failed';

  return { status, passed, failed, unknown: unknown, results };
}
