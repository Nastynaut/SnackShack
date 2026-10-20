// Fails when an app file changed but CACHE_VERSION did not go up.
// Install is the only writer of a release cache, so a new snapshot
// needs the next number: 1, then 2, then 3.
//
// Local use (from the repo root):
//   node .github/workflows/check-cache-version.mjs origin/main HEAD
//
// On GitHub, the workflow passes BASE_REF and BEFORE in the
// environment instead of putting them on the command line.
// A pull request sets BASE_REF. A push to main leaves BASE_REF
// empty and sets BEFORE to the previous commit.
// BEFORE is all zeros when the branch is new, and it can name a
// commit this checkout does not have. Both of those skip cleanly.

import { spawnSync } from "node:child_process";

const headRef = process.argv[3] || "HEAD";

function git(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

function refExists(ref) {
  const result = git(["rev-parse", "--verify", "--quiet", ref + "^{commit}"]);
  return result.status === 0 && result.stdout.trim() !== "";
}

// Pick the commit to compare against HEAD.
function resolveBase() {
  if (process.argv[2]) {
    return process.argv[2];
  }

  const baseRef = (process.env.BASE_REF || "").trim();
  if (baseRef) {
    return "origin/" + baseRef;
  }

  // Push to main: no base branch. BEFORE is the previous commit.
  if (process.env.GITHUB_ACTIONS === "true") {
    const before = (process.env.BEFORE || "").trim();
    // A brand-new branch is reported as all zeros. There is nothing older.
    if (!before || /^0+$/.test(before)) {
      console.log("Push has no previous commit (new branch). Skipping.");
      process.exit(0);
    }
    // The previous commit can be missing after a force-push.
    if (!refExists(before)) {
      console.log("Previous commit " + before + " is not in this checkout. Skipping.");
      process.exit(0);
    }
    return before;
  }

  return "origin/main";
}

function show(ref, path) {
  const result = git(["show", ref + ":" + path]);
  if (result.status !== 0) {
    return null;
  }
  return result.stdout;
}

// True when this commit contains the file. A rename or delete that
// leaves the old path in APP_FILES makes install fail for everyone.
function fileExists(ref, path) {
  const result = git(["cat-file", "-e", ref + ":" + path]);
  return result.status === 0;
}

function missingAppFiles(ref, files) {
  const missing = [];
  for (let i = 0; i < files.length; i++) {
    if (!fileExists(ref, files[i])) {
      missing.push(files[i]);
    }
  }
  return missing;
}

function parseSw(source, label) {
  // Anchored to the real line, so a commented-out
  //   // var CACHE_VERSION = "99";
  // cannot win over the declaration below it.
  const versionMatch = source.match(/^var CACHE_VERSION = "(\d+)";/m);
  if (!versionMatch) {
    console.error(label + " has no CACHE_VERSION number");
    process.exit(1);
  }
  const listMatch = source.match(/var APP_FILES = \[([\s\S]*?)\];/);
  if (!listMatch) {
    console.error(label + " has no APP_FILES list");
    process.exit(1);
  }
  const files = [];
  const names = listMatch[1].matchAll(/"([^"]+)"/g);
  for (const match of names) {
    // "./" is the home page, which git stores as index.html.
    files.push(match[1] === "./" ? "index.html" : match[1]);
  }
  return { version: Number(versionMatch[1]), files: files };
}

const baseRef = resolveBase();
if (!refExists(baseRef)) {
  console.error("Base " + baseRef + " is not in this checkout.");
  process.exit(1);
}

const baseSw = show(baseRef, "sw.js");
const headSwEarly = show(headRef, "sw.js");
if (baseSw === null) {
  if (headSwEarly !== null) {
    const listed = missingAppFiles(headRef, parseSw(headSwEarly, headRef).files);
    if (listed.length > 0) {
      console.error(
        "APP_FILES lists files that are missing at " + headRef + ": " + listed.join(", ")
      );
      process.exit(1);
    }
  }
  console.log("Base " + baseRef + " has no sw.js. Nothing to compare.");
  process.exit(0);
}

const headSw = headSwEarly;
if (headSw === null) {
  console.error("Head " + headRef + " has no sw.js, but the base does.");
  process.exit(1);
}

const baseInfo = parseSw(baseSw, baseRef);
const headInfo = parseSw(headSw, headRef);
const missing = missingAppFiles(headRef, headInfo.files);
if (missing.length > 0) {
  console.error(
    "APP_FILES lists files that are missing at " + headRef + ": " + missing.join(", ")
  );
  process.exit(1);
}

if (headInfo.version > baseInfo.version) {
  console.log(
    "CACHE_VERSION went from " + baseInfo.version + " to " + headInfo.version + "."
  );
  process.exit(0);
}

if (headInfo.version < baseInfo.version) {
  console.error(
    "CACHE_VERSION went down from " + baseInfo.version + " to " + headInfo.version + "."
  );
  process.exit(1);
}

// --no-renames so a renamed file shows up as the old path and the new
// path. Rename detection would hide the old path, and install would 404.
const diff = git(["diff", "--name-only", "--no-renames", baseRef, headRef]);
if (diff.status !== 0) {
  console.error(diff.stderr || "git diff failed");
  process.exit(1);
}

const changed = diff.stdout.split("\n").map(function (line) {
  return line.trim();
}).filter(Boolean);

const watched = { "sw.js": true };
const lists = baseInfo.files.concat(headInfo.files);
for (let i = 0; i < lists.length; i++) {
  watched[lists[i]] = true;
}

const hits = changed.filter(function (path) {
  return watched[path] === true;
});

if (hits.length === 0) {
  console.log("CACHE_VERSION stayed " + headInfo.version + ". No app file changed.");
  process.exit(0);
}

console.error(
  "CACHE_VERSION stayed " +
    headInfo.version +
    " but these files changed: " +
    hits.join(", ") +
    ". Count CACHE_VERSION up: 1, 2, 3."
);
process.exit(1);
