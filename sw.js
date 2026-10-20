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

// Changing this name throws away the saved copy.
// It is only a switch that wipes the cache.
var CACHE_VERSION = "snack-shack-1";

// How long we wait for the site before using the saved copy.
var NETWORK_WAIT_MS = 3000;

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

// Save one file, skipping the browser's old copy so install stores
// what the site has right now.
function saveOne(cache, path) {
  var request = new Request(path, { cache: "reload" });
  return fetch(request).then(function (response) {
    if (!response || response.status !== 200) {
      throw new Error(path);
    }
    return cache.put(request, response);
  });
}

self.addEventListener("install", function (event) {
  // Do not call skipWaiting. A new copy waits until the home-screen
  // app is swiped closed and opened again. Reloading now would wipe
  // the ticket a child is still building.
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      var jobs = [];
      for (var i = 0; i < APP_FILES.length; i++) {
        jobs.push(saveOne(cache, APP_FILES[i]));
      }
      return Promise.all(jobs);
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      var jobs = [];
      for (var i = 0; i < names.length; i++) {
        // Only our own old copies. Another app on this site keeps its cache.
        var name = names[i];
        if (name.indexOf("snack-shack-") === 0 && name !== CACHE_VERSION) {
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

  // The live site is on Netlify. Netlify adds its own script at
  // /.netlify/scripts/hud. That file is not part of Snack Shack.
  // Do not save it, and do not handle the request here, so a
  // problem with that script cannot stop install or airplane mode.
  // The browser loads it from the network on its own.
  if (url.pathname.indexOf("/.netlify/") !== -1) {
    return;
  }

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

// Ask the site first. If it answers, keep that copy. If it is quiet
// for about 3 seconds, or it cannot be reached, use the saved copy.
function networkFirst(request) {
  return new Promise(function (resolve) {
    var finished = false;
    var timer = setTimeout(function () {
      if (finished) {
        return;
      }
      finished = true;
      resolve(fromCache(request));
    }, NETWORK_WAIT_MS);

    fetch(freshRequest(request)).then(function (response) {
      // The wait already ended, so the page has the saved copy.
      // Still keep this answer for the next visit.
      if (finished) {
        if (response && response.status === 200) {
          remember(request, response.clone());
        }
        return;
      }
      finished = true;
      clearTimeout(timer);

      // Copy first. Slicing a sound uses up the original body.
      var saved = response && response.status === 200 ? response.clone() : null;
      var send = response;
      if (saved && request.headers.has("range")) {
        send = sliceRange(request, response);
      }
      if (!saved) {
        resolve(send);
        return;
      }
      // Finish saving before we hand the file back, so a later read
      // sees this copy and not the older one.
      remember(request, saved).then(function () {
        resolve(send);
      }, function () {
        resolve(send);
      });
    }).catch(function () {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      resolve(fromCache(request));
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
  return caches.open(CACHE_VERSION).then(function (cache) {
    return cache.put(key, response);
  });
}

// Saved copy. A page load with a ?query uses the saved page.
function fromCache(request) {
  return caches.open(CACHE_VERSION).then(function (cache) {
    var options = isPageLoad(request) ? { ignoreSearch: true } : {};
    return cache.match(request, options).then(function (cached) {
      if (cached) {
        return cachedRange(request, cached);
      }
      if (!isPageLoad(request)) {
        return offlineMiss();
      }
      return cache.match("./").then(function (home) {
        if (home) {
          return home;
        }
        return cache.match("index.html").then(function (page) {
          if (page) {
            return page;
          }
          return offlineMiss();
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

function offlineMiss() {
  return new Response("", {
    status: 504,
    statusText: "Offline and not saved"
  });
}
