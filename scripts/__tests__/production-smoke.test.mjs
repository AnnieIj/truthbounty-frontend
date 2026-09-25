import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runProductionSmoke } from '../production-smoke.mjs';

function releaseDir() {
  const dir = mkdtempSync(join(tmpdir(), 'truthbounty-smoke-'));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    chainId: 10,
    contracts: { TruthBounty: { proxy: '0x1111111111111111111111111111111111111111', implementation: '0x2222222222222222222222222222222222222222' } },
  }));
  return dir;
}

function rpc(results) {
  return async (_url, options) => ({ ok: true, json: async () => ({ result: results[JSON.parse(options.body).method] }) });
}

test('passes only after chain, block, and deployed bytecode reads succeed', async () => {
  const dir = releaseDir();
  try {
    await runProductionSmoke({ rpcUrl: 'https://rpc.example', releaseDir: dir, fetchImpl: rpc({ eth_chainId: '0xa', eth_blockNumber: '0x1', eth_getCode: '0x6000' }) });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fails closed for missing configuration, chain mismatch, and missing bytecode', async () => {
  const dir = releaseDir();
  try {
    await assert.rejects(runProductionSmoke({ releaseDir: dir }), /TRUTHBOUNTY_SMOKE_RPC_URL/);
    await assert.rejects(runProductionSmoke({ rpcUrl: 'https://rpc.example', releaseDir: dir, fetchImpl: rpc({ eth_chainId: '0x1' }) }), /chain mismatch/);
    await assert.rejects(runProductionSmoke({ rpcUrl: 'https://rpc.example', releaseDir: dir, fetchImpl: rpc({ eth_chainId: '0xa', eth_blockNumber: '0x1', eth_getCode: '0x' }) }), /No deployed bytecode/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
