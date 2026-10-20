// Playwright checks for the Snack Shack home-screen / offline work.
// See tests/README.md for how to run this.
import { chromium, webkit } from "playwright";
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlink, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const mkdirAsync = promisify(mkdir);
const rmAsync = promisify(rm);
const symlinkAsync = promisify(symlink);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const HOST_DIR = "/tmp/snack-host";
// The server serves this copy. Tests never write the repo's own files.
let appDir = ROOT;

function chooseResultsDir() {
  const fallback = join(HERE, "results");
  const preferred = process.env.SNACK_RESULTS_DIR || fallback;
  try {
    mkdirSync(preferred, { recursive: true });
    return preferred;
  } catch (err) {
    mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

const ARTIFACTS = chooseResultsDir();

function appFile(name) {
  return join(appDir, name);
}
const PORT = 8765;
const SUB_PORT = 8766;
const BASE = `http://127.0.0.1:${PORT}/`;
const SUB_BASE = `http://127.0.0.1:${SUB_PORT}/SnackShack/`;

const swSource = readFileSync(join(ROOT, "sw.js"), "utf8");
const appFiles = [...swSource.match(/var APP_FILES = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(
  (match) => match[1]
);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(relative(ROOT, full));
    }
  }
  return out;
}

const assetFiles = walk(join(ROOT, "assets"));

const results = [];
const foreign = [];
let rootServer;
let subServer;

function resultsText() {
  const passed = results.filter((item) => item.pass).length;
  const failed = results.filter((item) => !item.pass).length;
  return [
    `Snack Shack issue #5 Playwright results`,
    `Passed: ${passed}`,
    `Failed: ${failed}`,
    `Browsers: Chromium and WebKit`,
    `Viewports: 1024x768, 1180x820, 768x1024, 844x390`,
    `Also: subfolder /SnackShack/, offline reload, network-first snapshot, 3s hang, hung page load, captive portal, partial install, per-release update, no-bump snapshot, late page, real 404, page marker, host headers, query offline, manifest, icons, B3, B4`,
    ``,
    ...results.map((item) => `${item.pass ? "PASS" : "FAIL"}  ${item.name}${item.detail ? " — " + item.detail : ""}`)
  ].join("\n") + "\n";
}

function writeResults() {
  try {
    mkdirSync(ARTIFACTS, { recursive: true });
    writeFileSync(join(ARTIFACTS, "playwright_results.txt"), resultsText());
  } catch (err) {
    console.error("Could not write results: " + err);
  }
}

function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || "" });
  const line = `${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`;
  console.log(line);
  writeResults();
  return !!pass;
}

const FILE_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/octet-stream",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".mp3": "audio/mp3",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const waits = new Set();

function pause(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waits.delete(timer);
      resolve();
    }, ms);
    waits.add(timer);
  });
}

function cancelWaits() {
  for (const timer of waits) {
    clearTimeout(timer);
  }
  waits.clear();
}

function isDocumentPath(pathname) {
  if (pathname === "/wifi-login" || pathname.endsWith("/wifi-login")) {
    return false;
  }
  return pathname.endsWith("/") || pathname.endsWith("/index.html");
}

function sendText(res, status, type, body, extra) {
  const headers = Object.assign(
    {
      "Content-Type": type,
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store"
    },
    extra || {}
  );
  res.writeHead(status, headers);
  res.end(body);
}

// A tiny static server. delay() holds one path so the service worker's
// own fetch can be slow on every browser, including WebKit, which does
// not show that fetch to Playwright's route. portal() imitates a
// Wi-Fi login page for the same reason.
function startServer(dir, port) {
  const state = { delayMs: 0, delayPath: "", delayAllMs: 0, portal: "", portalHits: 0, fileCache: "no-store" };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(url.pathname);
      const wait = state.delayAllMs || (state.delayMs && pathname.endsWith(state.delayPath) ? state.delayMs : 0);
      if (wait) {
        await pause(wait);
      }
      // sw.js must stay a real script so an update can start. The
      // install that follows is what we want the portal to spoil.
      const isWorkerScript = pathname.endsWith("/sw.js");
      if (!isWorkerScript && state.portal) {
        state.portalHits += 1;
      }
      if (!isWorkerScript && (pathname === "/wifi-login" || pathname.endsWith("/wifi-login"))) {
        sendText(
          res,
          200,
          "text/html; charset=utf-8",
          "<!DOCTYPE html><title>Wi-Fi login</title><p>Wi-Fi login</p>"
        );
        return;
      }
      const loginAt = pathname.startsWith("/SnackShack/") ? "/SnackShack/wifi-login" : "/wifi-login";
      if (!isWorkerScript && state.portal === "redirect" && isDocumentPath(pathname)) {
        res.writeHead(302, { Location: loginAt, "Cache-Control": "no-store" });
        res.end();
        return;
      }
      if (!isWorkerScript && state.portal === "wrong-type" && (pathname.endsWith("/styles.css") || pathname.endsWith("/menu.js"))) {
        sendText(res, 200, "text/html; charset=utf-8", "Wi-Fi login");
        return;
      }
      if (!isWorkerScript && state.portal === "login-200" && isDocumentPath(pathname)) {
        sendText(
          res,
          200,
          "text/html; charset=utf-8",
          "<!DOCTYPE html><title>Wi-Fi login</title><p>Wi-Fi login</p>"
        );
        return;
      }
      if (!isWorkerScript && state.portal === "partial" && /\.(png|svg|woff2|mp3)$/.test(pathname)) {
        sendText(
          res,
          200,
          "text/html; charset=utf-8",
          "<!DOCTYPE html><title>Wi-Fi login</title><p>Wi-Fi login</p>"
        );
        return;
      }
      if (!isWorkerScript && state.portal === "install-bad") {
        if (isDocumentPath(pathname)) {
          res.writeHead(302, { Location: loginAt, "Cache-Control": "no-store" });
          res.end();
          return;
        }
        sendText(res, 200, "text/html; charset=utf-8", "Wi-Fi login");
        return;
      }
      const rel = pathname.replace(/^\/+/, "");
      let filePath = join(dir, rel);
      let info = await stat(filePath).catch(() => null);
      if (info && info.isDirectory()) {
        filePath = join(filePath, "index.html");
        info = await stat(filePath).catch(() => null);
      }
      if (!info || !info.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      const type = FILE_TYPES[extname(filePath)] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": info.size,
        "Cache-Control": state.fileCache
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(filePath).pipe(res);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end(String(err));
    }
  });
  server.listen(port, "127.0.0.1");
  return {
    kill() {
      server.close();
    },
    delay(pathSuffix, ms) {
      state.delayPath = pathSuffix;
      state.delayMs = ms;
    },
    delayAll(ms) {
      state.delayAllMs = ms;
    },
    clearDelay() {
      state.delayMs = 0;
      state.delayPath = "";
      state.delayAllMs = 0;
      cancelWaits();
    },
    portal(mode) {
      state.portal = mode;
      state.portalHits = 0;
    },
    portalHits() {
      return state.portalHits;
    },
    clearPortal() {
      state.portal = "";
    },
    setFileCache(value) {
      state.fileCache = value || "no-store";
    }
  };
}

async function waitForHttp(url) {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) {
        return;
      }
    } catch (err) {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Server did not start: " + url);
}

function track(page, origin) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("request", (req) => {
    const raw = req.url();
    if (raw.startsWith("data:") || raw.startsWith("blob:")) {
      return;
    }
    let url;
    try {
      url = new URL(raw);
    } catch (err) {
      foreign.push(raw);
      return;
    }
    if (url.origin !== origin && url.protocol !== "file:") {
      foreign.push(raw);
    }
  });
  return errors;
}

async function waitForCache(page, cacheName) {
  const name = cacheName || "snack-shack-1";
  const start = Date.now();
  while (Date.now() - start < 20000) {
    const ready = await page.evaluate(async ({ expected, name }) => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg || !reg.active || !navigator.serviceWorker.controller) {
        return false;
      }
      const names = await caches.keys();
      if (names.indexOf(name) === -1) {
        return false;
      }
      const cache = await caches.open(name);
      const keys = await cache.keys();
      return keys.length >= expected;
    }, { expected: appFiles.length, name });
    if (ready) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the service worker cache");
}

async function cachedPaths(page) {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const name of names) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      for (const key of keys) {
        urls.push(key.url);
      }
    }
    return { names, urls };
  });
}

function hasCached(urls, file, basePath) {
  return urls.some((raw) => {
    const url = new URL(raw);
    if (file === "./") {
      return url.pathname === basePath || url.pathname === basePath + "/";
    }
    return url.pathname === basePath + "/" + file || url.pathname.endsWith("/" + file);
  });
}

async function readManifest(page) {
  return page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const href = link ? link.getAttribute("href") : "";
    const res = await fetch(href);
    const json = await res.json();
    const meta = {};
    document.querySelectorAll("meta").forEach((tag) => {
      const key = tag.getAttribute("name");
      if (key) {
        meta[key] = tag.getAttribute("content");
      }
    });
    const icon = document.querySelector('link[rel="apple-touch-icon"]');
    const favicon = document.querySelector('link[rel="icon"]');
    const css = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const grid = getComputedStyle(document.querySelector(".menu-grid"));
    const ticket = getComputedStyle(document.querySelector("#ticket-lines"));
    let gesturePrevented = false;
    const gesture = new Event("gesturestart", { cancelable: true });
    document.dispatchEvent(gesture);
    gesturePrevented = gesture.defaultPrevented;
    return {
      href,
      json,
      meta,
      iconHref: icon ? icon.getAttribute("href") : "",
      faviconHref: favicon ? favicon.getAttribute("href") : "",
      overscroll: css.overscrollBehavior,
      bodyOverscroll: body.overscrollBehavior,
      touchAction: css.touchAction,
      bodyTouch: body.touchAction,
      userSelect: body.userSelect,
      webkitUserSelect: body.webkitUserSelect,
      tap: body.webkitTapHighlightColor,
      callout: body.webkitTouchCallout,
      gridOverflow: grid.overflowY,
      gridOverscroll: grid.overscrollBehavior,
      ticketOverflow: ticket.overflowY,
      ticketOverscroll: ticket.overscrollBehavior,
      safeTop: body.paddingTop,
      gesturePrevented
    };
  });
}

async function orderFlow(page, label) {
  const errorsBefore = page.__errors.length;
  await page.locator('.menu-item[data-id="burger"]').click();
  await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$3");
  await page.locator('[data-action="plus"][data-id="burger"]').click();
  await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$6");
  await page.locator('[data-action="minus"][data-id="burger"]').click();
  await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$3");
  await page.locator('.tab[data-category="drinks"]').click();
  await page.locator('.menu-item[data-id="soda"]').click();
  await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$4");
  await page.locator("#done-button").click();
  await page.waitForFunction(() => {
    const summary = document.querySelector("#summary-screen");
    const total = document.querySelector("#summary-total");
    return summary && !summary.hidden && total && total.textContent === "$4";
  });
  const summaryText = await page.locator("#summary-lines").innerText();
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  check(label + " summary lists Burger and Soda", /Burger/.test(summaryText) && /Soda/.test(summaryText));
  check(label + " focus moves to the summary heading", focused === "summary-heading");
  await page.locator("#edit-order").click();
  await page.waitForFunction(() => {
    const menu = document.querySelector("#menu-screen");
    return menu && !menu.hidden && document.querySelector("#ticket-total").textContent === "$4";
  });
  const keptTotal = await page.locator("#ticket-total").textContent();
  const menuShown = await page.locator("#menu-screen").isVisible();
  check(label + " Edit Order keeps the ticket", menuShown && keptTotal === "$4", keptTotal);
  await page.locator("#done-button").click();
  await page.waitForFunction(() => {
    const summary = document.querySelector("#summary-screen");
    return summary && !summary.hidden;
  });
  await page.locator("#new-order").click();
  await page.waitForFunction(() => {
    const menu = document.querySelector("#menu-screen");
    const done = document.querySelector("#done-button");
    return menu && !menu.hidden && document.querySelector("#ticket-total").textContent === "$0" && done.disabled;
  });
  const clearedTotal = await page.locator("#ticket-total").textContent();
  const doneDisabled = await page.locator("#done-button").isDisabled();
  check(label + " New Order clears the ticket", clearedTotal === "$0" && doneDisabled, clearedTotal);
  check(label + " no page errors during the order", page.__errors.length === errorsBefore, page.__errors.slice(errorsBefore).join(" | "));
}

async function runSize(browser, browserName, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    serviceWorkers: "allow"
  });
  const page = await context.newPage();
  page.__errors = track(page, new URL(BASE).origin);
  const label = `${browserName} ${width}x${height}`;
  await page.goto(BASE, { waitUntil: "load" });
  await waitForCache(page);
  const cache = await cachedPaths(page);
  const basePath = "";
  let missing = [];
  for (const file of appFiles) {
    if (!hasCached(cache.urls, file, basePath)) {
      missing.push(file);
    }
  }
  check(label + " service worker cache holds every app file", missing.length === 0, missing.join(", "));
  check(label + " cache version is the current one", cache.names.indexOf("snack-shack-1") !== -1, cache.names.join(", "));
  const iconPaths = [
    "assets/icons/apple-touch-icon-180.png",
    "assets/icons/icon-192.png",
    "assets/icons/icon-512.png",
    "assets/icons/app-icon.svg"
  ];
  const iconsMissing = iconPaths.filter((file) => !hasCached(cache.urls, file, basePath));
  const iconStatus = await page.evaluate(async () => {
    const paths = [
      "assets/icons/apple-touch-icon-180.png",
      "assets/icons/icon-192.png",
      "assets/icons/icon-512.png"
    ];
    const statuses = [];
    for (let i = 0; i < paths.length; i++) {
      const res = await fetch(paths[i]);
      statuses.push(res.status);
    }
    const reg = await navigator.serviceWorker.getRegistration();
    return { statuses: statuses, active: reg && reg.active ? reg.active.state : "" };
  });
  check(
    label + " home-screen icons are cached and load",
    iconsMissing.length === 0 && iconStatus.statuses.every((status) => status === 200) && iconStatus.active === "activated",
    iconsMissing.join(", ") + " " + JSON.stringify(iconStatus)
  );

  const info = await readManifest(page);
  check(label + " manifest link is relative", info.href === "manifest.webmanifest");
  check(label + " manifest name", info.json.name === "Snack Shack" && info.json.short_name === "Snack Shack");
  check(label + " manifest display and orientation", info.json.display === "standalone" && info.json.orientation === "any");
  check(label + " manifest colors", info.json.theme_color === "#FF7A45" && info.json.background_color === "#FFF8EC");
  check(label + " manifest start and scope", info.json.start_url === "./" && info.json.scope === "./");
  const iconSrcs = (info.json.icons || []).map((icon) => icon.src).sort();
  check(
    label + " manifest icon paths",
    iconSrcs.join(",") === "assets/icons/icon-192.png,assets/icons/icon-512.png"
  );
  check(label + " apple touch icon path is relative", info.iconHref === "assets/icons/apple-touch-icon-180.png");
  check(label + " icon link points at a real icon", info.faviconHref === "assets/icons/icon-192.png");
  const missingFile = await page.evaluate(async () => {
    const res = await fetch("no-such-file.txt");
    const text = await res.text();
    return { status: res.status, text: text };
  });
  check(
    label + " a missing file stays a 404",
    missingFile.status === 404 && missingFile.text.indexOf("504") === -1,
    JSON.stringify(missingFile)
  );
  check(
    label + " viewport does not lock maximum-scale",
    info.meta.viewport === "width=device-width, initial-scale=1, viewport-fit=cover" &&
      info.meta.viewport.indexOf("maximum-scale") === -1 &&
      info.meta.viewport.indexOf("user-scalable") === -1
  );
  check(label + " apple web app capable", info.meta["apple-mobile-web-app-capable"] === "yes" && info.meta["mobile-web-app-capable"] === "yes");
  check(label + " status bar and title", info.meta["apple-mobile-web-app-status-bar-style"] === "default" && info.meta["apple-mobile-web-app-title"] === "Snack Shack");
  check(label + " page does not bounce", info.overscroll === "none" && info.bodyOverscroll === "none" && info.touchAction === "manipulation" && info.bodyTouch === "manipulation");
  check(label + " text is not selectable", info.userSelect === "none" || info.webkitUserSelect === "none");
  check(label + " tap highlight is transparent", /transparent|rgba\(0,\s*0,\s*0,\s*0\)/.test(info.tap || ""));
  check(label + " gesturestart blocks pinch zoom on iOS on purpose", info.gesturePrevented === true);
  check(label + " menu and ticket still scroll inside", info.gridOverflow === "auto" && info.gridOverscroll === "contain" && info.ticketOverflow === "auto" && info.ticketOverscroll === "contain");

  if (width === 1180 && height === 820 && browserName === "chromium") {
    await context.setOffline(true);
    await page.reload({ waitUntil: "load" });
    await page.locator('.menu-item[data-id="burger"]').click();
    await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$3");
    await page.screenshot({ path: join(ARTIFACTS, "offline_menu_1180x820.png") });
    await context.setOffline(false);
    await page.reload({ waitUntil: "load" });
    await waitForCache(page);
  }

  await context.setOffline(true);
  const offlineResponse = await page.reload({ waitUntil: "load" }).catch((err) => err);
  check(label + " reload works offline", !(offlineResponse instanceof Error), offlineResponse instanceof Error ? String(offlineResponse) : "");
  if (!(offlineResponse instanceof Error)) {
    await orderFlow(page, label + " offline");
  }
  await context.close();
}

async function runPictureNote(browser, browserName) {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    serviceWorkers: "allow"
  });
  const page = await context.newPage();
  page.__errors = track(page, new URL(BASE).origin);
  await page.route("**/menu.js", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace(
      'id: "burger",\n          name: "Burger",\n          price: 3,\n          emoji: "🍔",\n          image: "assets/food/burger.svg"',
      'id: "burger",\n          name: "Burger",\n          price: 3,\n          emoji: "",\n          image: "assets/food/no-such-picture.svg"'
    );
    body = body.replace(
      'image: "assets/food/hot-dog.svg"',
      'image: "assets/food/missing-hot-dog.svg"'
    );
    await route.fulfill({ status: 200, contentType: "text/javascript", body });
  });
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const note = document.querySelector("#menu-note");
    return note && !note.hidden && /picture didn't load/.test(note.textContent);
  });
  const note = await page.locator("#menu-note").textContent();
  check(browserName + " B3 note names the snack with no emoji", note.includes("Burger's picture didn't load."));
  check(browserName + " B3 keeps the existing note control", note.includes("Show what's wrong"));
  check(browserName + " B3 does not note a snack that still has an emoji", !note.includes("Hot Dog"));
  const noteBox = await page.locator("#menu-note").boundingBox();
  check(browserName + " B4 note is on the menu before summary", !!noteBox && noteBox.height > 0);

  await page.locator('.menu-item[data-id="fries"]').click();
  await page.locator("#done-button").click();
  await page.waitForFunction(() => {
    const summary = document.querySelector("#summary-screen");
    return summary && !summary.hidden;
  });
  const hiddenNote = await page.locator("#menu-note").boundingBox();
  check(browserName + " B4 note is not taking space on the summary", hiddenNote === null);
  const viewport = page.viewportSize();
  for (const id of ["#edit-order", "#new-order"]) {
    const box = await page.locator(id).boundingBox();
    const inside = box && box.x >= -0.5 && box.y >= -0.5 && box.x + box.width <= viewport.width + 0.5 && box.y + box.height <= viewport.height + 0.5;
    check(
      browserName + " B4 " + id + " is fully inside 844x390",
      !!inside,
      box ? `x=${box.x.toFixed(1)} y=${box.y.toFixed(1)} w=${box.width.toFixed(1)} h=${box.height.toFixed(1)}` : "no box"
    );
  }
  if (browserName === "chromium") {
    await page.screenshot({ path: join(ARTIFACTS, "summary_844x390.png") });
  }
  check(browserName + " B3/B4 no page errors", page.__errors.length === 0, page.__errors.join(" | "));
  await context.close();
}

async function runSubfolder(browser, browserName) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    serviceWorkers: "allow"
  });
  const page = await context.newPage();
  page.__errors = track(page, new URL(SUB_BASE).origin);
  const label = browserName + " subfolder";
  await page.goto(SUB_BASE, { waitUntil: "load" });
  await waitForCache(page);
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.scope : "";
  });
  check(label + " service worker scope stays in the folder", scope === SUB_BASE, scope);
  const cache = await cachedPaths(page);
  const missing = appFiles.filter((file) => !hasCached(cache.urls, file, "/SnackShack"));
  check(label + " cache holds the app files", missing.length === 0, missing.join(", "));
  const info = await readManifest(page);
  check(label + " manifest still uses relative start and scope", info.json.start_url === "./" && info.json.scope === "./");
  await runHostChecks(page, context, subServer, SUB_BASE, label);
  await context.setOffline(true);
  const reloadError = await page.reload({ waitUntil: "load" }).catch((err) => err);
  check(label + " reload works offline", !(reloadError instanceof Error), reloadError instanceof Error ? String(reloadError) : "");
  if (!(reloadError instanceof Error)) {
  await page.locator('.tab[data-category="treats"]').click();
  await page.locator('.menu-item[data-id="cookie"]').click();
    await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$1");
    await page.locator("#done-button").click();
    await page.waitForFunction(() => document.querySelector("#summary-total").textContent === "$1");
    await page.locator("#edit-order").click();
    await page.waitForFunction(() => !document.querySelector("#menu-screen").hidden && document.querySelector("#ticket-total").textContent === "$1");
    await page.locator("#done-button").click();
    await page.locator("#new-order").click();
    await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$0");
    const offlineTotal = await page.locator("#ticket-total").textContent();
    check(label + " offline order flow", offlineTotal === "$0", offlineTotal);
  }
  check(label + " no page errors", page.__errors.length === 0, page.__errors.join(" | "));
  await context.close();
}

async function runLogic(browser, browserName) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    serviceWorkers: "allow"
  });
  const page = await context.newPage();
  page.__errors = track(page, new URL(BASE).origin);
  await page.addInitScript(() => {
    const original = HTMLAudioElement.prototype.play;
    window.__playCalls = 0;
    HTMLAudioElement.prototype.play = function () {
      window.__playCalls += 1;
      try {
        const pending = original.apply(this, arguments);
        if (pending && pending.catch) {
          pending.catch(function () {});
        }
        return pending;
      } catch (err) {
        return Promise.reject(err);
      }
    };
  });
  await page.goto(BASE, { waitUntil: "load" });
  const categories = ["food", "drinks", "treats"];
  for (const id of categories) {
    await page.locator(`.tab[data-category="${id}"]`).click();
    const buttons = page.locator("#menu-grid .menu-item");
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      await buttons.nth(i).click();
    }
  }
  await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$26");
  const eachTotal = await page.locator("#ticket-total").textContent();
  check(browserName + " one of each snack totals $26", eachTotal === "$26", eachTotal);

  await page.locator('.tab[data-category="food"]').click();
  for (let i = 0; i < 98; i++) {
    await page.locator('[data-action="plus"][data-id="burger"]').click();
  }
  await page.waitForFunction(() => {
    const row = document.querySelector('.ticket-row[data-id="burger"] .qty-number');
    const plus = document.querySelector('[data-action="plus"][data-id="burger"]');
    return row && row.textContent === "99" && plus && plus.disabled;
  });
  // 99 burgers ($297) plus the other eleven snacks ($23) = $320.
  // Burger was already counted once in the $26, so 98 more is +$294, total $320.
  await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$320");
  const cappedQty = await page.locator('.ticket-row[data-id="burger"] .qty-number').textContent();
  const plusDisabled = await page.locator('[data-action="plus"][data-id="burger"]').isDisabled();
  const cappedTotal = await page.locator("#ticket-total").textContent();
  check(
    browserName + " plus stops at 99",
    cappedQty === "99" && plusDisabled && cappedTotal === "$320",
    cappedQty + " " + cappedTotal
  );

  await page.locator('[data-action="minus"][data-id="burger"]').click();
  await page.locator("#done-button").click();
  await page.locator("#new-order").click();
  await page.locator('.menu-item[data-id="burger"]').click();
  await page.locator('[data-action="minus"][data-id="burger"]').click();
  await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$0");
  const focusedTab = await page.evaluate(() => {
    const el = document.activeElement;
    return el && el.classList.contains("tab");
  });
  check(browserName + " removing the last line focuses a tab", focusedTab === true);

  const plays = await page.evaluate(() => window.__playCalls || 0);
  check(browserName + " sounds still play from the tap", plays >= 1, "play calls " + plays);
  // The ticket is already empty, and New Order lives on the summary screen.
  await page.evaluate(() => {
    HTMLAudioElement.prototype.play = function () {
      throw new Error("play boom");
    };
  });
  await page.locator('.menu-item[data-id="burger"]').click();
  await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$3");
  const thrownTotal = await page.locator("#ticket-total").textContent();
  check(browserName + " a throwing play() still adds the snack", thrownTotal === "$3", thrownTotal);
  check(browserName + " logic checks no page errors", page.__errors.length === 0, page.__errors.join(" | "));
  await context.close();
}

async function runFilePage(browser, browserName) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  page.__errors = track(page, "file://");
  const opened = await page.goto("file://" + ROOT + "/index.html", { waitUntil: "load" }).catch((err) => err);
  if (opened instanceof Error) {
    check(browserName + " file:// page opens", false, String(opened));
    await context.close();
    return;
  }
  const ready = await page.locator('.menu-item[data-id="burger"]').count().catch(() => 0);
  if (!ready) {
    check(browserName + " file:// still runs the register", false, "menu did not render");
    await context.close();
    return;
  }
  await page.locator('.menu-item[data-id="burger"]').click();
  await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$3");
  const regs = await page.evaluate(async () => {
    try {
      if (!navigator.serviceWorker || !navigator.serviceWorker.getRegistrations) {
        return 0;
      }
      const all = await navigator.serviceWorker.getRegistrations();
      return all.length;
    } catch (err) {
      // file:// cannot use service workers at all. That is the point.
      return 0;
    }
  });
  const fileTotal = await page.locator("#ticket-total").textContent();
  check(browserName + " file:// order still works", fileTotal === "$3", fileTotal);
  check(browserName + " file:// does not register a service worker", regs === 0, "registrations " + regs);
  await context.close();
}

async function runReviewChecks(browser, browserName) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    serviceWorkers: "allow"
  });
  let page = await context.newPage();
  page.__errors = track(page, new URL(BASE).origin);
  const label = browserName + " review";
  await page.goto(BASE, { waitUntil: "load" });
  await waitForCache(page);

  const cache = await cachedPaths(page);
  const docsCached = ["STYLE.md", "LICENSES.md", "OFL.txt", "OFL-Fredoka.txt", "OFL-Nunito.txt"].filter((name) =>
    cache.urls.some((url) => url.indexOf(name) !== -1)
  );
  check(label + " precached files exclude the docs", docsCached.length === 0, docsCached.join(", "));

  const cssPath = appFile("styles.css");
  const originalCss = readFileSync(cssPath, "utf8");
  writeFileSync(cssPath, originalCss + "\n/* updated-marker */\n");
  let fresh;
  try {
    fresh = await page.evaluate(async () => {
      const res = await fetch("styles.css");
      const text = await res.text();
      const opened = await caches.open("snack-shack-1");
      const saved = await opened.match("styles.css");
      const savedText = saved ? await saved.text() : "";
      return { text: text, savedText: savedText };
    });
  } finally {
    writeFileSync(cssPath, originalCss);
  }
  check(
    label + " network-first shows a newer file and leaves the snapshot",
    fresh.text.indexOf("updated-marker") !== -1 && fresh.savedText.indexOf("updated-marker") === -1,
    fresh.text.slice(0, 80)
  );

  rootServer.delay("/menu.js", 6000);
  let hung;
  try {
    hung = await page.evaluate(async () => {
      const started = Date.now();
      const res = await fetch("menu.js");
      const text = await res.text();
      return {
        ms: Date.now() - started,
        hasMenu: text.indexOf("var MENU") !== -1,
        tooLate: text.indexOf("too-late") !== -1
      };
    });
  } finally {
    rootServer.clearDelay();
  }
  check(
    label + " a 3s hang falls back to the cache",
    hung.ms >= 2500 && hung.ms < 4500 && hung.hasMenu && !hung.tooLate,
    JSON.stringify(hung)
  );

  await context.setOffline(true);
  const offlineFile = await page.evaluate(async () => {
    const res = await fetch("app.js");
    const text = await res.text();
    return { status: res.status, ok: text.indexOf("SNACK SHACK") !== -1 };
  });
  check(label + " offline fetch uses the cache", offlineFile.status === 200 && offlineFile.ok, JSON.stringify(offlineFile));

  const queryNav = await page.goto(BASE + "?party=1", { waitUntil: "load" }).catch((err) => err);
  const queryReady = !(queryNav instanceof Error) && (await page.locator('.menu-item[data-id="burger"]').count()) > 0;
  check(
    label + " a ?query navigation works offline",
    queryReady,
    queryNav instanceof Error ? String(queryNav) : page.url()
  );
  await context.setOffline(false);

  await runLateNavigation(page, label);
  await runPortalAndHang(page, context, label);
  check(label + " no page errors", page.__errors.length === 0, page.__errors.join(" | "));
  await context.close();
}

async function cacheStory(page) {
  return page.evaluate(async () => {
    const cache = await caches.open("snack-shack-1");
    const keys = await cache.keys();
    let portal = false;
    let html = false;
    let css = false;
    let menu = false;
    for (const key of keys) {
      const url = key.url;
      const textLike = url.endsWith("/") || /\.(html|css|js|webmanifest)$/.test(url);
      if (!textLike) {
        continue;
      }
      const text = await (await cache.match(key)).text();
      if (text.indexOf("<title>Wi-Fi login</title>") !== -1 || text.indexOf(">Wi-Fi login<") !== -1) {
        portal = true;
      }
      if ((url.endsWith("/") || url.endsWith("/index.html")) && text.indexOf("Snack Shack") !== -1) {
        html = true;
      }
      if (url.endsWith("/styles.css") && text.indexOf("SNACK SHACK") !== -1) {
        css = true;
      }
      if (url.endsWith("/menu.js") && text.indexOf("var MENU") !== -1) {
        menu = true;
      }
    }
    return { portal: portal, html: html, css: css, menu: menu, count: keys.length };
  });
}

async function runHostChecks(page, context, server, base, label) {
  const types = await page.evaluate(async () => {
    const cache = await caches.open("snack-shack-1");
    const mp3 = await cache.match("assets/sounds/add.mp3");
    const manifest = await cache.match("manifest.webmanifest");
    const keys = await cache.keys();
    return {
      mp3: mp3 ? mp3.headers.get("content-type") || "" : "",
      manifest: manifest ? manifest.headers.get("content-type") || "" : "",
      count: keys.length
    };
  });
  check(
    label + " host headers still install (audio/mp3, octet-stream manifest)",
    types.count >= appFiles.length &&
      types.mp3.indexOf("audio/mp3") !== -1 &&
      types.manifest.indexOf("application/octet-stream") !== -1,
    JSON.stringify(types)
  );

  server.clearPortal();
  await page.goto(base, { waitUntil: "load" });

  const htmlPath = appFile("index.html");
  const originalHtml = readFileSync(htmlPath, "utf8");
  writeFileSync(htmlPath, originalHtml + "\n<!-- fresh-page-marker -->\n");
  let fresh;
  try {
    fresh = await page.evaluate(async () => {
      const home = await (await fetch("./")).text();
      const file = await (await fetch("index.html")).text();
      const cache = await caches.open("snack-shack-1");
      const savedHome = await (await cache.match("./")).text();
      const savedFile = await (await cache.match("index.html")).text();
      const shown = (text) =>
        text.indexOf("fresh-page-marker") !== -1 && text.indexOf('name="snack-shack-page"') !== -1;
      const saved = (text) =>
        text.indexOf("fresh-page-marker") === -1 && text.indexOf('name="snack-shack-page"') !== -1;
      return {
        home: shown(home),
        file: shown(file),
        savedHome: saved(savedHome),
        savedFile: saved(savedFile)
      };
    });
  } finally {
    writeFileSync(htmlPath, originalHtml);
  }
  check(
    label + " a real page is shown and the snapshot stays unchanged",
    fresh.home && fresh.file && fresh.savedHome && fresh.savedFile,
    JSON.stringify(fresh)
  );

  server.portal("login-200");
  let login;
  try {
    await page.goto(base, { waitUntil: "load" });
    login = await page.evaluate(async () => {
      const cache = await caches.open("snack-shack-1");
      const savedHome = await (await cache.match("./")).text();
      const savedFile = await (await cache.match("index.html")).text();
      const safe = (text) =>
        text.indexOf("<title>Wi-Fi login</title>") === -1 &&
        text.indexOf('name="snack-shack-page"') !== -1;
      return {
        burgers: document.querySelectorAll('.menu-item[data-id="burger"]').length,
        title: document.title,
        savedHome: safe(savedHome),
        savedFile: safe(savedFile)
      };
    });
  } finally {
    server.clearPortal();
  }
  check(
    label + " a plain 200 login page does not replace the cached page",
    login.burgers > 0 && login.title === "Snack Shack" && login.savedHome && login.savedFile,
    JSON.stringify(login)
  );

  await context.setOffline(true);
  let offlineBurger = 0;
  try {
    await page.goto(base, { waitUntil: "load" });
    offlineBurger = await page.locator('.menu-item[data-id="burger"]').count();
  } finally {
    await context.setOffline(false);
  }
  check(
    label + " the app still renders offline after a plain login page",
    offlineBurger > 0,
    "burgers " + offlineBurger
  );
  await page.goto(base, { waitUntil: "load" });
}

async function runPortalAndHang(page, context, label) {
  await runHostChecks(page, context, rootServer, BASE, label);
  rootServer.clearDelay();
  rootServer.portal("redirect");
  let redirected;
  try {
    await page.goto(BASE, { waitUntil: "load" });
    redirected = {
      burgers: await page.locator('.menu-item[data-id="burger"]').count(),
      title: await page.title(),
      cache: await cacheStory(page)
    };
  } finally {
    rootServer.clearPortal();
  }
  check(
    label + " a Wi-Fi login redirect is not cached over the app",
    redirected.burgers > 0 &&
      redirected.title === "Snack Shack" &&
      redirected.cache.html &&
      redirected.cache.css &&
      redirected.cache.menu &&
      !redirected.cache.portal,
    JSON.stringify(redirected)
  );

  // A real page load clears the short "use the saved copy" window
  // so the next check actually hits the bad file.
  await page.goto(BASE, { waitUntil: "load" });

  rootServer.portal("wrong-type");
  let wrong;
  try {
    wrong = await page.evaluate(async () => {
      const css = await (await fetch("styles.css")).text();
      const js = await (await fetch("menu.js")).text();
      const cache = await caches.open("snack-shack-1");
      const savedCss = await (await cache.match("styles.css")).text();
      const savedJs = await (await cache.match("menu.js")).text();
      return {
        css: css.indexOf("SNACK SHACK") !== -1 && css.indexOf("Wi-Fi login") === -1,
        js: js.indexOf("var MENU") !== -1 && js.indexOf("Wi-Fi login") === -1,
        savedCss: savedCss.indexOf("SNACK SHACK") !== -1 && savedCss.indexOf("Wi-Fi login") === -1,
        savedJs: savedJs.indexOf("var MENU") !== -1 && savedJs.indexOf("Wi-Fi login") === -1
      };
    });
  } finally {
    rootServer.clearPortal();
  }
  check(
    label + " a wrong content-type is not cached over js or css",
    wrong.css && wrong.js && wrong.savedCss && wrong.savedJs,
    JSON.stringify(wrong)
  );

  await context.setOffline(true);
  let offlineBurger = 0;
  try {
    await page.goto(BASE, { waitUntil: "load" });
    offlineBurger = await page.locator('.menu-item[data-id="burger"]').count();
  } finally {
    await context.setOffline(false);
  }
  check(label + " the app still renders offline after a captive portal", offlineBurger > 0, "burgers " + offlineBurger);

  const swPath = appFile("sw.js");
  const originalSw = readFileSync(swPath, "utf8");
  writeFileSync(swPath, originalSw + "\n// install-bad-test\n");
  rootServer.portal("install-bad");
  let installResult;
  try {
    installResult = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      let error = "";
      try {
        await reg.update();
      } catch (err) {
        error = String(err);
      }
      const start = Date.now();
      while (reg.installing && Date.now() - start < 4000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const cache = await caches.open("snack-shack-1");
      const keys = await cache.keys();
      let portal = false;
      let html = false;
      for (const key of keys) {
        const url = key.url;
        if (!(url.endsWith("/") || url.endsWith(".html") || url.endsWith(".js") || url.endsWith(".css"))) {
          continue;
        }
        const text = await (await cache.match(key)).text();
        if (text.indexOf("<title>Wi-Fi login</title>") !== -1 || text.indexOf(">Wi-Fi login<") !== -1) {
          portal = true;
        }
        if (text.indexOf("Snack Shack") !== -1) {
          html = true;
        }
      }
      return {
        error: error,
        waiting: !!reg.waiting,
        installing: !!reg.installing,
        portal: portal,
        html: html
      };
    });
  } finally {
    rootServer.clearPortal();
    writeFileSync(swPath, originalSw);
  }
  check(
    label + " install does not precache a captive portal",
    installResult.html &&
      !installResult.portal &&
      !installResult.waiting &&
      !installResult.installing &&
      rootServer.portalHits() > 0,
    JSON.stringify(installResult) + " hits " + rootServer.portalHits()
  );

  await page.goto(BASE, { waitUntil: "load" });
  rootServer.delayAll(20000);
  let appeared = -1;
  try {
    const started = Date.now();
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.locator('.menu-item[data-id="burger"]').waitFor({ state: "visible", timeout: 20000 });
    appeared = Date.now() - started;
  } finally {
    rootServer.clearDelay();
  }
  check(
    label + " hung network shows the app in about 3s",
    appeared >= 2500 && appeared < 4500,
    appeared + "ms"
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function workerSnapshot(page) {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const names = await caches.keys();
    async function fileCount(name) {
      if (names.indexOf(name) === -1) {
        return -1;
      }
      const cache = await caches.open(name);
      const keys = await cache.keys();
      return keys.length;
    }
    async function hasCore(name) {
      if (names.indexOf(name) === -1) {
        return false;
      }
      const cache = await caches.open(name);
      const home = await cache.match("./");
      const index = await cache.match("index.html");
      const app = await cache.match("app.js");
      const menu = await cache.match("menu.js");
      return !!(home && index && app && menu);
    }
    let other = "";
    if (names.indexOf("other-app-cache") !== -1) {
      const cache = await caches.open("other-app-cache");
      const hit = await cache.match("other-app.txt");
      other = hit ? await hit.text() : "";
    }
    const total = document.querySelector("#ticket-total");
    return {
      installing: reg && reg.installing ? reg.installing.state : "",
      waiting: reg && reg.waiting ? reg.waiting.state : "",
      active: reg && reg.active ? reg.active.state : "",
      controlled: !!navigator.serviceWorker.controller,
      names: names,
      v1: await fileCount("snack-shack-1"),
      v2: await fileCount("snack-shack-2"),
      v1core: await hasCore("snack-shack-1"),
      v2core: await hasCore("snack-shack-2"),
      installingCache: names.filter((name) => name.indexOf("-installing") !== -1),
      other: other,
      stillHere: window.__stillHere || 0,
      total: total ? total.textContent : ""
    };
  });
}

// Ask the browser to look for a new sw.js, then wait until that
// install finishes (waiting) or fails (redundant).
async function updateAndSettle(page, timeoutMs) {
  return page.evaluate(async (limit) => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      return "no-registration";
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), limit);
      function watch(worker) {
        if (!worker) {
          return;
        }
        const done = () => {
          if (worker.state === "installed" || worker.state === "activated" || worker.state === "redundant") {
            clearTimeout(timer);
            resolve(worker.state);
          }
        };
        worker.addEventListener("statechange", done);
        done();
      }
      reg.addEventListener("updatefound", () => watch(reg.installing));
      reg.update().catch((err) => {
        clearTimeout(timer);
        resolve("update-error " + err);
      });
    });
  }, timeoutMs);
}

// A page that arrives after the 3 second fallback must not be saved.
async function runLateNavigation(page, label) {
  const indexPath = appFile("index.html");
  const original = readFileSync(indexPath, "utf8");
  writeFileSync(indexPath, original.replace("<title>", "<!-- late-page-v2 --><title>"));
  rootServer.delay("/", 6000);
  try {
    const started = Date.now();
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.locator('.menu-item[data-id="burger"]').waitFor({ state: "visible", timeout: 15000 });
    const appeared = Date.now() - started;
    const remain = 8000 - (Date.now() - started);
    if (remain > 0) {
      await sleep(remain);
    }
    const saved = await page.evaluate(async () => {
      const names = await caches.keys();
      let leaked = false;
      for (let i = 0; i < names.length; i++) {
        if (names[i].indexOf("snack-shack-") !== 0) {
          continue;
        }
        const cache = await caches.open(names[i]);
        const keys = await cache.keys();
        for (let j = 0; j < keys.length; j++) {
          const text = await (await cache.match(keys[j])).text();
          if (text.indexOf("late-page-v2") !== -1) {
            leaked = true;
          }
        }
      }
      return {
        leaked: leaked,
        showing: document.documentElement.outerHTML.indexOf("late-page-v2") !== -1
      };
    });
    check(
      label + " a late page answer is dropped and not saved",
      appeared >= 2500 && appeared < 5500 && !saved.leaked && !saved.showing,
      appeared + "ms " + JSON.stringify(saved)
    );
  } finally {
    rootServer.clearDelay();
    writeFileSync(indexPath, original);
  }
}

// v1 stays up while a bad v2 install fails. A good v2 then waits.
// Closing every tab lets v2 take over its own cache.
async function runReleaseChecks(browser, browserName) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    serviceWorkers: "allow"
  });
  let page = await context.newPage();
  const origin = new URL(BASE).origin;
  page.__errors = track(page, origin);
  const label = browserName + " release";
  const swPath = appFile("sw.js");
  const original = readFileSync(swPath, "utf8");
  const originalApp = readFileSync(appFile("app.js"), "utf8");
  const originalMenu = readFileSync(appFile("menu.js"), "utf8");
  const originalCookie = readFileSync(appFile("assets/food/cookie.svg"), "utf8");
  try {
    await page.goto(BASE, { waitUntil: "load" });
    await waitForCache(page);
    await page.evaluate(() => {
      window.__stillHere = 1;
    });
    await page.locator('.menu-item[data-id="burger"]').click();
    await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$3");
    await page.evaluate(async () => {
      const cache = await caches.open("other-app-cache");
      await cache.put("other-app.txt", new Response("keep-me"));
    });

    writeFileSync(
      swPath,
      original.replace('var CACHE_VERSION = "1";', 'var CACHE_VERSION = "2"; // release-fail')
    );
    rootServer.portal("partial");
    let failedState = "timeout";
    try {
      failedState = await updateAndSettle(page, 20000);
    } finally {
      rootServer.clearPortal();
    }
    const failed = await workerSnapshot(page);
    const half = failed.names.filter((name) => name.indexOf("snack-shack-2") === 0);
    check(
      label + " a portal mid-install fails and leaves no half-filled cache",
      failedState === "redundant" &&
        half.length === 0 &&
        failed.v1core &&
        !failed.waiting &&
        rootServer.portalHits() > 0,
      failedState + " " + JSON.stringify(failed) + " hits " + rootServer.portalHits()
    );
    check(
      label + " the order stays up while a bad install fails",
      failed.stillHere === 1 && failed.total === "$3",
      JSON.stringify({ stillHere: failed.stillHere, total: failed.total })
    );

    await context.setOffline(true);
    let offlineBurger = 0;
    try {
      await page.reload({ waitUntil: "load" });
      offlineBurger = await page.locator('.menu-item[data-id="burger"]').count();
    } finally {
      await context.setOffline(false);
    }
    check(
      label + " an older complete cache still works offline",
      offlineBurger > 0 && (await workerSnapshot(page)).v1core,
      "burgers " + offlineBurger
    );

    await page.goto(BASE, { waitUntil: "load" });
    await page.evaluate(() => {
      window.__stillHere = 1;
    });
    await page.locator('.menu-item[data-id="burger"]').click();
    await page.waitForFunction(() => document.querySelector("#ticket-total").textContent === "$3");

    writeFileSync(appFile("app.js"), originalApp + "\n/* v2-app */\n");
    writeFileSync(appFile("menu.js"), originalMenu + "\n/* v2-menu */\n");
    writeFileSync(appFile("assets/food/cookie.svg"), originalCookie + "<!-- v2-cookie -->");
    writeFileSync(
      swPath,
      original.replace('var CACHE_VERSION = "1";', 'var CACHE_VERSION = "2"; // release-ok')
    );
    // Confirm the new app.js is already on the server. The 30 second
    // hold only changes runtime fallback. It does not change install.
    const stamped = await page.evaluate(async () => {
      const text = await (await fetch("app.js?clear-hold=" + Date.now())).text();
      return text.indexOf("/* v2-app */") !== -1;
    });
    check(label + " the updated app.js is on the server before install", stamped);
    const okState = await updateAndSettle(page, 20000);
    const waiting = await workerSnapshot(page);
    check(
      label + " a new worker installs and registration.waiting is set",
      okState === "installed" &&
        waiting.waiting === "installed" &&
        waiting.v2core &&
        waiting.v1core &&
        waiting.v2 >= appFiles.length,
      okState + " " + JSON.stringify(waiting)
    );
    check(
      label + " an in-progress order stays on screen with no reload",
      waiting.stillHere === 1 && waiting.total === "$3",
      JSON.stringify({ stillHere: waiting.stillHere, total: waiting.total })
    );

    await context.setOffline(true);
    let waitingSnap;
    try {
      waitingSnap = await readReleaseFiles(page);
    } finally {
      await context.setOffline(false);
    }
    const oldFetched = releaseMarks(waitingSnap.app, waitingSnap.menu, waitingSnap.cookie);
    const oldCached = releaseMarks(waitingSnap.v1app, waitingSnap.v1menu, waitingSnap.v1cookie);
    const newCached = releaseMarks(waitingSnap.v2app, waitingSnap.v2menu, waitingSnap.v2cookie);
    check(
      label + " offline is all old while v2 waits, and v2's cache is all new",
      !oldFetched.app && !oldFetched.menu && !oldFetched.cookie &&
        !oldCached.app && !oldCached.menu && !oldCached.cookie &&
        newCached.app && newCached.menu && newCached.cookie,
      JSON.stringify({ oldFetched: oldFetched, oldCached: oldCached, newCached: newCached })
    );

    // v2 is waiting, so it has not activated yet. Plant a newer release
    // and an older side cache. Activate should drop only the older ones.
    await page.evaluate(async () => {
      const newer = await caches.open("snack-shack-3");
      await newer.put("newer.txt", new Response("keep-newer"));
      const installing = await caches.open("snack-shack-3-installing");
      await installing.put("installing.txt", new Response("keep-installing"));
      const olderSide = await caches.open("snack-shack-1-installing");
      await olderSide.put("old-side.txt", new Response("drop-me"));
    });

    await page.close();
    for (const extra of context.pages()) {
      await extra.close();
    }
    await sleep(500);
    page = await context.newPage();
    page.__errors = track(page, origin);
    await page.goto(BASE, { waitUntil: "load" });
    let after = null;
    const woke = Date.now();
    while (Date.now() - woke < 10000) {
      after = await workerSnapshot(page);
      if (
        after.active === "activated" &&
        !after.waiting &&
        after.controlled &&
        after.v2core &&
        after.names.indexOf("snack-shack-1") === -1
      ) {
        break;
      }
      await sleep(200);
    }
    const burgers = await page.locator('.menu-item[data-id="burger"]').count();
    const kept = await page.evaluate(async () => {
      const names = await caches.keys();
      async function texts(name) {
        if (names.indexOf(name) === -1) {
          return [];
        }
        const cache = await caches.open(name);
        const keys = await cache.keys();
        const out = [];
        for (let i = 0; i < keys.length; i++) {
          const hit = await cache.match(keys[i]);
          out.push((hit ? await hit.text() : "") + " @ " + keys[i].url);
        }
        return out;
      }
      return {
        newer: await texts("snack-shack-3"),
        installing: await texts("snack-shack-3-installing")
      };
    });
    check(
      label + " after every tab is closed the v2 worker is active on its own cache",
      after.active === "activated" &&
        !after.waiting &&
        after.controlled &&
        after.v2 >= appFiles.length &&
        after.names.indexOf("snack-shack-1") === -1 &&
        after.names.indexOf("snack-shack-1-installing") === -1 &&
        after.names.indexOf("snack-shack-2") !== -1 &&
        after.other === "keep-me" &&
        burgers > 0,
      JSON.stringify(after) + " burgers " + burgers
    );
    const newerKept = keptFile(kept.newer, "newer.txt", "keep-newer");
    const installingKept = keptFile(kept.installing, "installing.txt", "keep-installing");
    check(
      label + " activate deletes older copies and keeps a newer install",
      after.names.indexOf("snack-shack-1") === -1 &&
        after.names.indexOf("snack-shack-1-installing") === -1 &&
        after.names.indexOf("snack-shack-3") !== -1 &&
        after.names.indexOf("snack-shack-3-installing") !== -1 &&
        newerKept &&
        installingKept,
      JSON.stringify({ names: after.names, kept: kept })
    );
    await context.setOffline(true);
    let activeSnap;
    try {
      await page.reload({ waitUntil: "load" });
      activeSnap = await readReleaseFiles(page);
    } finally {
      await context.setOffline(false);
    }
    const activeFetched = releaseMarks(activeSnap.app, activeSnap.menu, activeSnap.cookie);
    check(
      label + " offline is all new after v2 takes over",
      activeFetched.app && activeFetched.menu && activeFetched.cookie && activeSnap.v1app === "",
      JSON.stringify(activeFetched)
    );
    check(label + " no page errors", page.__errors.length === 0, page.__errors.join(" | "));
  } finally {
    writeFileSync(swPath, original);
    writeFileSync(appFile("app.js"), originalApp);
    writeFileSync(appFile("menu.js"), originalMenu);
    writeFileSync(appFile("assets/food/cookie.svg"), originalCookie);
    rootServer.clearPortal();
    await context.close();
  }
}

function keptFile(entries, fileName, body) {
  const hit = entries.find((entry) => entry.indexOf(body) !== -1 && entry.indexOf(fileName) !== -1);
  if (!hit) {
    return false;
  }
  const text = hit.split(" @ ")[0];
  return text === body && Buffer.byteLength(text) === Buffer.byteLength(body);
}

function releaseMarks(app, menu, cookie) {
  return {
    app: app.indexOf("/* v2-app */") !== -1,
    menu: menu.indexOf("/* v2-menu */") !== -1,
    cookie: cookie.indexOf("<!-- v2-cookie -->") !== -1
  };
}

async function readReleaseFiles(page) {
  return page.evaluate(async () => {
    async function body(path) {
      try {
        const res = await fetch(path);
        return await res.text();
      } catch (err) {
        return "";
      }
    }
    async function saved(name, path) {
      const names = await caches.keys();
      if (names.indexOf(name) === -1) {
        return "";
      }
      const cache = await caches.open(name);
      const hit = await cache.match(path);
      return hit ? await hit.text() : "";
    }
    return {
      app: await body("app.js"),
      menu: await body("menu.js"),
      cookie: await body("assets/food/cookie.svg"),
      v1app: await saved("snack-shack-1", "app.js"),
      v1menu: await saved("snack-shack-1", "menu.js"),
      v1cookie: await saved("snack-shack-1", "assets/food/cookie.svg"),
      v2app: await saved("snack-shack-2", "app.js"),
      v2menu: await saved("snack-shack-2", "menu.js"),
      v2cookie: await saved("snack-shack-2", "assets/food/cookie.svg")
    };
  });
}

// The open tab sees the newer files while online, then reloads offline.
// Those files must all be the installed snapshot, not a mix.
async function runOfflineReload(browser, browserName) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    serviceWorkers: "allow"
  });
  const page = await context.newPage();
  page.__errors = track(page, new URL(BASE).origin);
  const label = browserName + " offline reload";
  const swPath = appFile("sw.js");
  const originalSw = readFileSync(swPath, "utf8");
  const originalApp = readFileSync(appFile("app.js"), "utf8");
  const originalMenu = readFileSync(appFile("menu.js"), "utf8");
  const originalCookie = readFileSync(appFile("assets/food/cookie.svg"), "utf8");
  const originalHtml = readFileSync(appFile("index.html"), "utf8");
  try {
    await page.goto(BASE, { waitUntil: "load" });
    await waitForCache(page);
    writeFileSync(appFile("app.js"), originalApp + "\n/* v2-app */\n");
    writeFileSync(appFile("menu.js"), originalMenu + "\n/* v2-menu */\n");
    writeFileSync(appFile("assets/food/cookie.svg"), originalCookie + "<!-- v2-cookie -->");
    writeFileSync(appFile("index.html"), originalHtml.replace("</body>", "<!-- v2-page --></body>"));
    writeFileSync(
      swPath,
      originalSw.replace('var CACHE_VERSION = "1";', 'var CACHE_VERSION = "2"; // live-copy')
    );
    const state = await updateAndSettle(page, 20000);
    const waiting = await workerSnapshot(page);
    check(
      label + " v2 is waiting in its own cache",
      state === "installed" && waiting.waiting === "installed" && waiting.v1core && waiting.v2core,
      state + " " + JSON.stringify(waiting)
    );
    // GitHub Pages keeps a file for 10 minutes. The worker must still
    // hand back no-cache, or this reload mixes the old page with the new files.
    rootServer.setFileCache("max-age=600");
    await page.reload({ waitUntil: "load" });
    const online = await page.evaluate(async () => {
      async function one(path) {
        const res = await fetch(path);
        return { text: await res.text(), cache: res.headers.get("cache-control") || "" };
      }
      return {
        app: await one("app.js"),
        menu: await one("menu.js"),
        cookie: await one("assets/food/cookie.svg"),
        page: document.documentElement.outerHTML
      };
    });
    check(
      label + " the open tab sees v2 while online",
      online.app.text.indexOf("/* v2-app */") !== -1 &&
        online.menu.text.indexOf("/* v2-menu */") !== -1 &&
        online.cookie.text.indexOf("<!-- v2-cookie -->") !== -1 &&
        online.page.indexOf("<!-- v2-page -->") !== -1 &&
        online.app.cache.indexOf("no-cache") !== -1 &&
        online.menu.cache.indexOf("no-cache") !== -1 &&
        online.cookie.cache.indexOf("no-cache") !== -1,
      JSON.stringify({
        app: online.app.cache,
        menu: online.menu.cache,
        cookie: online.cookie.cache
      })
    );
    await context.setOffline(true);
    await page.reload({ waitUntil: "load" });
    const offline = await page.evaluate(async () => {
      async function text(path) {
        const res = await fetch(path);
        return await res.text();
      }
      return {
        app: await text("app.js"),
        menu: await text("menu.js"),
        cookie: await text("assets/food/cookie.svg"),
        page: document.documentElement.outerHTML
      };
    });
    const marks = {
      app: offline.app.indexOf("/* v2-app */") !== -1,
      menu: offline.menu.indexOf("/* v2-menu */") !== -1,
      cookie: offline.cookie.indexOf("<!-- v2-cookie -->") !== -1,
      page: offline.page.indexOf("<!-- v2-page -->") !== -1
    };
    const anyNew = marks.app || marks.menu || marks.cookie || marks.page;
    check(
      label + " offline reload is all v1, with no mixing",
      !anyNew,
      JSON.stringify(marks)
    );
  } finally {
    rootServer.setFileCache("no-store");
    writeFileSync(swPath, originalSw);
    writeFileSync(appFile("app.js"), originalApp);
    writeFileSync(appFile("menu.js"), originalMenu);
    writeFileSync(appFile("assets/food/cookie.svg"), originalCookie);
    writeFileSync(appFile("index.html"), originalHtml);
    await context.setOffline(false);
    await context.close();
  }
}

// Files change, the version number does not. The installed snapshot stays.
async function runNoBump(browser, browserName) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    serviceWorkers: "allow"
  });
  const page = await context.newPage();
  page.__errors = track(page, new URL(BASE).origin);
  const label = browserName + " no bump";
  const swPath = appFile("sw.js");
  const originalSw = readFileSync(swPath, "utf8");
  const originalApp = readFileSync(appFile("app.js"), "utf8");
  const originalMenu = readFileSync(appFile("menu.js"), "utf8");
  const originalCookie = readFileSync(appFile("assets/food/cookie.svg"), "utf8");
  try {
    await page.goto(BASE, { waitUntil: "load" });
    await waitForCache(page);
    writeFileSync(appFile("app.js"), originalApp + "\n/* nobump-app */\n");
    writeFileSync(appFile("menu.js"), originalMenu + "\n/* nobump-menu */\n");
    writeFileSync(appFile("assets/food/cookie.svg"), originalCookie + "<!-- nobump-cookie -->");
    writeFileSync(swPath, originalSw + "\n// nobump-comment\n");
    const state = await updateAndSettle(page, 20000);
    const waiting = await workerSnapshot(page);
    await context.setOffline(true);
    let snap;
    try {
      snap = await readReleaseFiles(page);
    } finally {
      await context.setOffline(false);
    }
    const fetched = {
      app: snap.app.indexOf("/* nobump-app */") !== -1,
      menu: snap.menu.indexOf("/* nobump-menu */") !== -1,
      cookie: snap.cookie.indexOf("<!-- nobump-cookie -->") !== -1
    };
    const cached = {
      app: snap.v1app.indexOf("/* nobump-app */") !== -1,
      menu: snap.v1menu.indexOf("/* nobump-menu */") !== -1,
      cookie: snap.v1cookie.indexOf("<!-- nobump-cookie -->") !== -1
    };
    check(
      label + " a same-number install waits and leaves the old snapshot",
      state === "installed" &&
        waiting.waiting === "installed" &&
        waiting.v2 === -1 &&
        !fetched.app && !fetched.menu && !fetched.cookie &&
        !cached.app && !cached.menu && !cached.cookie &&
        snap.v1app.indexOf("SNACK SHACK") !== -1 &&
        snap.v1menu.indexOf("var MENU") !== -1,
      state + " " + JSON.stringify({ fetched: fetched, cached: cached, waiting: waiting.waiting, v2: waiting.v2 })
    );
  } finally {
    writeFileSync(swPath, originalSw);
    writeFileSync(appFile("app.js"), originalApp);
    writeFileSync(appFile("menu.js"), originalMenu);
    writeFileSync(appFile("assets/food/cookie.svg"), originalCookie);
    await context.close();
  }
}

// First visit, with no saved copy yet. A portal mid-install must fail
// clean, and the next normal visit must then work offline.
// Same CACHE_VERSION, but APP_FILES now names a file that is not there.
// The failed install must leave snack-shack-1 in place.
async function runSameVersionFailure(browser, browserName) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    serviceWorkers: "allow"
  });
  const page = await context.newPage();
  page.__errors = track(page, new URL(BASE).origin);
  const label = browserName + " same version";
  const swPath = appFile("sw.js");
  const original = readFileSync(swPath, "utf8");
  try {
    await page.goto(BASE, { waitUntil: "load" });
    await waitForCache(page);
    const before = await workerSnapshot(page);
    writeFileSync(
      swPath,
      original.replace(
        '"assets/icons/icon-512.png"\n];',
        '"assets/icons/icon-512.png",\n  "assets/food/taco.svg"\n]; // same-version-missing'
      )
    );
    const state = await updateAndSettle(page, 20000);
    const after = await workerSnapshot(page);
    check(
      label + " a failed install keeps the live cache",
      state === "redundant" &&
        after.v1core &&
        after.v1 >= appFiles.length &&
        after.v1 === before.v1 &&
        after.names.indexOf("snack-shack-1") !== -1 &&
        after.installingCache.length === 0,
      state + " before " + before.v1 + " after " + JSON.stringify(after)
    );
    await context.setOffline(true);
    let burgers = 0;
    try {
      await page.reload({ waitUntil: "load" });
      burgers = await page.locator('.menu-item[data-id="burger"]').count();
    } finally {
      await context.setOffline(false);
    }
    check(
      label + " offline still works after that failed install",
      burgers > 0 && (await workerSnapshot(page)).v1core,
      "burgers " + burgers
    );
  } finally {
    writeFileSync(swPath, original);
    await context.close();
  }
}

async function runPartialFirstInstall(browser, browserName, server, base, label) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    serviceWorkers: "allow"
  });
  const page = await context.newPage();
  page.__errors = track(page, new URL(base).origin);
  server.portal("partial");
  try {
    await page.goto(base, { waitUntil: "load" });
    let last = null;
    let lastHits = -1;
    let stableSince = 0;
    let sawWork = false;
    const started = Date.now();
    while (Date.now() - started < 25000) {
      const hits = server.portalHits();
      last = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        const names = await caches.keys();
        return {
          installing: reg && reg.installing ? reg.installing.state : "",
          waiting: !!(reg && reg.waiting),
          active: !!(reg && reg.active),
          names: names
        };
      });
      if (hits > 5) {
        sawWork = true;
      }
      if (hits === lastHits) {
        if (!stableSince) {
          stableSince = Date.now();
        }
      } else {
        lastHits = hits;
        stableSince = 0;
      }
      const snack = last.names.filter((name) => name.indexOf("snack-shack-") === 0);
      const busy = last.installing === "installing" || last.installing === "activating";
      if (
        sawWork &&
        !busy &&
        !last.waiting &&
        !last.active &&
        snack.length === 0 &&
        stableSince &&
        Date.now() - stableSince > 1000
      ) {
        break;
      }
      await sleep(100);
    }
    const snackLeft = (last && last.names ? last.names : []).filter((name) => name.indexOf("snack-shack-") === 0);
    check(
      label + " a portal on the first install fails and leaves no cache",
      sawWork && snackLeft.length === 0 && !(last && last.active) && server.portalHits() > 0,
      JSON.stringify(last) + " hits " + server.portalHits()
    );

    server.clearPortal();
    await page.goto(base, { waitUntil: "load" });
    await waitForCache(page);
    await context.setOffline(true);
    let burgers = 0;
    try {
      await page.reload({ waitUntil: "load" });
      burgers = await page.locator('.menu-item[data-id="burger"]').count();
    } finally {
      await context.setOffline(false);
    }
    const ready = await workerSnapshot(page);
    check(
      label + " a later visit installs every file and works offline",
      burgers > 0 && ready.v1 >= appFiles.length && ready.installingCache.length === 0,
      "burgers " + burgers + " " + JSON.stringify(ready)
    );
  } finally {
    server.clearPortal();
    await context.close();
  }
}

function copyApp() {
  const dest = mkdtempSync(join(tmpdir(), "snack-shack-"));
  cpSync(ROOT, dest, {
    recursive: true,
    filter(src) {
      const rel = relative(ROOT, src);
      if (!rel) {
        return true;
      }
      if (rel === ".git" || rel.startsWith(".git" + "/")) {
        return false;
      }
      if (rel.split("/").indexOf("node_modules") !== -1) {
        return false;
      }
      if (rel === "tests/results" || rel.startsWith("tests/results/")) {
        return false;
      }
      return true;
    }
  });
  return dest;
}

async function guard(name, fn) {
  try {
    await fn();
  } catch (err) {
    const text = err && err.stack ? String(err.stack) : String(err);
    check(name + " did not finish", false, text.split("\n").slice(0, 3).join(" "));
  } finally {
    if (rootServer) {
      rootServer.clearPortal();
      rootServer.clearDelay();
      rootServer.setFileCache("no-store");
    }
    if (subServer) {
      subServer.clearPortal();
      subServer.clearDelay();
      subServer.setFileCache("no-store");
    }
  }
}

async function main() {
  rmSync(join(ARTIFACTS, "playwright_results.txt"), { force: true });
  await rmAsync(HOST_DIR, { recursive: true, force: true });
  await mkdirAsync(HOST_DIR, { recursive: true });
  appDir = copyApp();
  await symlinkAsync(appDir, join(HOST_DIR, "SnackShack"));

  const docFiles = [
    "assets/STYLE.md",
    "assets/LICENSES.md",
    "assets/fonts/OFL.txt",
    "assets/fonts/OFL-Fredoka.txt",
    "assets/fonts/OFL-Nunito.txt"
  ];
  const runtimeAssets = assetFiles.filter((file) => docFiles.indexOf(file) === -1);
  check(
    "runtime asset files are in the service worker list",
    runtimeAssets.every((file) => appFiles.indexOf(file) !== -1),
    runtimeAssets.filter((file) => appFiles.indexOf(file) === -1).join(", ")
  );
  check(
    "precache leaves out docs and font license text",
    docFiles.every((file) => appFiles.indexOf(file) === -1),
    docFiles.filter((file) => appFiles.indexOf(file) !== -1).join(", ")
  );
  const appSource = readFileSync(join(ROOT, "app.js"), "utf8");
  check(
    "no sound priming code",
    appSource.indexOf("function prime") === -1 &&
      appSource.indexOf("unlockSounds") === -1 &&
      appSource.indexOf(".prime(") === -1
  );
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const css = readFileSync(join(ROOT, "styles.css"), "utf8");
  const indexHtml = readFileSync(join(ROOT, "index.html"), "utf8");
  check(
    "pinch zoom is blocked on iOS on purpose",
    appSource.indexOf("Blocks pinch zoom on iOS") !== -1 &&
      appSource.indexOf("kids' app") !== -1 &&
      appSource.indexOf("prevents accidental zoom") !== -1 &&
      readme.indexOf("Pinch zoom is blocked on iOS on purpose") !== -1 &&
      readme.indexOf("prevents accidental zoom") !== -1 &&
      readme.indexOf("Dustin is turning it on now") === -1 &&
      css.indexOf("Pinch zoom is blocked on iOS on purpose") !== -1 &&
      css.indexOf("prevents accidental zoom") !== -1 &&
      indexHtml.indexOf("Pinch zoom is blocked on iOS on purpose") !== -1 &&
      indexHtml.indexOf("prevents accidental zoom") !== -1 &&
      appSource.indexOf("pinch stays possible") === -1 &&
      readme.indexOf("pinch stays possible") === -1 &&
      css.indexOf("pinch stays possible") === -1 &&
      indexHtml.indexOf("pinch stays possible") === -1
  );
  check(
    "CACHE_VERSION names this release's own cache",
    swSource.indexOf('var CACHE_VERSION = "1"') !== -1 &&
      swSource.indexOf('var CACHE_NAME = "snack-shack-" + CACHE_VERSION') !== -1 &&
      swSource.indexOf('var INSTALL_CACHE = CACHE_NAME + "-installing"') !== -1 &&
      swSource.indexOf("function isOlderCopy(name)") !== -1 &&
      swSource.indexOf("return caches.delete(INSTALL_CACHE);") !== -1 &&
      swSource.indexOf("caches.delete(CACHE_NAME)") === -1 &&
      swSource.indexOf("cache.addAll") === -1 &&
      swSource.indexOf("Always count up") !== -1 &&
      swSource.indexOf("skipWaiting()") === -1 &&
      swSource.indexOf("/.netlify/") === -1 &&
      swSource.indexOf("Drop this later") !== -1 &&
      swSource.indexOf("function remember") === -1 &&
      swSource.indexOf("Only install writes") !== -1 &&
      readme.indexOf("always count up: 1, 2, 3") !== -1 &&
      readme.indexOf("A rollback ships as a new, higher number") !== -1 &&
      readme.indexOf("ordinary edit") === -1 &&
      readme.indexOf("Netlify") === -1
  );
  check("repo has an empty .nojekyll", statSync(join(ROOT, ".nojekyll")).isFile() && statSync(join(ROOT, ".nojekyll")).size === 0);
  check(
    "page blocks selection, callouts, and tap flash",
    css.includes("-webkit-user-select: none") &&
      css.includes("-webkit-touch-callout: none") &&
      css.includes("-webkit-tap-highlight-color: transparent") &&
      css.includes("overscroll-behavior: none") &&
      css.includes("env(safe-area-inset-top)")
  );

  rootServer = startServer(appDir, PORT);
  subServer = startServer(HOST_DIR, SUB_PORT);
  await waitForHttp(BASE);
  await waitForHttp(SUB_BASE);

  const browsers = [
    ["chromium", chromium],
    ["webkit", webkit]
  ];
  const sizes = [
    [1024, 768],
    [1180, 820],
    [768, 1024],
    [844, 390]
  ];

  const reviewOnly = process.argv.indexOf("--review-only") !== -1;
  const releaseOnly = process.argv.indexOf("--release-only") !== -1;
  for (const [name, engine] of browsers) {
    const browser = await engine.launch();
    try {
      if (!reviewOnly && !releaseOnly) {
        for (const [width, height] of sizes) {
          await guard(name + " " + width + "x" + height, () => runSize(browser, name, width, height));
        }
      }
      if (!releaseOnly) {
        await guard(name + " review", () => runReviewChecks(browser, name));
      }
      await guard(name + " release", () => runReleaseChecks(browser, name));
      await guard(name + " offline reload", () => runOfflineReload(browser, name));
      await guard(name + " no bump", () => runNoBump(browser, name));
      await guard(name + " same version", () => runSameVersionFailure(browser, name));
      await guard(name + " first install", () => runPartialFirstInstall(browser, name, rootServer, BASE, name + " first install"));
      await guard(name + " first install subfolder", () => runPartialFirstInstall(browser, name, subServer, SUB_BASE, name + " first install /SnackShack/"));
      if (reviewOnly || releaseOnly) {
        continue;
      }
      await guard(name + " picture", () => runPictureNote(browser, name));
      await guard(name + " subfolder", () => runSubfolder(browser, name));
      await guard(name + " logic", () => runLogic(browser, name));
      if (name === "chromium") {
        const fileBrowser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
        try {
          await guard(name + " file", () => runFilePage(fileBrowser, name));
        } finally {
          await fileBrowser.close();
        }
      }
    } finally {
      await browser.close();
    }
  }

  check("no request left this origin", foreign.length === 0, foreign.slice(0, 8).join(", "));

  const passed = results.filter((item) => item.pass).length;
  const failed = results.filter((item) => !item.pass).length;
  writeResults();
  console.log(`\n${passed} passed, ${failed} failed`);

  if (rootServer) {
    rootServer.kill();
  }
  if (subServer) {
    subServer.kill();
  }
  rmSync(appDir, { recursive: true, force: true });
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  check("suite crashed", false, err && err.stack ? String(err.stack) : String(err));
  writeResults();
  console.error(err);
  if (rootServer) {
    rootServer.kill();
  }
  if (subServer) {
    subServer.kill();
  }
  process.exit(1);
});
