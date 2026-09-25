import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const SENSITIVE_GLOBS = [
  "src/lib/contracts/**",
  "src/lib/security/**",
  "src/lib/wallet-boundary/**",
  "src/hooks/*Transaction*.ts",
  "src/hooks/useWallet*.ts",
  "src/components/transactions/**",
  "src/components/protocol/**",
  "release/**",
];

const TEAM_SLUG = "truthbounty/v2-maintainers";
const TEAM_LOGIN = `@${TEAM_SLUG}`;

export function globToRegex(glob) {
  const parts = glob.split("/");
  const regexParts = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "**") {
      if (i === parts.length - 1) {
        regexParts.push(".*");
      } else {
        regexParts.push("(?:.+/)*?");
      }
    } else {
      const escaped = part
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*");
      regexParts.push(escaped);
    }
  }

  return new RegExp("^" + regexParts.join("/") + "$");
}

export function matchesAnySensitiveGlob(filePath) {
  for (const glob of SENSITIVE_GLOBS) {
    const re = globToRegex(glob);
    if (re.test(filePath)) {
      return true;
    }
  }
  return false;
}

export function getAllowlistedLogins() {
  const raw = process.env.MAINTAINER_ALLOWLIST_LOGINS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function checkMaintainerApproval({ changedFiles, reviews, reviewerTeam }) {
  const teamLabel = reviewerTeam || TEAM_SLUG;
  const teamLoginMatch = reviewerTeam ? `@${reviewerTeam}` : TEAM_LOGIN;

  const sensitiveFiles = changedFiles.filter((f) => matchesAnySensitiveGlob(f));

  if (sensitiveFiles.length === 0) {
    return { ok: true };
  }

  const approvers = reviews
    .filter((r) => r.state === "APPROVED")
    .map((r) => r.user?.login)
    .filter(Boolean);

  const allowlist = getAllowlistedLogins();

  const hasQualifiedApproval = approvers.some((login) => {
    if (login === teamLoginMatch) return true;
    if (login === TEAM_LOGIN) return true;
    if (allowlist.has(login)) return true;
    return false;
  });

  if (hasQualifiedApproval) {
    return { ok: true };
  }

  const fileList = sensitiveFiles.map((f) => `  - ${f}`).join("\n");
  const reason =
    `Sensitive paths require maintainer approval from @${teamLabel} (or MAINTAINER_ALLOWLIST_LOGINS).\n` +
    `No qualifying APPROVED review found for the following files:\n${fileList}`;

  return { ok: false, reason };
}

function parseArgsv() {
  try {
    const { values } = parseArgs({
      options: {
        files: { type: "string" },
        reviewsJson: { type: "string" },
        reviewerTeam: { type: "string" },
      },
      strict: false,
    });
    return values;
  } catch {
    return {};
  }
}

function loadFromGithubEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;

  try {
    const raw = readFileSync(eventPath, "utf-8");
    const event = JSON.parse(raw);
    const pr = event.pull_request;
    if (!pr) return null;

    const changedFiles = (pr.files || []).map((f) => f.filename).filter(Boolean);
    const reviews = (pr.reviews || []).map((r) => ({
      user: r.user ? { login: r.user.login } : undefined,
      state: r.state,
    }));

    return { changedFiles, reviews };
  } catch {
    return null;
  }
}

function main() {
  const args = parseArgsv();
  const fromEvent = loadFromGithubEvent();

  let changedFiles;
  let reviews;

  if (args.files) {
    changedFiles = args.files.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (fromEvent) {
    changedFiles = fromEvent.changedFiles;
  } else {
    changedFiles = [];
  }

  if (args.reviewsJson) {
    try {
      const raw = readFileSync(args.reviewsJson, "utf-8");
      reviews = JSON.parse(raw);
    } catch (e) {
      console.error(`Failed to read reviewsJson file: ${e.message}`);
      process.exit(1);
    }
  } else if (fromEvent) {
    reviews = fromEvent.reviews;
  } else {
    reviews = [];
  }

  const result = checkMaintainerApproval({
    changedFiles,
    reviews,
    reviewerTeam: args.reviewerTeam,
  });

  if (result.ok) {
    process.exit(0);
  } else {
    console.error(result.reason || "Maintainer approval required.");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  main();
}
