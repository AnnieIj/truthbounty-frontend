#!/usr/bin/env node
import { execFile } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export function loadAllowlist(projectRoot) {
  const allowlistPath = join(projectRoot, '.github', 'dependency-audit-allowlist.json');
  if (!existsSync(allowlistPath)) {
    return { advisories: [] };
  }
  const raw = readFileSync(allowlistPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.advisories)) {
    return { advisories: [] };
  }
  return parsed;
}

export function isAllowlisted(advisoryId, allowlist, now = new Date()) {
  const entry = allowlist.advisories.find((a) => String(a.id) === String(advisoryId));
  if (!entry) return false;
  if (entry.expiresAt === null || entry.expiresAt === undefined) return true;
  const expires = new Date(entry.expiresAt);
  return expires > now;
}

export function extractAdvisories(auditJson) {
  const results = [];
  if (auditJson && typeof auditJson === 'object') {
    if (auditJson.advisories && typeof auditJson.advisories === 'object' && !Array.isArray(auditJson.advisories)) {
      for (const [id, adv] of Object.entries(auditJson.advisories)) {
        results.push({
          id: String(id),
          severity: adv.severity,
          title: adv.title,
        });
      }
    }
    if (auditJson.data && auditJson.data.vulnerabilities && Array.isArray(auditJson.data.vulnerabilities)) {
      for (const vuln of auditJson.data.vulnerabilities) {
        results.push({
          id: String(vuln.advisory?.ghsa_id ?? vuln.advisory?.id ?? vuln.name ?? vuln.url ?? ''),
          severity: vuln.advisory?.severity ?? vuln.severity,
          title: vuln.advisory?.title ?? vuln.title,
        });
      }
    }
  }
  return results;
}

export async function runAudit({ execFn = execFileAsync, projectRoot = process.cwd(), now = new Date() } = {}) {
  const { stdout } = await execFn('pnpm', ['audit', '--prod', '--json'], { cwd: projectRoot, windowsHide: true });
  const allowlist = loadAllowlist(projectRoot);
  let auditJson;
  try {
    auditJson = JSON.parse(stdout);
  } catch {
    const firstBrace = stdout.indexOf('{');
    if (firstBrace === -1) throw new Error('pnpm audit produced no JSON output');
    auditJson = JSON.parse(stdout.slice(firstBrace));
  }
  const advisories = extractAdvisories(auditJson);
  const remaining = [];
  let allowlistedCount = 0;
  for (const adv of advisories) {
    if (isAllowlisted(adv.id, allowlist, now)) {
      allowlistedCount++;
    } else {
      remaining.push(adv);
    }
  }
  const failing = remaining.filter((a) => a.severity === 'high' || a.severity === 'critical');
  return { failing, allowlistedCount, remaining };
}

if (process.argv[1] && process.argv[1].endsWith('dependency-audit.mjs')) {
  runAudit()
    .then(({ failing, allowlistedCount }) => {
      if (failing.length > 0) {
        console.error(`Dependency audit failed with ${failing.length} advisory(ies):`);
        for (const adv of failing) {
          console.error(`  - [${adv.severity}] ${adv.id}: ${adv.title}`);
        }
        process.exitCode = 1;
      } else {
        console.log(`Dependency audit passed (${allowlistedCount} allowlisted)`);
      }
    })
    .catch((error) => {
      console.error(`Dependency audit error: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
}
