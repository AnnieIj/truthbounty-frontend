import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');

const FORBIDDEN_RUNTIME_TOKENS = [
  'mock-wagmi',
  'mock-wallet-provider',
  'transaction-simulator',
  "from '@stellar",
  'from "stellarsdk',
  'from "@stellar',
  'freighter',
];

const CHANGED_PRODUCTION_SOURCES = [
  'src/app/lib/protocol-time.ts',
  'src/app/lib/format.ts',
  'src/components/features/worldcoin/VerificationStatusIndicator.tsx',
  'src/components/features/worldcoin/VerificationSuccessCard.tsx',
];

function normalizeIdentifier(token: string): string {
  return token.toLowerCase().replace(/['";]/g, '');
}

describe('artifact-drift regression: no mocks/placeholders in production sources', () => {
  it.each(CHANGED_PRODUCTION_SOURCES)(
    '%s contains no Stellar/Freighter/mock/simulator runtime dependencies',
    (relativePath) => {
      const absolutePath = path.join(PROJECT_ROOT, relativePath);
      const source = fs.readFileSync(absolutePath, 'utf8');
      const lower = source.toLowerCase();

      const offending = FORBIDDEN_RUNTIME_TOKENS.filter((token) =>
        lower.includes(normalizeIdentifier(token))
      );

      expect(offending).toEqual([]);
    }
  );

  it('stays free of placeholder contract addresses and fabricated values', () => {
    const sources = CHANGED_PRODUCTION_SOURCES.map((relativePath) =>
      fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8')
    ).join('\n');

    expect(sources).not.toContain('0xYourContractAddress');
    expect(sources).not.toContain('setTimeout');
    expect(sources).not.toMatch(/Math\.random\(\)/);
  });
});