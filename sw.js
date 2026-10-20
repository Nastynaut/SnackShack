// ============================================================
// OFFLINE COPY
// ============================================================
// The iPad saves these files the first time Snack Shack is opened
// online. After that, the home-screen app works with Wi-Fi off.
//
// Paths are relative (no leading slash) so the same file works at
// the root of a site or in a folder such as /SnackShack/.

// bump this when you change any file
var CACHE_VERSION = "snack-shack-1";

// Everything the page needs in order to run. cache.addAll stops
// the whole save if any ONE of these is missing, so keep this list
// to files that are really in the project.
var APP_FILES = [
  "./",
  "index.html",
  "app.js",
  "menu.js",
  "styles.css",
  "manifest.webmanifest",
  "assets/tokens.css",
  "assets/buttons.css",
  "assets/LICENSES.md",
  "assets/STYLE.md",
  "assets/fonts/fonts.css",
  "assets/fonts/OFL.txt",
  "assets/fonts/OFL-Fredoka.txt",
  "assets/fonts/OFL-Nunito.txt",
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

self.addEventListener("install", function (event) {
  // Start using this version as soon as the files are saved,
  // instead of waiting for every old tab to close.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_FILES);
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      var jobs = [];
      for (var i = 0; i < names.length; i++) {
        // Drop copies from an older CACHE_VERSION.
        if (names[i] !== CACHE_VERSION) {
          jobs.push(caches.delete(names[i]));
        }
      }
      return Promise.all(jobs);
    }).then(function () {
      // Control the page that just registered us, so one online
      // visit is enough before airplane mode.
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

  // Leave sw.js itself to the browser, so a new CACHE_VERSION
  // can be noticed on the next visit.
  if (url.pathname === self.location.pathname) {
    return;
  }

  event.respondWith(loadSaved(request));
});

// Saved copy first. A Range request (sounds) is matched without the
// Range header, because we stored the whole file.
function loadSaved(request) {
  return caches.match(request).then(function (cached) {
    if (cached) {
      return answer(request, cached);
    }
    if (request.headers.has("range")) {
      return caches.match(request.url).then(function (full) {
        if (full) {
          return sliceRange(request, full);
        }
        return fetchOwn(request);
      });
    }
    return fetchOwn(request);
  });
}

function answer(request, cached) {
  if (request.headers.has("range")) {
    return sliceRange(request, cached);
  }
  return cached;
}

// Not saved yet. Load the whole file from this same site, then keep
// a copy. A sound request asks for a byte range; we still download
// the whole mp3 so the next play can be sliced from the saved copy.
function fetchOwn(request) {
  var wantsRange = request.headers.has("range");
  var fullRequest = wantsRange ? new Request(request.url) : request;
  return fetch(fullRequest).then(function (response) {
    if (!response || response.status !== 200) {
      return response;
    }
    var copy = response.clone();
    caches.open(CACHE_VERSION).then(function (cache) {
      cache.put(fullRequest, copy);
    });
    if (wantsRange) {
      return sliceRange(request, response);
    }
    return response;
  }).catch(function () {
    return new Response("", {
      status: 504,
      statusText: "Offline and not saved"
    });
  });
}
