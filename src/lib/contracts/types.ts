export interface ReleaseManifest {
  protocolVersion: string;
  releaseId: string;
  gitCommit: string;
  compilerVersion: string;
  chainId: number;
  deploymentBlock: number;
  abiVersion: string;
  eventSchemaVersion: string;
  parameterSetVersion: string;
  contracts: Record<
    string,
    {
      proxy: string;
      implementation: string;
    }
  >;
}

export interface AddressMap {
  chainId: number;
  TruthBountyWeighted: string;
  [key: string]: string | number;
}

export interface ChecksumsFile {
  version: string;
  files: Record<string, string>;
}

export interface ProtocolDiagnostics {
  protocolVersion: string;
  releaseId: string;
  chainId: number;
  gitCommit: string;
  artifactPath: string;
  verifiedAt: string;
  /** ABI version from the release manifest (provenance, not a secret). */
  abiVersion: string;
  /** SHA-256 of the tracked ABI file from checksums.json (provenance). */
  abiHash: string | null;
  /** Build environment label only — never env vars or secrets. */
  environment: 'production' | 'development';
  contracts: Record<string, string>;
}

export interface LoadedReleaseArtifacts {
  manifest: ReleaseManifest;
  addresses: AddressMap;
  abis: Record<string, readonly unknown[]>;
  events: { version: string; events: unknown[] };
  parameters: Record<string, unknown>;
  roles: Record<string, unknown>;
  checksums: ChecksumsFile;
}
