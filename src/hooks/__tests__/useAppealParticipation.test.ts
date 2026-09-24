/**
 * Unit tests for useAppealParticipation hook.
 *
 * Covers the real ABI-driven flow: fail-closed ABI discovery, validation,
 * eth_call simulation, allowance/approval, wallet write, receipt polling
 * (confirmed / reverted / dropped / stale), and replacement controls.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { toFunctionSelector } from 'viem';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
} from 'wagmi';
import {
  isAppealParticipationSupported,
  normalizeAppealIdToBytes32,
  useAppealParticipation,
} from '../useAppealParticipation';
import { getContractAbi } from '@/lib/contracts/registry';
import {
  MOCK_ADDRESS_1,
  MOCK_CHAIN_ID,
  MOCK_TX_HASH_1,
  MOCK_TX_HASH_2,
} from '@/__tests__/mocks/wagmi/mock-wagmi';
import {
  AppealDeadline,
  AppealParticipationContext,
  AppealSnapshot,
  AppealStakeBounds,
  AppealWalletPosition,
} from '@/app/types/appeal';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
  usePublicClient: jest.fn(),
  useWriteContract: jest.fn(),
}));

const WALLET = MOCK_ADDRESS_1;
const CHAIN = MOCK_CHAIN_ID;
const TX_HASH = MOCK_TX_HASH_1;

const MOCK_CONTRACT = '0x1234567890abcdef1234567890abcdef12345678' as const;
const STAKING_TOKEN = '0x3333333333333333333333333333333333333333' as const;

const APPEAL_ID = '0x' + 'ab'.repeat(32);
const CLAIM_ID = 'claim-456';
const DISPUTE_ID = 'dispute-789';

const PARTICIPATE_SELECTOR = toFunctionSelector(
  'participateInAppeal(bytes32,bool,uint256)'
);

const TEST_ABI = [
  {
    type: 'function',
    name: 'participateInAppeal',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'appealId', type: 'bytes32' },
      { name: 'support', type: 'bool' },
      { name: 'stakeAmount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const mockedUseAccount = useAccount as jest.Mock;
const mockedUseChainId = useChainId as jest.Mock;
const mockedUsePublicClient = usePublicClient as jest.Mock;
const mockedUseWriteContract = useWriteContract as jest.Mock;

const mockSimulateContract = jest.fn();
const mockGetTransactionReceipt = jest.fn();
const mockReadContract = jest.fn();
const mockWriteContractAsync = jest.fn();

let allowanceValue = 0n;

const createMockContext = (
  overrides?: Partial<AppealParticipationContext>
): AppealParticipationContext => {
  const snapshot: AppealSnapshot = {
    appealId: APPEAL_ID,
    claimId: CLAIM_ID,
    disputeId: DISPUTE_ID,
    initiatorAddress: '0x' + '1'.repeat(40),
    initiatorStake: '1000000000000000000',
    firstRoundDecision: 'VERIFIED',
    firstRoundVotesFor: 15,
    firstRoundVotesAgainst: 8,
    reason: 'Test appeal reason',
    initiatedAt: new Date().toISOString(),
    blockNumber: 12345000,
  };

  const deadline: AppealDeadline = {
    appealId: APPEAL_ID,
    startTime: new Date(Date.now() - 3_600_000).toISOString(),
    endTime: new Date(Date.now() + 3_600_000).toISOString(),
    timeRemaining: 3_600,
    endBlock: 12_347_000,
    currentBlock: 12_345_500,
    blocksRemaining: 1_500,
    isActive: true,
    hasEnded: false,
  };

  const stakeBounds: AppealStakeBounds = {
    appealId: APPEAL_ID,
    minStake: '100000000000000000', // 0.1 ETH
    maxStake: '10000000000000000000', // 10 ETH
    recommendedStake: '500000000000000000', // 0.5 ETH
    totalSupportStake: '3500000000000000000',
    totalOpposeStake: '2100000000000000000',
    supporterCount: 7,
    opposerCount: 4,
  };

  const walletPosition: AppealWalletPosition = {
    appealId: APPEAL_ID,
    userAddress: WALLET,
    hasParticipated: false,
    currentBalance: '5000000000000000000', // 5 ETH
    hasMinimumBalance: true,
  };

  return {
    snapshot,
    deadline,
    stakeBounds,
    walletPosition,
    isEligible: true,
    ...overrides,
  };
};

const renderAppeal = (config: Record<string, unknown> = {}) =>
  renderHook(() =>
    useAppealParticipation({
      contractAddress: MOCK_CONTRACT,
      abi: TEST_ABI,
      ...config,
    })
  );

function installDefaultMocks() {
  mockSimulateContract.mockResolvedValue({ request: {} });
  mockGetTransactionReceipt.mockResolvedValue({
    transactionHash: TX_HASH,
    status: '0x1',
    blockNumber: 1234n,
    gasUsed: 21000n,
    chainId: CHAIN,
  });
  mockReadContract.mockImplementation(
    ({ functionName }: { functionName: string }) =>
      functionName === 'allowance' ? allowanceValue : undefined
  );
  mockedUsePublicClient.mockReturnValue({
    simulateContract: mockSimulateContract,
    getTransactionReceipt: mockGetTransactionReceipt,
    readContract: mockReadContract,
  });
  mockWriteContractAsync.mockImplementation(
    ({ functionName }: { functionName: string }) => {
      if (functionName === 'approve') {
        allowanceValue = BigInt('10000000000000000000');
        return Promise.resolve(MOCK_TX_HASH_2);
      }
      return Promise.resolve(TX_HASH);
    }
  );
  mockedUseWriteContract.mockReturnValue({
    writeContractAsync: mockWriteContractAsync,
  });
  mockedUseAccount.mockReturnValue({ address: WALLET, isConnected: true });
  mockedUseChainId.mockReturnValue(CHAIN);
}

beforeEach(() => {
  jest.clearAllMocks();
  allowanceValue = 0n;
  installDefaultMocks();
});

describe('fail-closed ABI discovery', () => {
  it('reports the canonical release ABI does NOT support participateInAppeal', () => {
    expect(isAppealParticipationSupported(getContractAbi('TruthBountyWeighted'))).toBe(
      false
    );
  });

  it('accepts an ABI that genuinely declares participateInAppeal', () => {
    expect(isAppealParticipationSupported(TEST_ABI)).toBe(true);
  });

  it('rejects an ABI without the function', () => {
    expect(
      isAppealParticipationSupported([{ type: 'function', name: 'balanceOf' }])
    ).toBe(false);
  });

  it('submission fails closed with UNSUPPORTED_ABI when the function is absent', async () => {
    const { result } = renderHook(() => useAppealParticipation());

    await act(async () => {
      await expect(
        result.current.submitParticipation(
          createMockContext(),
          'SUPPORT',
          '500000000000000000'
        )
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_ABI' });
    });

    expect(result.current.phase).toBe('unsupported');
    expect(result.current.lastTransaction).toBeNull();
    expect(mockWriteContractAsync).not.toHaveBeenCalled();
  });

  it('simulation fails closed with UNSUPPORTED_ABI when the function is absent', async () => {
    const { result } = renderHook(() => useAppealParticipation());

    let simulation: any;
    await act(async () => {
      simulation = await result.current.simulateParticipation(
        createMockContext(),
        'SUPPORT',
        '500000000000000000'
      );
    });

    expect(simulation.success).toBe(false);
    expect(simulation.data).toBeUndefined();
    expect(result.current.phase).toBe('unsupported');
    expect(result.current.error?.code).toBe('UNSUPPORTED_ABI');
  });
});

describe('validation errors', () => {
  it('rejects when appeal has ended', () => {
    const { result } = renderAppeal();
    const context = createMockContext({
      deadline: {
        ...createMockContext().deadline,
        timeRemaining: 0,
        isActive: false,
        hasEnded: true,
      },
      isEligible: false,
      ineligibilityReason: 'Appeal period has ended',
    });

    const validation = result.current.validateParticipation(
      context,
      'SUPPORT',
      '500000000000000000'
    );

    expect(validation.isValid).toBe(false);
    expect(validation.checks.appealActive).toBe(false);
    expect(validation.errors).toContain(
      'Appeal period has ended or has not started'
    );
  });

  it('rejects when wallet not connected', () => {
    mockedUseAccount.mockReturnValue({ address: undefined, isConnected: false });
    const { result } = renderAppeal();

    const validation = result.current.validateParticipation(
      createMockContext(),
      'SUPPORT',
      '500000000000000000'
    );

    expect(validation.isValid).toBe(false);
    expect(validation.checks.walletConnected).toBe(false);
    expect(validation.errors).toContain('Wallet not connected');
  });

  it('rejects unsupported chains', () => {
    mockedUseChainId.mockReturnValue(1); // Ethereum mainnet, not Optimism
    const { result } = renderAppeal();

    const validation = result.current.validateParticipation(
      createMockContext(),
      'SUPPORT',
      '500000000000000000'
    );

    expect(validation.checks.supportedChain).toBe(false);
    expect(validation.checks.correctChain).toBe(false);
    expect(validation.isValid).toBe(false);
  });

  it('rejects wrong supported network', () => {
    mockedUseChainId.mockReturnValue(10); // OP Mainnet
    const { result } = renderAppeal({ expectedChainId: CHAIN });

    const validation = result.current.validateParticipation(
      createMockContext(),
      'SUPPORT',
      '500000000000000000'
    );

    expect(validation.checks.supportedChain).toBe(true);
    expect(validation.checks.correctChain).toBe(false);
    expect(validation.errors.some((e) => e.includes('Wrong network'))).toBe(
      true
    );
  });

  it('rejects when the user already participated', () => {
    const { result } = renderAppeal();
    const context = createMockContext({
      walletPosition: {
        appealId: APPEAL_ID,
        userAddress: WALLET,
        hasParticipated: true,
        existingDecision: 'SUPPORT',
        existingStake: '500000000000000000',
        participatedAt: new Date().toISOString(),
        transactionHash: TX_HASH,
        currentBalance: '4500000000000000000',
        hasMinimumBalance: true,
      },
      isEligible: false,
      ineligibilityReason: 'Already participated',
    });

    const validation = result.current.validateParticipation(
      context,
      'OPPOSE',
      '300000000000000000'
    );

    expect(validation.checks.notAlreadyParticipated).toBe(false);
    expect(validation.errors).toContain(
      'You have already participated in this appeal'
    );
  });

  it('rejects stake below minimum', () => {
    const { result } = renderAppeal();
    const validation = result.current.validateParticipation(
      createMockContext(),
      'SUPPORT',
      '50000000000000000' // 0.05 ETH < 0.1 minimum
    );

    expect(validation.checks.stakeWithinBounds).toBe(false);
    expect(validation.errors.some((e) => e.includes('below minimum'))).toBe(true);
  });

  it('rejects stake above maximum', () => {
    const { result } = renderAppeal();
    const validation = result.current.validateParticipation(
      createMockContext(),
      'SUPPORT',
      '15000000000000000000' // 15 ETH > 10 maximum
    );

    expect(validation.checks.stakeWithinBounds).toBe(false);
    expect(validation.errors.some((e) => e.includes('exceeds maximum'))).toBe(
      true
    );
  });

  it('rejects insufficient balance', () => {
    const { result } = renderAppeal();
    const context = createMockContext({
      walletPosition: {
        appealId: APPEAL_ID,
        userAddress: WALLET,
        hasParticipated: false,
        currentBalance: '50000000000000000', // 0.05 ETH
        hasMinimumBalance: false,
      },
    });

    const validation = result.current.validateParticipation(
      context,
      'SUPPORT',
      '100000000000000000'
    );

    expect(validation.checks.sufficientBalance).toBe(false);
    expect(validation.errors).toContain('Insufficient balance for stake amount');
  });

  it('rejects invalid contract address', () => {
    const { result } = renderAppeal({ contractAddress: '0xinvalid' });
    const validation = result.current.validateParticipation(
      createMockContext(),
      'SUPPORT',
      '500000000000000000'
    );

    expect(validation.checks.contractAddressValid).toBe(false);
    expect(validation.errors).toContain('Invalid contract address format');
  });

  it('rejects invalid stake amount format', () => {
    const { result } = renderAppeal();
    const validation = result.current.validateParticipation(
      createMockContext(),
      'SUPPORT',
      'invalid-amount'
    );

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('Invalid stake amount format');
  });

  it('rejects an artifact version mismatch', () => {
    const { result } = renderAppeal({ artifactVersion: 'v2.1.0' });
    const validation = result.current.validateParticipation(
      createMockContext(),
      'SUPPORT',
      '500000000000000000'
    );

    expect(validation.checks.artifactVersionValid).toBe(false);
    expect(validation.errors.some((e) => e.includes('version mismatch'))).toBe(
      true
    );
  });

  it('warns when stake is significantly below recommended', () => {
    const { result } = renderAppeal();
    const validation = result.current.validateParticipation(
      createMockContext(),
      'SUPPORT',
      '150000000000000000' // 0.15 ETH < half of 0.5 recommended
    );

    expect(validation.isValid).toBe(true);
    expect(
      validation.warnings.some((w) => w.includes('below recommended'))
    ).toBe(true);
  });
});

describe('simulateParticipation', () => {
  it('encodes real calldata for SUPPORT and never fabricates projections', async () => {
    const { result } = renderAppeal();
    let simulation: any;

    await act(async () => {
      simulation = await result.current.simulateParticipation(
        createMockContext(),
        'SUPPORT',
        '500000000000000000'
      );
    });

    expect(simulation.success).toBe(true);
    expect(simulation.data).toBeDefined();
    expect(simulation.data.from).toBe(WALLET);
    expect(simulation.data.to).toBe(MOCK_CONTRACT);
    expect(simulation.data.calldata.startsWith(PARTICIPATE_SELECTOR)).toBe(true);
    expect(simulation.gasEstimate).toBeUndefined();
    expect(simulation.projectedState).toBeUndefined();
    expect(mockSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'participateInAppeal',
        address: MOCK_CONTRACT,
        account: WALLET,
      })
    );
  });

  it('encodes support=true for SUPPORT decisions', async () => {
    const { result } = renderAppeal();
    let simulation: any;
    await act(async () => {
      simulation = await result.current.simulateParticipation(
        createMockContext(),
        'SUPPORT',
        '500000000000000000'
      );
    });
    // 32-byte bool arg follows selector + appealId word: word 3 = 1 (true)
    const boolOffset = PARTICIPATE_SELECTOR.length + 64;
    const boolWord = simulation.data.calldata.slice(boolOffset, boolOffset + 64);
    expect(boolWord).toMatch(/0{63}1$/);
  });

  it('encodes support=false for OPPOSE decisions', async () => {
    const { result } = renderAppeal();
    let simulation: any;
    await act(async () => {
      simulation = await result.current.simulateParticipation(
        createMockContext(),
        'OPPOSE',
        '300000000000000000'
      );
    });
    const boolOffset = PARTICIPATE_SELECTOR.length + 64;
    const boolWord = simulation.data.calldata.slice(boolOffset, boolOffset + 64);
    expect(boolWord).toMatch(/0{64}$/);
  });

  it('returns failure when eth_call simulation reverts', async () => {
    mockSimulateContract.mockRejectedValueOnce(
      new Error('execution reverted: appeal closed')
    );
    const { result } = renderAppeal();
    let simulation: any;

    await act(async () => {
      simulation = await result.current.simulateParticipation(
        createMockContext(),
        'SUPPORT',
        '500000000000000000'
      );
    });

    expect(simulation.success).toBe(false);
    expect(simulation.error).toContain('Simulation reverted');
  });
});

describe('submitParticipation — confirmation path', () => {
  it('submits, confirms on-chain, and reports a CONFIRMED transaction', async () => {
    const { result } = renderAppeal();
    let transaction: any;

    await act(async () => {
      transaction = await result.current.submitParticipation(
        createMockContext(),
        'SUPPORT',
        '500000000000000000'
      );
    });

    expect(mockWriteContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        address: MOCK_CONTRACT,
        functionName: 'participateInAppeal',
      })
    );
    expect(transaction.transactionHash).toBe(TX_HASH);
    expect(transaction.from).toBe(WALLET);
    expect(transaction.to).toBe(MOCK_CONTRACT);
    expect(transaction.status).toBe('CONFIRMED');
    expect(transaction.decision).toBe('SUPPORT');
    expect(transaction.blockNumber).toBe(1234n);
    expect(transaction.gasUsed).toBe(21000n);
    expect(result.current.phase).toBe('confirmed');
    expect(result.current.lastTransaction?.status).toBe('CONFIRMED');
    expect(result.current.receipt).toBeDefined();
    expect(mockGetTransactionReceipt).toHaveBeenCalledWith({
      hash: TX_HASH,
    });
  });

  it('fails with USER_REJECTED when the wallet rejects the write', async () => {
    mockWriteContractAsync.mockRejectedValueOnce(
      Object.assign(new Error('User rejected the request.'), { code: 4001 })
    );
    const { result } = renderAppeal();

    await act(async () => {
      await expect(
        result.current.submitParticipation(
          createMockContext(),
          'SUPPORT',
          '500000000000000000'
        )
      ).rejects.toMatchObject({ code: 'USER_REJECTED' });
    });

    expect(result.current.phase).toBe('rejected');
  });

  it('fails with TRANSACTION_REVERTED when the receipt reports status 0x0', async () => {
    mockGetTransactionReceipt.mockResolvedValue({
      transactionHash: TX_HASH,
      status: '0x0',
      blockNumber: 1234n,
      chainId: CHAIN,
    });
    const { result } = renderAppeal();

    await act(async () => {
      await expect(
        result.current.submitParticipation(
          createMockContext(),
          'SUPPORT',
          '500000000000000000'
        )
      ).rejects.toMatchObject({ code: 'TRANSACTION_REVERTED' });
    });

    expect(result.current.phase).toBe('reverted');
    expect(result.current.lastTransaction?.status).toBe('REVERTED');
  });

  it('fails with INVALID_APPEAL_ID when the appeal id is not a 32-byte value', async () => {
    const { result } = renderAppeal();
    const context = createMockContext();
    context.snapshot.appealId = 'appeal-123';

    await act(async () => {
      await expect(
        result.current.submitParticipation(
          context,
          'SUPPORT',
          '500000000000000000'
        )
      ).rejects.toMatchObject({ code: 'INVALID_APPEAL_ID' });
    });

    expect(mockWriteContractAsync).not.toHaveBeenCalled();
  });
});

describe('submitParticipation — finality edge cases', () => {
  it('fails with TX_DROPPED when the receipt never appears', async () => {
    mockGetTransactionReceipt.mockResolvedValue(null);
    const { result } = renderAppeal({
      receiptTimeoutMs: 60,
      pollIntervalMs: 10,
    });

    await act(async () => {
      await expect(
        result.current.submitParticipation(
          createMockContext(),
          'SUPPORT',
          '500000000000000000'
        )
      ).rejects.toMatchObject({ code: 'TX_DROPPED' });
    });

    expect(result.current.phase).toBe('dropped');
    expect(result.current.lastTransaction?.status).toBe('DROPPED');
  });

  it('fails with STALE_RECEIPT when the receipt reports a different chain', async () => {
    mockGetTransactionReceipt.mockResolvedValue({
      transactionHash: TX_HASH,
      status: '0x1',
      blockNumber: 1234n,
      chainId: 999999,
    });
    const { result } = renderAppeal();

    await act(async () => {
      await expect(
        result.current.submitParticipation(
          createMockContext(),
          'SUPPORT',
          '500000000000000000'
        )
      ).rejects.toMatchObject({ code: 'STALE_RECEIPT' });
    });

    expect(result.current.phase).toBe('stale');
    expect(result.current.lastTransaction?.status).toBe('STALE');
  });

  it('fails with STALE_RECEIPT when the receipt is for a different transaction', async () => {
    mockGetTransactionReceipt.mockResolvedValue({
      transactionHash: MOCK_TX_HASH_2,
      status: '0x1',
      blockNumber: 1234n,
      chainId: CHAIN,
    });
    const { result } = renderAppeal();

    await act(async () => {
      await expect(
        result.current.submitParticipation(
          createMockContext(),
          'OPPOSE',
          '300000000000000000'
        )
      ).rejects.toMatchObject({ code: 'STALE_RECEIPT' });
    });
  });
});

describe('submitParticipation — allowance and approval', () => {
  const allowanceConfig = { stakeTokenAddress: STAKING_TOKEN };

  it('approves then submits when allowance is below the stake', async () => {
    allowanceValue = 0n;
    const { result } = renderAppeal(allowanceConfig);

    await act(async () => {
      await result.current.submitParticipation(
        createMockContext(),
        'SUPPORT',
        '500000000000000000'
      );
    });

    expect(mockWriteContractAsync).toHaveBeenCalledTimes(2);
    expect(mockWriteContractAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ address: STAKING_TOKEN, functionName: 'approve' })
    );
    expect(mockWriteContractAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ address: MOCK_CONTRACT, functionName: 'participateInAppeal' })
    );
    expect(result.current.allowance).toBe(BigInt('10000000000000000000'));
    expect(result.current.lastTransaction?.status).toBe('CONFIRMED');
  });

  it('skips approval when the allowance already covers the stake', async () => {
    allowanceValue = BigInt('10000000000000000000');
    const { result } = renderAppeal(allowanceConfig);

    await act(async () => {
      await result.current.submitParticipation(
        createMockContext(),
        'SUPPORT',
        '500000000000000000'
      );
    });

    expect(mockWriteContractAsync).toHaveBeenCalledTimes(1);
    expect(mockWriteContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'participateInAppeal' })
    );
  });

  it('fails with APPROVAL_REJECTED when the wallet rejects approval', async () => {
    allowanceValue = 0n;
    mockWriteContractAsync.mockRejectedValueOnce(
      Object.assign(new Error('User rejected the request.'), { code: 4001 })
    );
    const { result } = renderAppeal(allowanceConfig);

    await act(async () => {
      await expect(
        result.current.submitParticipation(
          createMockContext(),
          'SUPPORT',
          '500000000000000000'
        )
      ).rejects.toMatchObject({ code: 'APPROVAL_REJECTED' });
    });

    expect(result.current.phase).toBe('rejected');
  });

  it('fails with ALLOWANCE_INSUFFICIENT when the allowance never updates', async () => {
    allowanceValue = 0n;
    mockWriteContractAsync.mockImplementation(() => Promise.resolve(MOCK_TX_HASH_2));
    const { result } = renderAppeal(allowanceConfig);

    await act(async () => {
      await expect(
        result.current.submitParticipation(
          createMockContext(),
          'SUPPORT',
          '500000000000000000'
        )
      ).rejects.toMatchObject({ code: 'ALLOWANCE_INSUFFICIENT' });
    });

    expect(result.current.phase).toBe('error');
  });
});

describe('transaction lifecycle controls', () => {
  it('marks an in-flight transaction as replaced', async () => {
    const { result } = renderAppeal();

    await act(async () => {
      await result.current.submitParticipation(
        createMockContext(),
        'SUPPORT',
        '500000000000000000'
      );
    });

    act(() => {
      result.current.markReplaced(MOCK_TX_HASH_2);
    });

    expect(result.current.phase).toBe('replaced');
    expect(result.current.error?.code).toBe('TX_REPLACED');
    expect(result.current.lastTransaction?.status).toBe('REPLACED');
    expect(result.current.lastTransaction?.replacedBy).toBe(MOCK_TX_HASH_2);
  });

  it('marks an in-flight transaction as dropped', async () => {
    const { result } = renderAppeal();

    await act(async () => {
      await result.current.submitParticipation(
        createMockContext(),
        'SUPPORT',
        '500000000000000000'
      );
    });

    act(() => {
      result.current.markDropped();
    });

    expect(result.current.phase).toBe('dropped');
    expect(result.current.error?.code).toBe('TX_DROPPED');
    expect(result.current.lastTransaction?.status).toBe('DROPPED');
  });

  it('resets all submission state', async () => {
    const { result } = renderAppeal();

    await act(async () => {
      await result.current.submitParticipation(
        createMockContext(),
        'SUPPORT',
        '500000000000000000'
      );
    });
    expect(result.current.phase).toBe('confirmed');

    act(() => {
      result.current.reset();
    });

    expect(result.current.phase).toBe('idle');
    expect(result.current.lastTransaction).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.receipt).toBeNull();
    expect(result.current.allowance).toBeNull();
  });
});

describe('normalizeAppealIdToBytes32', () => {
  it('accepts a prefixed 32-byte value', () => {
    expect(normalizeAppealIdToBytes32(APPEAL_ID)).toBe(APPEAL_ID);
  });

  it('accepts a bare 64-hex value and prefixes it', () => {
    expect(normalizeAppealIdToBytes32('ab'.repeat(32))).toBe(APPEAL_ID);
  });

  it('rejects non-bytes32 labels instead of synthesizing calldata', () => {
    expect(normalizeAppealIdToBytes32('appeal-123')).toBeNull();
    expect(normalizeAppealIdToBytes32('0xabcd')).toBeNull();
    expect(normalizeAppealIdToBytes32('zz'.repeat(32))).toBeNull();
  });
});