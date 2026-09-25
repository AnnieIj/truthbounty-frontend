/**
 * Regression guard: every `target="_blank"` anchor in production TSX must
 * carry a hardened rel (noopener + noreferrer). Uses the same source-walk
 * pattern as reduced-motion / mock-removal guards.
 *
 * @jest-environment node
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');

type Match = {
  file: string;
  line: number;
  snippet: string;
  tagName: string | null;
  relValue: string | null;
};

function shouldExcludeFile(relPath: string): boolean {
  const normalized = relPath.split(path.sep).join('/');
  if (normalized.includes('/__tests__/')) return true;
  if (normalized.includes('/stories/')) return true;
  if (normalized.endsWith('.stories.tsx')) return true;
  if (normalized === 'data/mock-data.ts') return true;
  return false;
}

function collectProductionTsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(SRC, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      if (entry.name === 'stories') continue;
      collectProductionTsxFiles(full, acc);
    } else if (entry.name.endsWith('.tsx') && !shouldExcludeFile(rel)) {
      acc.push(full);
    }
  }
  return acc;
}

function isHardenedRel(rel: string | undefined | null): boolean {
  if (!rel) return false;
  const tokens = rel.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.includes('noopener') && tokens.includes('noreferrer');
}

function extractRelFromOpeningTag(openingTag: string): string | null {
  const relLiteral = /\brel\s*=\s*"([^"]*)"/i.exec(openingTag);
  if (relLiteral) return relLiteral[1];
  const relBrace = /\brel\s*=\s*\{([^}]*)\}/i.exec(openingTag);
  if (relBrace) {
    const inner = relBrace[1].trim();
    const strMatch = /^["'`]([^"'`]*)["'`]$/.exec(inner);
    if (strMatch) return strMatch[1];
    return inner;
  }
  return null;
}

function extractRelFromObjectProps(objStr: string): string | null {
  const relLiteral = /(?:^|,)\s*rel\s*:\s*"([^"]*)"/i.exec(objStr);
  if (relLiteral) return relLiteral[1];
  const relLiteral2 = /(?:^|,)\s*rel\s*:\s*'([^']*)'/i.exec(objStr);
  if (relLiteral2) return relLiteral2[1];
  const relIdent = /(?:^|,)\s*rel\s*:\s*([A-Za-z_$][\w$]*)/i.exec(objStr);
  if (relIdent) return relIdent[1];
  return null;
}

function detectTargetBlankJsx(content: string, file: string): Match[] {
  const matches: Match[] = [];
  const lines = content.split('\n');

  const tagStack: { startLine: number; buffer: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    let j = 0;
    while (j < line.length) {
      if (tagStack.length > 0) {
        const current = tagStack[tagStack.length - 1];
        const closeSelf = line.indexOf('/>', j);
        const closeOpen = line.indexOf('>', j);
        if (closeSelf !== -1 && (closeOpen === -1 || closeSelf < closeOpen)) {
          current.buffer += ' ' + line.slice(j, closeSelf + 2);
          processTag(current.buffer, current.startLine);
          tagStack.pop();
          j = closeSelf + 2;
          continue;
        } else if (closeOpen !== -1) {
          current.buffer += ' ' + line.slice(j, closeOpen + 1);
          processTag(current.buffer, current.startLine);
          tagStack.pop();
          j = closeOpen + 1;
          continue;
        } else {
          current.buffer += ' ' + line.slice(j);
          break;
        }
      }

      const tagStart = line.indexOf('<', j);
      if (tagStart === -1) break;

      const after = line.slice(tagStart + 1);
      if (/^[A-Za-z_]/.test(after)) {
        const identMatch = /^([A-Za-z_$][\w$]*)/.exec(after);
        if (identMatch) {
          tagStack.push({
            startLine: i + 1,
            buffer: line.slice(tagStart),
          });
          j = tagStart + 1 + identMatch[0].length;
          continue;
        }
      }
      j = tagStart + 1;
    }
  }

  function processTag(rawTag: string, lineNum: number) {
    const normalized = rawTag.replace(/\s+/g, ' ').trim();

    const tagNameMatch = /^<\s*([A-Za-z_$][\w$]*)/.exec(normalized);
    const tagName = tagNameMatch ? tagNameMatch[1] : null;

    const hasTargetBlankLiteral = /\btarget\s*=\s*"_blank"/i.test(normalized);
    const hasTargetBlankBrace = /\btarget\s*=\s*\{\s*["'`]_blank["'`]\s*\}/i.test(normalized);

    if (!hasTargetBlankLiteral && !hasTargetBlankBrace) return;

    if (tagName === 'SafeExternalLink') return;

    const relValue = extractRelFromOpeningTag(normalized);

    matches.push({
      file,
      line: lineNum,
      snippet: normalized.slice(0, 200),
      tagName,
      relValue,
    });
  }

  return matches;
}

function detectTargetBlankObject(content: string, file: string): Match[] {
  const matches: Match[] = [];
  const lines = content.split('\n');

  const objStack: { startLine: number; buffer: string; depth: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    let j = 0;
    while (j < line.length) {
      if (objStack.length > 0) {
        const current = objStack[objStack.length - 1];
        for (let k = j; k < line.length; k++) {
          const ch = line[k];
          if (ch === '{') current.depth++;
          if (ch === '}') {
            current.depth--;
            if (current.depth === 0) {
              current.buffer += line.slice(j, k + 1);
              processObject(current.buffer, current.startLine);
              objStack.pop();
              j = k + 1;
              break;
            }
          }
        }
        if (objStack.length > 0 && j === line.length) {
          objStack[objStack.length - 1].buffer += line.slice(j) + ' ';
          break;
        }
        continue;
      }

      const objStart = line.indexOf('{', j);
      if (objStart === -1) break;

      const before = line.slice(Math.max(0, objStart - 40), objStart);
      if (/=|:\s*$/.test(before) || /spread|props|attrs/i.test(before)) {
        objStack.push({
          startLine: i + 1,
          buffer: '{',
          depth: 1,
        });
        j = objStart + 1;
        continue;
      }
      j = objStart + 1;
    }
  }

  function processObject(rawObj: string, lineNum: number) {
    const normalized = rawObj.replace(/\s+/g, ' ').trim();

    const hasTargetBlank = /(?:^|,)\s*target\s*:\s*["'`]_blank["'`]/i.test(normalized);
    if (!hasTargetBlank) return;

    const inner = normalized.slice(1, -1).trim();
    const relValue = extractRelFromObjectProps(inner);

    matches.push({
      file,
      line: lineNum,
      snippet: normalized.slice(0, 200),
      tagName: '(object props)',
      relValue,
    });
  }

  return matches;
}

describe('external link hardening (target="_blank" requires noopener + noreferrer)', () => {
  const allProductionTsx = collectProductionTsxFiles(SRC);

  it('enumerates at least the expected production source directories', () => {
    expect(allProductionTsx.length).toBeGreaterThan(0);
  });

  it('every anchor/object with target="_blank" passes isHardenedRel, or uses SafeExternalLink', () => {
    const violations: string[] = [];

    for (const file of allProductionTsx) {
      const content = fs.readFileSync(file, 'utf8');
      const rel = path.relative(SRC, file).split(path.sep).join('/');

      const jsxMatches = detectTargetBlankJsx(content, rel);
      const objMatches = detectTargetBlankObject(content, rel);

      for (const m of [...jsxMatches, ...objMatches]) {
        if (!isHardenedRel(m.relValue)) {
          violations.push(
            `${m.file}:${m.line} — tag=${m.tagName ?? '?'} rel=${m.relValue ?? '(missing)'} — ${m.snippet}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
