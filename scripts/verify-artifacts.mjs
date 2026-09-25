#!/usr/bin/env node
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const PLACEHOLDER = /yourcontract|placeholder|dummy/i;
const PLACEHOLDER_COMMIT = /^0+$/;
const releaseDir = process.env.TRUTHBOUNTY_ARTIFACT_DIR ?? join(process.cwd(), 'release');
const expectedVersion = process.env.NEXT_PUBLIC_PROTOCOL_RELEASE;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(contents) {
  const normalized = typeof contents === 'string'
    ? contents.replace(/\r\n/g, '\n')
    : contents.toString('utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function assertAddress(value, label) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`Invalid address for ${label}: ${value}`);
  }
  if (value.toLowerCase() === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Zero address for ${label}`);
  }
  if (PLACEHOLDER.test(value)) {
    throw new Error(`Placeholder address for ${label}: ${value}`);
  }
}

try {
  const checksums = readJson(join(releaseDir, 'checksums.json'));
  for (const [relativePath, expected] of Object.entries(checksums.files)) {
    const filePath = join(releaseDir, relativePath);
    if (!existsSync(filePath)) {
      throw new Error(`Missing tracked artifact: ${relativePath}`);
    }
    const actual = sha256(readFileSync(filePath));
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${relativePath}: artifact drift detected`);
    }
  }

  const requiredTracked = [
    'manifest.json',
    'addresses/11155420.json',
    'abi/TruthBountyWeighted.json',
    'events/event-schema.json',
    'parameters/11155420.json',
    'roles/11155420.json',
  ];
  for (const relativePath of requiredTracked) {
    if (!checksums.files[relativePath]) {
      throw new Error(`checksums.json missing entry for ${relativePath} (artifact drift)`);
    }
  }

  const manifest = readJson(join(releaseDir, 'manifest.json'));
  if (expectedVersion && manifest.protocolVersion !== expectedVersion) {
    throw new Error(
      `Stale release: manifest=${manifest.protocolVersion}, expected=${expectedVersion}`,
    );
  }

  if (
    !manifest.gitCommit ||
    !/^[0-9a-f]{7,40}$/i.test(manifest.gitCommit) ||
    PLACEHOLDER_COMMIT.test(manifest.gitCommit)
  ) {
    throw new Error(`Manifest gitCommit is missing or a zero placeholder: ${manifest.gitCommit}`);
  }

  if (!manifest.compilerVersion || !manifest.abiVersion || !manifest.eventSchemaVersion) {
    throw new Error('Manifest is missing compiler/ABI/event provenance fields');
  }

  const addresses = readJson(join(releaseDir, `addresses/${manifest.chainId}.json`));
  if (addresses.chainId !== manifest.chainId) {
    throw new Error('Address map chainId mismatch');
  }

  assertAddress(addresses.TruthBountyWeighted, 'TruthBountyWeighted');
  for (const [name, entry] of Object.entries(manifest.contracts)) {
    assertAddress(entry.proxy, `${name}.proxy`);
    assertAddress(entry.implementation, `${name}.implementation`);
  }

  console.log(
    `Verified TruthBounty release ${manifest.releaseId} (${manifest.protocolVersion}) on chain ${manifest.chainId}`,
  );
} catch (error) {
  console.error('Artifact verification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
