# Snack Shack — Style

Kids' pretend-play snack shack for tablets (screens: food menu, order ticket, order summary).
Bright, friendly, chunky outlines, big tap targets, very readable. Tokens live in `assets/tokens.css`; button styles in `assets/buttons.css` (load tokens first).

## Palette
| Token | Hex |
|---|---|
| `--color-primary` | `#FF7A45` |
| `--color-primary-ink` | `#B23C0C` |
| `--color-secondary` | `#3DB8F5` |
| `--color-secondary-ink` | `#0B6694` |
| `--color-accent` | `#FFD23F` |
| `--color-success` | `#3FBF5F` |
| `--color-success-ink` | `#1D7A36` |
| `--color-warning` | `#FFB020` |
| `--color-danger` | `#F2545B` |
| `--color-danger-ink` | `#B3202A` |
| `--color-background` | `#FFF8EC` |
| `--color-surface` | `#FFFFFF` |
| `--color-surface-alt` | `#FFF0D6` |
| `--color-text` | `#2B1D3A` |
| `--color-text-muted` | `#5E4F6E` |
| `--color-text-on-color` | `#2B1D3A` |
| `--color-outline` | `#2B1D3A` |
| `--color-focus-ring` | `#7C4DFF` |
| `--color-disabled-bg` | `#E6E1EA` |
| `--color-disabled-text` | `#5C5266` |
| `--color-mains` | `#FF7A45` |
| `--color-sides` | `#FFC93C` |
| `--color-drinks` | `#3DB8F5` |
| `--color-desserts` | `#FF8FC0` |

Use dark ink `#2B1D3A` for **all** text, including on bright buttons (never white text on the bright fills). Use `*-ink` variants for colored text on cream/white.
Menu category colors: mains `#FF7A45`, sides `#FFC93C`, drinks `#3DB8F5`, desserts `#FF8FC0`.

Contrast (WCAG AA, computed):
| Pair | Ratio | AA |
|---|---|---|
| `#2B1D3A` on `#FFF8EC` (text / background) | 14.85:1 | PASS |
| `#2B1D3A` on `#FFFFFF` (text / surface) | 15.68:1 | PASS |
| `#2B1D3A` on `#FFF0D6` (text / surface-alt) | 13.95:1 | PASS |
| `#5E4F6E` on `#FFF8EC` (text-muted / background) | 7.05:1 | PASS |
| `#5E4F6E` on `#FFFFFF` (text-muted / surface) | 7.45:1 | PASS |
| `#5E4F6E` on `#FFF0D6` (text-muted / surface-alt) | 6.63:1 | PASS |
| `#B23C0C` on `#FFF0D6` (primary-ink / surface-alt) | 5.27:1 | PASS |
| `#0B6694` on `#FFF0D6` (secondary-ink / surface-alt) | 5.59:1 | PASS |
| `#1D7A36` on `#FFF0D6` (success-ink / surface-alt) | 4.80:1 | PASS |
| `#B3202A` on `#FFF0D6` (danger-ink / surface-alt) | 5.92:1 | PASS |
| `#5C5266` on `#FFF0D6` (disabled-text / surface-alt) | 6.55:1 | PASS |
| `#2B1D3A` on `#FF7A45` (text-on-color / primary) | 6.06:1 | PASS |
| `#2B1D3A` on `#3DB8F5` (text-on-color / secondary) | 7.0:1 | PASS |
| `#2B1D3A` on `#FFD23F` (text-on-color / accent) | 10.86:1 | PASS |
| `#2B1D3A` on `#3FBF5F` (text-on-color / success) | 6.59:1 | PASS |
| `#2B1D3A` on `#FFB020` (text-on-color / warning) | 8.57:1 | PASS |
| `#2B1D3A` on `#F2545B` (text-on-color / danger) | 4.62:1 | PASS |
| `#2B1D3A` on `#FF7A45` (text-on-color / mains) | 6.06:1 | PASS |
| `#2B1D3A` on `#FFC93C` (text-on-color / sides) | 10.21:1 | PASS |
| `#2B1D3A` on `#3DB8F5` (text-on-color / drinks) | 7.0:1 | PASS |
| `#2B1D3A` on `#FF8FC0` (text-on-color / desserts) | 7.42:1 | PASS |
| `#5C5266` on `#E6E1EA` (disabled-text / disabled-bg) | 5.72:1 | PASS |

## Fonts (self-hosted, SIL OFL 1.1)
- Headings, buttons, prices: **Fredoka** 600/700. Body: **Nunito** 400–800.
- Fonts are self-hosted in `assets/fonts/`. The app makes no network calls for fonts.
- Weights included: Fredoka 400–700 and Nunito 400/600/700/800 (latin subset).
- Load them by linking `assets/tokens.css`, which imports `fonts/fonts.css`, or by linking `assets/fonts/fonts.css` directly:
```html
<link rel="stylesheet" href="assets/tokens.css">
```
- Type scale: 56 (screen title) · 40 (section / total) · 32 (ticket item, checkout, qty) · 24 (buttons, menu names) · 20 (body minimum) · 18/16 (captions only). Line height 1.15 headings, 1.4 body.

## Spacing & shape
- Spacing scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 px (`--space-1`…`--space-8`).
- Radii: 12 / 20 / 28 / pill. Borders 4px `#2B1D3A`. Chunky shadow `0 6px 0 #2B1D3A`.

## Buttons
- Big and rounded (pill), 4px dark outline, chunky shadow; on press move down 4px and shadow shrinks to 2px.
- **Min 64×64px touch targets** (`--size-tap-min`), ≥16px between targets; checkout button min 88px tall, full width up to 480px.
- Variants: `.btn--primary` (orange), `.btn--secondary` (white: Back/Home), `.btn--add` (green + icon), `.btn--remove` (red − icon), `.btn--checkout` (big yellow), `.btn--icon` (round 64px, needs `aria-label`), `:disabled` (grey, dashed).
- 5px purple `#7C4DFF` `:focus-visible` ring; respect `prefers-reduced-motion`.

## Food icons (`assets/food/*.svg`)
burger, cheeseburger, hot-dog, fries, chicken-nuggets, pizza-slice, soda, lemonade, milkshake, water, ice-cream-cone, cookie.
All viewBox `0 0 128 128`, 6px rounded `#2B1D3A` outline, flat fills, smiley faces. Show at 96–128px on the menu, 64–72px on the ticket; never below 48px. Use `<img src="assets/food/burger.svg" alt="Burger">` style (`alt=""` if a visible label is next to it).

## Sounds (`assets/sounds/`)
- `add.mp3` – soft ding when an item is added. `checkout.mp3` – cha-ching when the order is placed.
- Play at volume 0.6, only after a tap, reset `currentTime = 0` before replay; provide a visible mute toggle (persist in `localStorage`) and skip playback when muted.
- Regenerate with `python3 make_sounds.py` (numpy + ffmpeg).

## Accessibility
Text ≥ 4.5:1; real `<button>`s; icon-only buttons get `aria-label`s; don't rely on color alone (pair colors with words + icons); announce ticket changes with `aria-live="polite"`; sounds are optional and never carry essential info.

## App icon
iPad home-screen icon. The source is `assets/icons/app-icon.svg` (512 viewBox, full-bleed cream `#FFF8EC`). Raster files:

- `assets/icons/apple-touch-icon-180.png` — 180×180. iOS needs a non-transparent apple-touch icon, so this PNG is flattened RGB with no alpha channel.
- `assets/icons/icon-192.png` — 192×192, opaque RGB.
- `assets/icons/icon-512.png` — 512×512, opaque RGB.

Suggested HTML only:

```html
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon-180.png">
```
