# Changelog

## 1.3.0

**Sticky header.** `sticky_header: true` keeps the title and close button in place while the content scrolls. The popup sizes to its content, up to 80% of the screen height, and goes full screen on phones.

**Bottom sheet.** `presentation: sheet` anchors the popup to the bottom edge with rounded top corners and rises into place. `centered` remains the default.

**Close button on either side.** `close_position: left` mirrors the header, matching Home Assistant's own dialogs.

**Back button closes the popup.** On phones, the back button and the back gesture now close the popup instead of leaving the dashboard.

**Style the frame from your theme.** Every surface reads a CSS variable, so setting them once in your theme applies to every popup. Per-popup keys and raw `style` still take precedence. The configuration docs list them all.

**The popup is now a real dialog.** It renders in the browser's top layer, so themes and layouts that use transforms can no longer clip it, and keyboard focus stays inside it. It also waits for its content to load before appearing, so cards that fetch data no longer make it jump.

**Fixes.** The close button was nearly invisible on light themes and now follows your text color. The dialog background falls back to your theme's card color, so popups no longer render dark on a light dashboard.

## 1.2.2

**Correct icons and state inside popups.** Cards that show an entity's icon or a relative time (for example event entities, or any sensor with a timestamp) now render correctly inside a popup. Previously they could show a generic fallback icon with the state line missing. The popup now renders in the same place Home Assistant renders its own dialogs, so cards resolve their data exactly as they do on the dashboard.

## 1.2.1

**Slimmer install.** The card's documentation is no longer duplicated inside the component folder that HACS installs into your Home Assistant config; it remains on the repository root where the README links to it. The public repository now also runs the card's automated test suite on every pull request. No functional changes.

## 1.2.0

**Auto-close timer.** Popups can now dismiss themselves after a set time. Add `auto_close: 8` (seconds) to close the popup automatically; omit it (or use `0`) to keep the current click-to-close behavior. A very subtle progress bar drains across the top of the dialog as a countdown hint. To close silently instead, set `auto_close_progress: false`.

**Style the popup frame.** You can now style the popup's frame directly from the card config:

- `background`: dialog background color, transparency, or gradient
- `backdrop`: color and opacity of the dimmed area behind the dialog
- `backdrop_blur`: frosted-glass blur on the backdrop
- `border` and `border_radius`: dialog border and corner rounding
- `title_color`: header title color

For anything beyond these, a `style` key accepts raw CSS scoped to the popup, so it never leaks to other popups. Raw `style` always wins over the discrete keys, which override the defaults.

## 1.1.0

**Add and remove from the UI** — Popup Card now uses Home Assistant's config flow. Install from Settings > Devices & Services > Add Integration. The Lovelace resource is automatically cleaned up when you remove the integration, so uninstalls no longer leave a dangling `/popup_card/popup-card.js` 404 in the browser console.

**Automatic YAML migration** — Existing users with `popup_card:` in `configuration.yaml` are migrated automatically on first restart. Nothing breaks. The YAML line is no longer needed and can be removed at your convenience; a one-time deprecation warning in the logs will remind you.

**Documentation restructure** — The README is now scoped to what the card does and how to install it. Usage and configuration details moved to dedicated pages under `docs/`.

## 1.0.5

**CI** — Updated GitHub Actions to Node.js 24 (`actions/checkout@v6`).

## 1.0.4

Add MIT license.

## 1.0.3
- Add brand icon, issue tracker, IoT class, and validation workflows for HACS submission

## 1.0.2
- Add HACS and hassfest validation workflows

## 1.0.1
- Test release to verify CI/CD pipeline

## 1.0.0
- Initial release
- Render any HA Lovelace card in a popup overlay
- Mobile full-screen mode with swipe-down-to-close
- Close via backdrop click, X button, or Escape key
- Theme-compatible using HA CSS variables
- Works on desktop, tablets, and Companion App
