# Tests

Playwright checks for the home-screen app: install, offline, and updates. Chromium and WebKit, at 1024×768, 1180×820, 768×1024, and 844×390, including `/SnackShack/`.

## Look at the app

From the repo root:

```
python3 -m http.server 8000
```

Open `http://localhost:8000`. Stop the server with Ctrl+C.

A service worker does not run from a `file://` address. Use the local server above.

## Run the checks

From this folder:

```
npm install
npx playwright install chromium webkit
node verify.mjs
```

`verify.mjs` copies the app to a temp folder and serves that copy. It does not edit the repo. Servers listen on `127.0.0.1:8765` and `127.0.0.1:8766`. The second one opens the app at `/SnackShack/`. You do not need the Python server for these checks.

Results are written to `tests/results/`. Set `SNACK_RESULTS_DIR` to write them somewhere else:

```
SNACK_RESULTS_DIR=/tmp/snack-results node verify.mjs
```

A failing check exits with status 1.
