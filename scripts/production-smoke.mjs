#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join } from 'path';

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export function loadRelease(releaseDir) {
  const manifest = JSON.parse(readFileSync(join(releaseDir, 'manifest.json'), 'utf8'));
  if (!Number.isInteger(manifest.chainId) || manifest.chainId <= 0) {
    throw new Error('Release manifest has an invalid chain ID');
  }
  if (!manifest.contracts || typeof manifest.contracts !== 'object') {
    throw new Error('Release manifest has no contracts');
  }

  const addresses = Object.entries(manifest.contracts).flatMap(([name, contract]) => {
    const proxy = contract?.proxy;
    const implementation = contract?.implementation;
    if (!ADDRESS.test(proxy ?? '') || !ADDRESS.test(implementation ?? '')) {
      throw new Error(`Release manifest has an invalid address for ${name}`);
    }
    return [[`${name}.proxy`, proxy], [`${name}.implementation`, implementation]];
  });
  if (addresses.length === 0) throw new Error('Release manifest has no deployed contracts');
  return { chainId: manifest.chainId, addresses };
}

export async function rpcCall(fetchImpl, rpcUrl, method, params = []) {
  const response = await fetchImpl(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC ${method} failed with HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error || payload.result === undefined) throw new Error(`RPC ${method} returned an invalid response`);
  return payload.result;
}

export async function runProductionSmoke({ fetchImpl = fetch, rpcUrl, releaseDir }) {
  if (!rpcUrl) throw new Error('TRUTHBOUNTY_SMOKE_RPC_URL is required');
  const release = loadRelease(releaseDir);
  const reportedChain = await rpcCall(fetchImpl, rpcUrl, 'eth_chainId');
  if (reportedChain !== `0x${release.chainId.toString(16)}`) {
    throw new Error(`RPC chain mismatch: expected ${release.chainId}, received ${reportedChain}`);
  }
  await rpcCall(fetchImpl, rpcUrl, 'eth_blockNumber');
  for (const [name, address] of release.addresses) {
    const code = await rpcCall(fetchImpl, rpcUrl, 'eth_getCode', [address, 'latest']);
    if (typeof code !== 'string' || !/^0x[0-9a-fA-F]+$/.test(code) || code === '0x') {
      throw new Error(`No deployed bytecode for ${name}`);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('production-smoke.mjs')) {
  const releaseDir = process.env.TRUTHBOUNTY_ARTIFACT_DIR ?? join(process.cwd(), 'release');
  runProductionSmoke({ rpcUrl: process.env.TRUTHBOUNTY_SMOKE_RPC_URL, releaseDir })
    .then(() => console.log('Production read-only smoke checks passed'))
    .catch((error) => {
      console.error(`Production smoke checks failed: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
}
