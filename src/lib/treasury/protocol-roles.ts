/**
 * Canonical role accessors for treasury UX (V2-FE-119).
 */

import roles from '../../../release/roles/11155420.json';
import { normalizeAdminAddress } from './safe-withdrawal';

export function getCanonicalTreasuryAdmin(): `0x${string}` | null {
  return normalizeAdminAddress(roles as Record<string, unknown>);
}

export function getCanonicalRoles(): Record<string, unknown> {
  return roles as Record<string, unknown>;
}
