# Changelog

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
