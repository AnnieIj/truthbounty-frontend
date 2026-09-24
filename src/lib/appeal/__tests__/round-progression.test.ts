/**
 * Unit tests for appeal round progression helpers (V2-FE-059).
 */

import { encodeFunctionData } from 'viem';
import { appealParticipationAbi } from '@/config/protocol/appeal-artifact';
import {
  buildAppealRoundProgression,
  checkStaleRound,
  encodeParticipateInAppeal,
  formatBondWei,
  formatDeadline,
  projectStakeTotals,
  toAppealIdBytes32,
} from '../round-progression';

describe('round-progression', () => {
  describe('toAppealIdBytes32', () => {
    it('pads short hex ids', () => {
      const id = toAppealIdBytes32('0x01');
      expect(id).toMatch(/^0x[0-9a-f]{64}$/);
      expect(id.endsWith('01')).toBe(true);
    });

    it('hashes labels deterministically', () => {
      const a = toAppealIdBytes32('appeal-123');
      const b = toAppealIdBytes32('appeal-123');
      expect(a).toBe(b);
      expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('rejects empty ids', () => {
      expect(() => toAppealIdBytes32('')).toThrow(/empty/i);
    });
  });

  describe('checkStaleRound', () => {
    it('accepts matching rounds', () => {
      expect(checkStaleRound(2n, 2).isStale).toBe(false);
    });

    it('rejects divergent rounds', () => {
      const result = checkStaleRound(3, 2);
      expect(result.isStale).toBe(true);
      expect(result.reason).toMatch(/Stale round/);
    });
  });

  describe('buildAppealRoundProgression', () => {
    it('marks active rounds with remaining time', () => {
      const now = 1_700_000_000;
      const progression = buildAppealRoundProgression({
        appealId: toAppealIdBytes32('appeal-1'),
        expectedRound: 1,
        nowSeconds: now,
        round: {
          roundNumber: 1n,
          requiredBond: 10n ** 18n,
          deadline: BigInt(now + 3600),
          supportStake: 5n * 10n ** 18n,
          opposeStake: 2n * 10n ** 18n,
          state: 1,
          claimId: toAppealIdBytes32('claim-1'),
        },
      });
      expect(progression.isActive).toBe(true);
      expect(progression.hasEnded).toBe(false);
      expect(progression.timeRemainingSeconds).toBe(3600);
      expect(progression.roundMatchesExpected).toBe(true);
      expect(progression.requiredBond).toBe((10n ** 18n).toString());
    });

    it('flags stale expected rounds', () => {
      const now = 1_700_000_000;
      const progression = buildAppealRoundProgression({
        appealId: toAppealIdBytes32('appeal-1'),
        expectedRound: 1,
        nowSeconds: now,
        round: {
          roundNumber: 2n,
          requiredBond: 1n,
          deadline: BigInt(now + 10),
          supportStake: 0n,
          opposeStake: 0n,
          state: 1,
          claimId: toAppealIdBytes32('claim-1'),
        },
      });
      expect(progression.roundMatchesExpected).toBe(false);
    });
  });

  describe('encodeParticipateInAppeal', () => {
    it('uses the versioned ABI selector (no synthetic selectors)', () => {
      const appealId = toAppealIdBytes32('appeal-123');
      const encoded = encodeParticipateInAppeal({
        appealId,
        decision: 'SUPPORT',
        stakeAmount: 5n * 10n ** 17n,
        expectedRound: 1n,
      });
      const expected = encodeFunctionData({
        abi: appealParticipationAbi,
        functionName: 'participateInAppeal',
        args: [appealId, true, 5n * 10n ** 17n, 1n],
      });
      expect(encoded.calldata).toBe(expected);
      expect(encoded.calldata.startsWith('0xabc12345')).toBe(false);
      expect(encoded.calldata.startsWith('0xdef67890')).toBe(false);
      expect(encoded.support).toBe(true);
    });

    it('encodes oppose as support=false', () => {
      const encoded = encodeParticipateInAppeal({
        appealId: toAppealIdBytes32('appeal-123'),
        decision: 'OPPOSE',
        stakeAmount: 1n,
        expectedRound: 2n,
      });
      expect(encoded.support).toBe(false);
      expect(encoded.args[1]).toBe(false);
    });
  });

  describe('projectStakeTotals', () => {
    it('projects support without fabricating rewards', () => {
      const projected = projectStakeTotals({
        decision: 'SUPPORT',
        stakeAmount: 10n ** 18n,
        currentSupport: 35n * 10n ** 17n,
        currentOppose: 21n * 10n ** 17n,
      });
      expect(projected.newSupportTotal).toBe((45n * 10n ** 17n).toString());
      expect(projected.newOpposeTotal).toBe((21n * 10n ** 17n).toString());
      expect(projected.riskAmount).toBe((10n ** 18n).toString());
    });
  });

  describe('formatters', () => {
    it('formats whole-token bonds', () => {
      expect(formatBondWei(10n ** 18n)).toBe('1');
    });

    it('formats deadlines', () => {
      expect(formatDeadline(0)).toBe('Ended');
      expect(formatDeadline(3661)).toMatch(/1h/);
    });
  });
});
