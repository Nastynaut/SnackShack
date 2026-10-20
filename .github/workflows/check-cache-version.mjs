// Fails a pull request when an app file changed but CACHE_VERSION
// did not go up. Install is the only writer of a release cache, so a
// new snapshot needs the next number: 1, then 2, then 3.
//
// Usage (from the repo root):
//   node .github/workflows/check-cache-version.mjs origin/main HEAD
//
// The first argument is the base ref. The second is the head ref.
// If the base has no sw.js, this passes. That is how the first
// pull request, which adds the worker, gets through.

import { spawnSync } from "node:child_process";

const baseRef = process.argv[2] || "origin/main";
const headRef = process.argv[3] || "HEAD";

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return result;
}

function show(ref, path) {
  const result = git(["show", ref + ":" + path]);
  if (result.status !== 0) {
    return null;
  }
  return result.stdout;
}

function parseSw(source, label) {
  const versionMatch = source.match(/var CACHE_VERSION = "(\d+)"/);
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

const baseSw = show(baseRef, "sw.js");
if (baseSw === null) {
  console.log("Base " + baseRef + " has no sw.js. Nothing to compare.");
  process.exit(0);
}

const headSw = show(headRef, "sw.js");
if (headSw === null) {
  console.error("Head " + headRef + " has no sw.js, but the base does.");
  process.exit(1);
}

const baseInfo = parseSw(baseSw, baseRef);
const headInfo = parseSw(headSw, headRef);

if (headInfo.version > baseInfo.version) {
  console.log(
    "CACHE_VERSION went from " + baseInfo.version + " to " + headInfo.version + "."
  );
  process.exit(0);
}

const diff = git(["diff", "--name-only", baseRef, headRef]);
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
