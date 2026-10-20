# Snack Shack

Snack Shack is a pretend-play register for kids. One child runs the register. Another child orders snacks. Nothing is charged, and nothing is sent over the internet.

## Open it

The iPad needs Snack Shack at a **web address**. Do not hand the tablet a folder of files. There is no build step.

The app is already on the web at:

**https://merry-kelpie-d061db.netlify.app/**

It is laid out for a tablet held sideways (landscape), around 1024×768 or 1280×800.

### Add it to the iPad home screen

1. On the iPad, open **Safari**.
2. Go to **https://merry-kelpie-d061db.netlify.app/**
3. Tap the **Share** button (the square with an arrow pointing up).
4. Tap **Add to Home Screen**.
5. The name is **Snack Shack**. Tap **Add**.
6. Open **Snack Shack** from the home screen **once while the iPad is online**.

After that one online open, turn on airplane mode. The app still opens full screen, held sideways, and the whole order works. Adding a snack and tapping **Done** still play their sounds. The home-screen picture is the Snack Shack icon already in this project.

### Your own copy (optional)

GitHub Pages can host a copy too.

1. Put this project on GitHub. The repo can be named `SnackShack`. A free personal account needs the repo to be public.
2. Open the repo in a browser.
3. Click **Settings**.
4. In the left sidebar, click **Pages**.
5. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
6. Set **Branch** to **main** and the folder to **/ (root)**.
7. Click **Save**.
8. Wait about a minute, then refresh the Pages screen. GitHub shows the address at the top. It looks like `https://your-name.github.io/SnackShack/`.

Use that address the same way as the steps above.

### After you change a file

The home-screen app keeps the copy it already opened. To get an update, swipe the Snack Shack app closed, then open it again.

To lock orientation, use iPad Rotation Lock in Control Center.

`CACHE_VERSION` in `sw.js` is only a switch that wipes the saved copy. You do not need to change it for an ordinary edit. Change the name (for example from `snack-shack-1` to `snack-shack-2`) only when that saved copy is wrong and the iPad should forget it. If you added a new file the page needs, add its path to the `APP_FILES` list in that same file. Keep the path relative, with no slash at the start.

### Try it on your computer

A service worker does not run from a `file://` address, so double-clicking `index.html` is only a quick look at the register. To try the real app, including airplane mode, start a small local server in this folder:

```
python3 -m http.server 8000
```

Open `http://localhost:8000` in the browser. Stop the server with Ctrl+C when you are done.

## How to play

1. Pick a tab: **Food**, **Drinks**, or **Treats**.
2. Tap a snack. It lands on the ticket on the right.
3. Use **+** and **−** to change how many. At 0, that snack leaves the ticket.
4. Tap **Done** to see every item, how many, the line price, and the total.
5. **Edit Order** goes back to the menu and keeps the ticket.
6. **New Order** clears the ticket and starts over.

**Sound on / Sound off** sits in the top corner. Adding a snack plays a short ding, and **Done** plays a checkout sound, once those recordings are in the folder. The choice is saved on this device only.

## Change the menu

All snacks, categories, and prices live in one file: [`menu.js`](menu.js).

Open `menu.js` in any text editor. Each snack has a `name`, a `price`, an `emoji`, and an `image` filename. Save the file and refresh the browser.

Prices have to be whole dollars: `3`, not `3.50` and not `"3"`. The app multiplies those integers, so the total does not pick up rounding errors.

To move a snack to another tab, cut its `{ ... }` block into that category's `items` list. Milkshake starts under Drinks.

## How pictures, sounds, and styles swap in

Nothing here has to change when the design files arrive. Drop them in the folder and refresh. If a file is missing, the page keeps working offline with no internet requests.

### Pictures

Until a drawing exists, each button shows its emoji.

Every snack in `menu.js` already names an SVG with hyphens, for example `assets/food/burger.svg`. The page asks for that file. If it loads, the SVG replaces the emoji. If it is missing, the image errors and the emoji stays. Drinks and treats use `assets/food/` too, which is the folder the drawings use.

| Snack | File |
| --- | --- |
| Burger | `assets/food/burger.svg` |
| Cheeseburger | `assets/food/cheeseburger.svg` |
| Hot Dog | `assets/food/hot-dog.svg` |
| Fries | `assets/food/fries.svg` |
| Chicken Nuggets | `assets/food/chicken-nuggets.svg` |
| Pizza Slice | `assets/food/pizza-slice.svg` |
| Soda | `assets/food/soda.svg` |
| Lemonade | `assets/food/lemonade.svg` |
| Milkshake | `assets/food/milkshake.svg` |
| Water | `assets/food/water.svg` |
| Ice Cream Cone | `assets/food/ice-cream-cone.svg` |
| Cookie | `assets/food/cookie.svg` |

To point a snack at a different file, change its `image` line in `menu.js`.

### Sounds

- `assets/sounds/add.mp3` plays when a snack is added (a menu tap or **+**).
- `assets/sounds/checkout.mp3` plays when **Done** is tapped.

If either file is missing, that sound stays silent. **−** does not play a sound. **Sound off** skips both.

### Colors, buttons, and fonts

`index.html` links two optional stylesheets after `styles.css`:

- `assets/tokens.css` — the palette. `styles.css` already uses those color names with its own fallbacks, so the cream, orange, yellow, and ink update on their own when the file is present.
- `assets/buttons.css` — extra styles for the **+**, **−**, **Done**, **Edit Order**, **New Order**, and sound buttons.

The app does not need either file. A note in the browser console that they failed to load is expected until they are added.

Fonts stay on the device. `assets/tokens.css` imports `assets/fonts/fonts.css`, which points at the Fredoka and Nunito files in that folder. `index.html` does not link that font file a second time. Nothing is downloaded from the internet. If those files are missing, the browser uses its own fonts instead.

## Files

- `index.html` — the page
- `styles.css` — colors, sizes, and layout (works on its own)
- `menu.js` — the snacks and prices
- `app.js` — what happens when you tap
- `manifest.webmanifest` — the home-screen name, colors, and icon paths
- `sw.js` — the offline copy. Swipe the home-screen app closed and open it again to pick up a change.
