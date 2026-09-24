/**
 * V2-FE-056 — Canonical aggregation projection types.
 *
 * Aggregation state is a *projection* of canonical on-chain / indexer data
 * (verifier weights, quorum, finality). Nothing here fabricates finality: the
 * `finalized` flag, weights, and freshness come straight from the projection,
 * and the derived verdict/confidence are deterministic functions of those
 * reported weights — never a client timer or guess. Consumers MUST present any
 * non-final projection as provisional.
 *
 * Projection strings are treated as untrusted input and validated before use;
 * malformed weights fail closed (see {@link summarizeAggregation}).
 */

export type AggregationVerdict = 'SUPPORTED' | 'OPPOSED' | 'TIE' | 'UNDECIDED';

/** Raw aggregation projection as returned by the canonical projection source. */
export interface AggregationProjection {
  claimId: string;
  roundId: number;
  /** Supporting verifier weight, wei-scale as a decimal integer string. */
  supportingWeight: string;
  /** Opposing verifier weight, wei-scale as a decimal integer string. */
  opposingWeight: string;
  /** Minimum total weight required for quorum; `null` when unpublished. */
  quorumWeight: string | null;
  /** Canonical finality — true only when the source reports the round finalized. */
  finalized: boolean;
  /** Block the projection was computed at; `null` when unknown. */
  asOfBlock: number | null;
  /** Projection freshness vs head, reported by the source (not a client timer). */
  stale: boolean;
}

/** Deterministic, display-ready summary derived from a validated projection. */
export interface AggregationSummaryView {
  supporting: bigint;
  opposing: bigint;
  total: bigint;
  quorum: bigint | null;
  quorumReached: boolean;
  /** Supporting share of total weight in [0,1]; 0 when no weight is recorded. */
  confidence: number;
  verdict: AggregationVerdict;
  isTie: boolean;
  /** Mirrors the projection's canonical finality flag. */
  finalized: boolean;
}

/** Parse a non-negative decimal integer string; `null` when malformed. */
function parseWeight(value: string): bigint | null {
  if (!/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * Derive a display summary from a projection. Returns `null` (fail closed) when
 * any weight is malformed, so callers render an error state rather than a
 * misleading zeroed summary. The verdict/confidence are factual functions of
 * the reported weights; `finalized` is passed through untouched.
 */
export function summarizeAggregation(
  projection: AggregationProjection,
): AggregationSummaryView | null {
  const supporting = parseWeight(projection.supportingWeight);
  const opposing = parseWeight(projection.opposingWeight);
  if (supporting === null || opposing === null) return null;

  let quorum: bigint | null = null;
  if (projection.quorumWeight !== null) {
    quorum = parseWeight(projection.quorumWeight);
    if (quorum === null) return null;
  }

  const total = supporting + opposing;
  const quorumReached = quorum !== null && total >= quorum;
  const confidence =
    total === 0n ? 0 : Number((supporting * 10_000n) / total) / 10_000;
  const isTie = total > 0n && supporting === opposing;

  let verdict: AggregationVerdict;
  if (total === 0n) {
    verdict = 'UNDECIDED';
  } else if (isTie) {
    verdict = 'TIE';
  } else {
    verdict = supporting > opposing ? 'SUPPORTED' : 'OPPOSED';
  }

  return {
    supporting,
    opposing,
    total,
    quorum,
    quorumReached,
    confidence,
    verdict,
    isTie,
    finalized: projection.finalized,
  };
}
