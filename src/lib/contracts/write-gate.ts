export * from './types';
export { isValidContractAddress, assertValidContractAddress } from './address-guard';
export * from './registry';
export { loadReleaseArtifacts, resolveReleaseDir } from './load-artifacts';
export {
  // Artifact gate (V2-FE-043)
  evaluateWriteTarget,
  assertWriteReady,
  getWriteGateChainId,
  // Wallet readiness gate (V2-FE-100)
  evaluateWalletWriteReadiness,
  assertWalletWriteReady,
  resolveCanonicalTargetAddress,
  resolveExpectedChainId,
  mapGateFailureToMachineReason,
  // Shared
  WriteGateError,
} from './write-gate';
export type {
  // Artifact gate types
  WriteTargetEvaluation,
  WriteTargetProvenance,
  WriteGateErrorCode,
  EvaluateWriteTargetInput,
  // Wallet readiness gate types
  WriteGateInput,
  WriteGateResult,
  WriteGateFailure,
  WriteGateFailureCode,
} from './write-gate';