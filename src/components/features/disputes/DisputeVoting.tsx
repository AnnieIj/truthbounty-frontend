import { useState } from 'react';

interface DisputeVotingProps {
  disputeId: string;
  currentStaked: number;
  onVote: (disputeId: string, side: 'PRO' | 'CON', amount: number) => Promise<void>;
}

export const DisputeVoting = ({ disputeId, currentStaked, onVote }: DisputeVotingProps) => {
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleVote = async (side: 'PRO' | 'CON') => {
    if (!amount) return;
    setLoading(true);
    await onVote(disputeId, side, Number(amount));
    setLoading(false);
    setAmount('');
  };

  return (
    <div className="rounded-xl border border-red-900/50 bg-red-950/10 p-4 sm:p-5 mt-4 sm:mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 sm:mb-4 gap-2 sm:gap-0">
        <h3 className="text-white font-semibold flex items-center gap-2 text-sm sm:text-base">
          {/* V2-FE-071 — static, motion-free attention cue. The flashing
              pulsing span was removed: such indicators are killed under
              reduced motion anyway, so comprehension must not rely on them.
              The "Active" text + red dot already carry the meaning. */}
          <span
            aria-hidden="true"
            className="relative inline-flex h-3 w-3 rounded-full bg-red-500 ring-2 ring-red-400/40"
          ></span>
          Active Dispute Voting
        </h3>
        <span className="text-xs sm:text-sm text-red-400 font-mono">${currentStaked.toLocaleString()} Staked</span>
      </div>

      <div className="mb-3 sm:mb-4">
        <label htmlFor="dispute-stake-amount" className="sr-only">Enter stake amount</label>
        <input
          id="dispute-stake-amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter stake amount"
          aria-label="Enter stake amount"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 sm:p-3 text-white focus:border-red-500 outline-none text-base"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <button
          onClick={() => handleVote('PRO')}
          disabled={loading || !amount}
          className="py-2.5 sm:py-2.5 rounded-lg bg-green-900/30 border border-green-800 text-green-400 hover:bg-green-900/50 font-bold transition-all text-sm sm:text-base"
        >
          Vote Valid
        </button>
        <button
          onClick={() => handleVote('CON')}
          disabled={loading || !amount}
          className="py-2.5 sm:py-2.5 rounded-lg bg-red-900/30 border border-red-800 text-red-400 hover:bg-red-900/50 font-bold transition-all text-sm sm:text-base"
        >
          Vote Invalid
        </button>
      </div>
    </div>
  );
};