'use client';

/**
 * V2-FE-144 — App-level reorg reconciliation surface.
 *
 * Mounts `useReorgReconciliation` inside the WebSocket provider so every
 * screen observes canonical `ROLLBACK`/`REPLACEMENT` events, and renders the
 * accessible `ReorgBanner` when there is something to report.
 * The banner is only rendered when a reorg/replacement is active — no
 * fabricated state is ever displayed.
 */

import { useReorgReconciliation } from '@/hooks/useReorgReconciliation';
import { ReorgBanner } from '@/components/transactions/ReorgBanner';

export function ReorgReconciliationSync() {
  const { banner, acknowledge } = useReorgReconciliation();

  if (banner.state === 'hidden') {
    return null;
  }

  return <ReorgBanner view={banner} onAcknowledge={acknowledge} />;
}

export default ReorgReconciliationSync;
