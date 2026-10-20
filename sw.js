// ============================================================
// OFFLINE COPY
// ============================================================
// The iPad saves these files the first time Snack Shack is opened
// online. After that, the home-screen app works with Wi-Fi off.
//
// While the iPad is online, we ask the site for a fresh copy and
// keep that copy. If the site is slow or off, we use the saved one.
//
// Paths are relative (no leading slash) so the same file works at
// the root of a site or in a folder such as /SnackShack/.

// The number on this saved copy. Each number gets its own cache,
// named snack-shack-1, snack-shack-2, and so on. An open tab keeps
// reading the copy it already has until the app is closed.
// Change the number only when that old copy should be forgotten.
var CACHE_VERSION = "1";
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

// Only files the page needs while it runs. cache.addAll stops the
// whole save if any ONE of these is missing, so notes and license
// text stay out of this list.
var APP_FILES = [
  "./",
  "index.html",
  "app.js",
  "menu.js",
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

// Every saved file has to be present. If one is missing, throw away
// this release's cache so a later visit does not keep a half copy.
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

// Move the side cache into this release's cache, then drop the side cache.
function publishRelease(staging) {
  return caches.open(CACHE_NAME).then(function (live) {
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
    });
  }).then(function () {
    return caches.delete(INSTALL_CACHE);
  });
}

// A failed save must not leave a half copy. A complete copy that an
// open tab is already using stays where it is.
function discardFailedInstall() {
  return caches.delete(INSTALL_CACHE).then(function () {
    return caches.open(CACHE_NAME).then(function (live) {
      var checks = [];
      for (var i = 0; i < APP_FILES.length; i++) {
        checks.push(confirmSaved(live, APP_FILES[i]));
      }
      return Promise.all(checks).catch(function () {
        return caches.delete(CACHE_NAME);
      });
    });
  });
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

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      var jobs = [];
      for (var i = 0; i < names.length; i++) {
        // Only our own old copies. Another app on this site keeps its cache.
        // This worker reads CACHE_NAME and leaves that one in place.
        var name = names[i];
        if (name.indexOf("snack-shack-") === 0 && name !== CACHE_NAME) {
          jobs.push(caches.delete(name));
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

// The address we saved the page under, without a ?query.
function pageKey(request) {
  var url = new URL(request.url);
  url.search = "";
  return url.toString();
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

// Ask the site first. If it answers with our real file, keep that
// copy in this worker's own cache. If it is quiet for about 3
// seconds, sends a login page, or cannot be reached, use the saved
// copy. If nothing is saved, hand back the site's real answer.
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

function askNetwork(request) {
  return new Promise(function (resolve, reject) {
    var finished = false;
    var timer = setTimeout(function () {
      fromCache(request).then(function (cached) {
        if (finished || !cached) {
          return;
        }
        finished = true;
        if (isPageLoad(request)) {
          noteSavedPage();
        }
        resolve(cached);
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
          if (cached) {
            if (isPageLoad(request)) {
              noteSavedPage();
            }
            resolve(cached);
            return;
          }
          resolve(response);
        });
      }
      // The page already came from the saved copy. Drop this later
      // page. Saving it would mix a new page with the old files.
      if (finished && isPageLoad(request)) {
        return;
      }
      noteLiveFile();
      if (finished) {
        remember(request, response.clone());
        return;
      }
      finished = true;
      clearTimeout(timer);
      var saved = response.clone();
      var send = request.headers.has("range") ? sliceRange(request, response) : response;
      remember(request, saved).then(function () {
        resolve(send);
      }, function () {
        resolve(send);
      });
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
        if (cached) {
          if (isPageLoad(request)) {
            noteSavedPage();
          }
          resolve(cached);
          return;
        }
        reject(new Error("offline"));
      }, function () {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        reject(new Error("offline"));
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

function remember(request, response) {
  var key = isPageLoad(request) ? pageKey(request) : request.url;
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.put(key, response);
  });
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

