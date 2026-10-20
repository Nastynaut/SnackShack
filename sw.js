// ============================================================
// OFFLINE COPY
// ============================================================
// The iPad saves these files the first time Snack Shack is opened
// online. After that, the home-screen app works with Wi-Fi off.
//
// While the iPad is online, we show a fresh copy from the site.
// That copy is not written over the snapshot install saved.
// If the site is slow or off, we use that snapshot. Offline is
// always one release, so the page, scripts, and pictures match.
//
// Paths are relative (no leading slash) so the same file works at
// the root of a site or in a folder such as /SnackShack/.

// The number on this saved copy. Each number gets its own cache,
// named snack-shack-1, snack-shack-2, and so on. Always count up:
// 1, then 2, then 3. Every change to an app file needs the next
// number. Only install writes a release cache. An open tab keeps
// its snapshot until a higher number takes over, after the app is
// closed and opened again.
var CACHE_VERSION = "2";
var CACHE_NAME = "snack-shack-" + CACHE_VERSION;

// This release is gathered here first. The named cache above is
// filled only after every file has checked out. If one file fails,
// this side cache is deleted and the open tab keeps its own copy.
var INSTALL_CACHE = CACHE_NAME + "-installing";

// How long we wait for the site before using the saved copy.
var NETWORK_WAIT_MS = 3000;

// After the page itself had to use the saved copy, keep using that
// copy for its pictures, scripts, and sounds. This lasts a short
// while so a slow Wi-Fi does not add another 3 second wait for
// every file. A real answer from the site clears it.
var offlineUntil = 0;
var OFFLINE_HOLD_MS = 30000;

// Only files the page needs while it runs. The save stops if any ONE
// of these is missing, so notes and license text stay out of this list.
var APP_FILES = [
  "./",
  "index.html",
  "app.js",
  "menu.js",
  "options.js",
  "styles.css",
  "manifest.webmanifest",
  "assets/tokens.css",
  "assets/buttons.css",
  "assets/fonts/fonts.css",
  "assets/fonts/fredoka-latin-400-normal.woff2",
  "assets/fonts/fredoka-latin-500-normal.woff2",
  "assets/fonts/fredoka-latin-600-normal.woff2",
  "assets/fonts/fredoka-latin-700-normal.woff2",
  "assets/fonts/nunito-latin-400-normal.woff2",
  "assets/fonts/nunito-latin-600-normal.woff2",
  "assets/fonts/nunito-latin-700-normal.woff2",
  "assets/fonts/nunito-latin-800-normal.woff2",
  "assets/food/burger.svg",
  "assets/food/cheeseburger.svg",
  "assets/food/chicken-nuggets.svg",
  "assets/food/cookie.svg",
  "assets/food/fries.svg",
  "assets/food/hot-dog.svg",
  "assets/food/ice-cream-cone.svg",
  "assets/food/lemonade.svg",
  "assets/food/milkshake.svg",
  "assets/food/pizza-slice.svg",
  "assets/food/soda.svg",
  "assets/food/water.svg",
  // Option drawings for the toppings and flavors screen.
  // options.js asks for these. A missing file falls back to emoji.
  "assets/options/cheese.svg",
  "assets/options/chocolate.svg",
  "assets/options/ice.svg",
  "assets/options/ketchup.svg",
  "assets/options/lettuce.svg",
  "assets/options/mayo.svg",
  "assets/options/mustard.svg",
  "assets/options/no-ice.svg",
  "assets/options/onion.svg",
  "assets/options/pickles.svg",
  "assets/options/relish.svg",
  "assets/options/sprinkles.svg",
  "assets/options/strawberry.svg",
  "assets/options/tomato.svg",
  "assets/options/vanilla.svg",
  "assets/sounds/add.mp3",
  "assets/sounds/checkout.mp3",
  // Home-screen pictures. The SVG is the drawing. The PNGs are
  // what the iPad and the manifest use.
  "assets/icons/app-icon.svg",
  "assets/icons/apple-touch-icon-180.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png"
];

// Safari asks for a sound in pieces (a Range header). We saved the
// whole mp3. Hand back only the piece it asked for, still from the
// saved copy, with no extra network trip.
function sliceRange(request, cached) {
  var header = request.headers.get("range") || "";
  var parts = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!parts) {
    return Promise.resolve(cached);
  }

  return cached.blob().then(function (blob) {
    var size = blob.size;
    var start = parts[1] === "" ? 0 : parseInt(parts[1], 10);
    var end = parts[2] === "" ? size - 1 : parseInt(parts[2], 10);
    if (start < 0 || end < start || start >= size) {
      return new Response(null, {
        status: 416,
        statusText: "Range not satisfiable",
        headers: { "Content-Range": "bytes */" + size }
      });
    }
    if (end >= size) {
      end = size - 1;
    }
    var piece = blob.slice(start, end + 1);
    var type = cached.headers.get("Content-Type") || "application/octet-stream";
    return new Response(piece, {
      status: 206,
      statusText: "Partial Content",
      headers: {
        "Content-Type": type,
        "Content-Length": String(end - start + 1),
        "Content-Range": "bytes " + start + "-" + end + "/" + size,
        "Accept-Ranges": "bytes"
      }
    });
  });
}

// The end of the file name, like ".css". The home page has none.
function fileExtension(request) {
  var path = new URL(request.url).pathname;
  var slash = path.lastIndexOf("/");
  var name = slash === -1 ? path : path.slice(slash + 1);
  var dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return "";
  }
  return name.slice(dot).toLowerCase();
}

// A Wi-Fi login page must never be saved over the app. Login pages
// are HTML at every address. A page must be HTML and must contain
// the marker from index.html. Any other file just must not be HTML.
// Redirects and errors also count as a miss. Hosts name pictures,
// sounds, and fonts in different ways, so we do not require one
// exact type. One odd name would stop the whole offline save.
var PAGE_MARKER = 'name="snack-shack-page"';

function isOurFile(request, response) {
  if (!response || !response.ok || response.redirected) {
    return Promise.resolve(false);
  }
  var contentType = (response.headers.get("content-type") || "").toLowerCase();
  var isHtml = contentType.indexOf("text/html") !== -1;
  var ext = fileExtension(request);
  var isPage = isPageLoad(request) || ext === ".html" || ext === "";
  if (!isPage) {
    return Promise.resolve(!isHtml);
  }
  if (!isHtml) {
    return Promise.resolve(false);
  }
  // Read a copy. The real answer can still be shown and saved.
  return response.clone().text().then(function (text) {
    return text.indexOf(PAGE_MARKER) !== -1;
  });
}

// Save one file, skipping the browser's old copy so install stores
// what the site has right now. A login page fails this and is not saved.
function saveOne(cache, path) {
  var request = new Request(path, { cache: "reload" });
  return fetch(request).then(function (response) {
    return isOurFile(request, response).then(function (ok) {
      if (!ok) {
        throw new Error(path);
      }
      return cache.put(request, response);
    });
  });
}

// Every saved file has to be present before this release is published.
function confirmSaved(cache, path) {
  return cache.match(new Request(path)).then(function (hit) {
    if (!hit) {
      throw new Error(path);
    }
  });
}

// Copy one checked file into this release's real cache.
function copyCached(fromCache, toCache, request) {
  return fromCache.match(request).then(function (response) {
    if (!response) {
      throw new Error("missing");
    }
    return toCache.put(request, response);
  });
}

// True when this release's cache already holds every app file.
function cacheIsComplete(cache) {
  var checks = [];
  for (var i = 0; i < APP_FILES.length; i++) {
    checks.push(confirmSaved(cache, APP_FILES[i]));
  }
  return Promise.all(checks).then(function () {
    return true;
  }, function () {
    return false;
  });
}

// Move the side cache into this release's cache, then drop the side cache.
// If this number already has a snapshot, leave it. A new snapshot needs
// a higher CACHE_VERSION. Only install writes here.
function publishRelease(staging) {
  return caches.open(CACHE_NAME).then(function (live) {
    return cacheIsComplete(live).then(function (already) {
      if (already) {
        return caches.delete(INSTALL_CACHE);
      }
      return staging.keys().then(function (keys) {
        var jobs = [];
        for (var i = 0; i < keys.length; i++) {
          jobs.push(copyCached(staging, live, keys[i]));
        }
        return Promise.all(jobs);
      }).then(function () {
        var checks = [];
        for (var i = 0; i < APP_FILES.length; i++) {
          checks.push(confirmSaved(live, APP_FILES[i]));
        }
        return Promise.all(checks);
      }).then(function () {
        return caches.delete(INSTALL_CACHE);
      });
    });
  });
}

// A failed save only throws away the side cache. The named cache
// may be the one an open tab is reading right now, so it stays.
function discardFailedInstall() {
  return caches.delete(INSTALL_CACHE);
}

function installRelease() {
  return caches.open(INSTALL_CACHE).then(function (staging) {
    var jobs = [];
    var i;
    for (i = 0; i < APP_FILES.length; i++) {
      jobs.push(saveOne(staging, APP_FILES[i]));
    }
    return Promise.all(jobs).then(function () {
      var checks = [];
      for (i = 0; i < APP_FILES.length; i++) {
        checks.push(confirmSaved(staging, APP_FILES[i]));
      }
      return Promise.all(checks);
    }).then(function () {
      return publishRelease(staging);
    });
  }).catch(function (err) {
    return discardFailedInstall().then(function () {
      throw err;
    });
  });
}

self.addEventListener("install", function (event) {
  // Do not call skipWaiting. A new copy waits until the home-screen
  // app is swiped closed and opened again. Reloading now would wipe
  // the ticket a child is still building.
  // Install fails unless every APP_FILES entry was checked and saved.
  event.waitUntil(installRelease());
});

// True for snack-shack-1 or snack-shack-1-installing when this
// worker is a higher number, like 2. Always count CACHE_VERSION up.
function isOlderCopy(name) {
  var match = /^snack-shack-(\d+)(-installing)?$/.exec(name);
  return match !== null && Number(match[1]) < Number(CACHE_VERSION);
}

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      var jobs = [];
      for (var i = 0; i < names.length; i++) {
        // Only our own OLDER copies. A newer number may be a release
        // that is still installing, and another app keeps its cache.
        if (isOlderCopy(names[i])) {
          jobs.push(caches.delete(names[i]));
        }
      }
      return Promise.all(jobs);
    }).then(function () {
      // Control the open page without reloading it.
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);

  // Only read our own files. Never call another website.
  if (request.method !== "GET") {
    return;
  }
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(networkFirst(request));
});

// A page load, including one with ?something in the address.
function isPageLoad(request) {
  return request.mode === "navigate";
}

function noteSavedPage() {
  offlineUntil = Date.now() + OFFLINE_HOLD_MS;
}

function noteLiveFile() {
  offlineUntil = 0;
}

// The page already fell back. Its other files skip the network wait.
function savedCopyIsEnough(request) {
  return !isPageLoad(request) && Date.now() < offlineUntil;
}

// Ask the site first and show that answer. Do not save it. Only
// install writes the release cache. If the site is quiet for about
// 3 seconds, sends a login page, or cannot be reached, use the
// installed snapshot. If nothing is saved, hand back the site's
// real answer.
function networkFirst(request) {
  if (savedCopyIsEnough(request)) {
    return fromCache(request).then(function (cached) {
      if (cached) {
        return cached;
      }
      return askNetwork(request);
    });
  }
  return askNetwork(request);
}

// Use the saved copy when we have one. Otherwise hand back the real
// answer, or fail when the site never answered.
function settleFromCache(request, cached, resolve, reject, realResponse) {
  if (cached) {
    if (isPageLoad(request)) {
      noteSavedPage();
    }
    resolve(cached);
    return;
  }
  if (realResponse) {
    // Nothing saved, and this answer failed the "is it our file?"
    // check. It might be a 404 or a Wi-Fi login page. Hand that real
    // answer back. Do not slice it into a 206. Safari asks for sounds
    // in pieces (a Range header). A slice of an error page would look
    // like a broken sound instead of the real error. Do not let the
    // browser keep this answer for a later offline load.
    resolve(liveCopy(realResponse));
    return;
  }
  reject(new Error("offline"));
}

// The site's answer, with no-cache so the browser asks us again next
// time. Otherwise an offline reload can reuse a newer file under the
// older page.
function liveCopy(response) {
  var headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-cache");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

function askNetwork(request) {
  return new Promise(function (resolve, reject) {
    var finished = false;
    var timer = setTimeout(function () {
      fromCache(request).then(function (cached) {
        // No saved copy yet. Leave this open so the real answer can land.
        if (finished || !cached) {
          return;
        }
        finished = true;
        settleFromCache(request, cached, resolve, reject, null);
      });
    }, NETWORK_WAIT_MS);

    fetch(freshRequest(request)).then(function (response) {
      return isOurFile(request, response).then(function (ok) {
        return { ok: ok, response: response };
      });
    }).then(function (result) {
      var response = result.response;
      if (!result.ok) {
        if (finished) {
          return;
        }
        return fromCache(request).then(function (cached) {
          if (finished) {
            return;
          }
          finished = true;
          clearTimeout(timer);
          settleFromCache(request, cached, resolve, reject, response);
        });
      }
      // The page already came from the snapshot. Drop this later
      // page. Saving it would mix a new page with the old files.
      if (finished && isPageLoad(request)) {
        return;
      }
      noteLiveFile();
      if (finished) {
        // A file already came from the snapshot. Do not save this
        // later answer into the release cache.
        return;
      }
      finished = true;
      clearTimeout(timer);
      resolve(request.headers.has("range") ? sliceRange(request, response) : liveCopy(response));
    }).catch(function () {
      if (finished) {
        return;
      }
      fromCache(request).then(function (cached) {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        settleFromCache(request, cached, resolve, reject, null);
      }, function () {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        settleFromCache(request, null, resolve, reject, null);
      });
    });
  });
}

// Ask for a new copy, not one the browser saved earlier.
function freshRequest(request) {
  if (request.headers.has("range") || isPageLoad(request)) {
    return new Request(request.url, { cache: "reload" });
  }
  try {
    return new Request(request, { cache: "reload" });
  } catch (err) {
    return new Request(request.url, { cache: "reload" });
  }
}

// Saved copy. A page load with a ?query uses the saved page.
function fromCache(request) {
  return caches.open(CACHE_NAME).then(function (cache) {
    var options = isPageLoad(request) ? { ignoreSearch: true } : {};
    return cache.match(request, options).then(function (cached) {
      if (cached) {
        return cachedRange(request, cached);
      }
      if (!isPageLoad(request)) {
        return null;
      }
      return cache.match("./").then(function (home) {
        if (home) {
          return home;
        }
        return cache.match("index.html").then(function (page) {
          return page || null;
        });
      });
    });
  });
}

function cachedRange(request, cached) {
  if (request.headers.has("range")) {
    return sliceRange(request, cached);
  }
  return cached;
}

