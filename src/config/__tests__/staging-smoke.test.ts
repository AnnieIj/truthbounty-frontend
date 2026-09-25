/**
 * V2-FE-148 — Unit tests for the fail-closed staging smoke classifier.
 *
 * These tests lock in the security-critical behavior: an unterminated probe,
 * an unknown target, a non-finite status, or an over-latency probe must NEVER
 * produce a pass. The classifier must fail closed — `healthy` requires every
 * configured target to pass with a real, finite capture.
 */

import {
  classifyStagingSmokeGate,
  classifyStagingSmokeProbe,
  getStagingSmokeTarget,
} from '../staging-smoke';
import type { StagingSmokeProbe, StagingSmokeTarget } from '../staging-smoke';

const homeTarget: StagingSmokeTarget = {
  id: 'home',
  kind: 'page',
  name: 'Home',
  path: '/',
  expectedStatus: 200,
  latencyMs: 3000,
};

describe('classifyStagingSmokeProbe', () => {
  it('passes only when status and latency both satisfy the target', () => {
    const result = classifyStagingSmokeProbe(homeTarget, {
      targetId: homeTarget.id,
      status: 200,
      latencyMs: 240,
    });
    expect(result.passed).toBe(true);
    expect(result.statusOk).toBe(true);
    expect(result.withinLatency).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('fails closed on a non-expected status', () => {
    const result = classifyStagingSmokeProbe(homeTarget, {
      targetId: homeTarget.id,
      status: 500,
      latencyMs: 240,
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('not satisfied');
  });

  it('fails closed when latency exceeds the budget', () => {
    const result = classifyStagingSmokeProbe(homeTarget, {
      targetId: homeTarget.id,
      status: 200,
      latencyMs: 6000,
    });
    expect(result.withinLatency).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('fails closed on an unterminated probe (null status)', () => {
    const result = classifyStagingSmokeProbe(homeTarget, {
      targetId: homeTarget.id,
      status: null,
      latencyMs: null,
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('refusing to pass');
  });

  it('fails closed when the target is unknown (never fabricated)', () => {
    const result = classifyStagingSmokeProbe(null, {
      targetId: 'ghost',
      status: 200,
      latencyMs: 10,
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('not configured');
  });
});

describe('classifyStagingSmokeGate', () => {
  it('reports healthy when every configured target passes', () => {
    const probes: StagingSmokeProbe[] = [
      { targetId: 'home', status: 200, latencyMs: 200 },
      { targetId: 'protocol', status: 200, latencyMs: 300 },
    ];
    const result = classifyStagingSmokeGate(probes);
    expect(result.status).toBe('healthy');
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.unknown).toBe(0);
  });

  it('reports failed when any captured probe violates its target', () => {
    const probes: StagingSmokeProbe[] = [
      { targetId: 'home', status: 200, latencyMs: 200 },
      { targetId: 'protocol', status: 503, latencyMs: 300 },
    ];
    const result = classifyStagingSmokeGate(probes);
    expect(result.status).toBe('failed');
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('reports unknown (fail closed, never healthy) when a probe was not captured', () => {
    const probes: StagingSmokeProbe[] = [
      { targetId: 'home', status: 200, latencyMs: 200 },
      { targetId: 'protocol', status: null, latencyMs: null },
    ];
    const result = classifyStagingSmokeGate(probes);
    expect(result.status).toBe('unknown');
    expect(result.unknown).toBe(1);
    // NEVER a healthy verdict with an unterminated probe.
    expect(result.status).not.toBe('healthy');
  });

  it('over-latency probe is a hard failure, not an unknown', () => {
    const probes: StagingSmokeProbe[] = [
      { targetId: 'home', status: 200, latencyMs: 99999 },
    ];
    const result = classifyStagingSmokeGate(probes);
    expect(result.status).toBe('failed');
    expect(result.failed).toBe(1);
    expect(result.unknown).toBe(0);
  });
});

describe('getStagingSmokeTarget', () => {
  it('returns the canonical home target from the artifact', () => {
    const target = getStagingSmokeTarget('home');
    expect(target).not.toBeNull();
    expect(target?.kind).toBe('page');
    expect(target?.path).toBe('/');
  });

  it('returns null for unknown ids (fail closed)', () => {
    expect(getStagingSmokeTarget('does-not-exist')).toBeNull();
  });
});