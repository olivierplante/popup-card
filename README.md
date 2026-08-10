# Popup Card

A lightweight popup overlay for Home Assistant Lovelace dashboards. Render any HA card inside a modal. No browser_mod required.

[![HACS Default](https://img.shields.io/badge/HACS-Default-41BDF5.svg)](https://github.com/hacs/integration)
[![GitHub Release](https://img.shields.io/github/v/release/olivierplante/popup-card)](https://github.com/olivierplante/popup-card/releases)

## What you get

- Render any HA Lovelace card in a popup (entities, markdown, apexcharts, vertical-stack, etc.)
- Auto-close timer with an optional subtle countdown bar (`auto_close: 8`, `auto_close_progress: false` to hide the bar)
- Sticky header that stays put while the content scrolls (`sticky_header: true`)
- Centered or bottom sheet presentation (`presentation: sheet`), close button on either side (`close_position: left`)
- Style the popup frame with config keys, raw CSS via `style`, or `--popup-card-*` variables set once in your theme
- Mobile full-screen mode with swipe-down-to-close
- Close via backdrop click, X button, Escape, swipe, or the back button
- Renders in the browser's top layer, so themes and layouts using transforms cannot clip it
- Theme-compatible using HA CSS variables
- Works on desktop, tablets, and the Companion App (iOS/Android)
- No external dependencies, no browser_mod

## Install

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=olivierplante&repository=popup-card&category=integration)

1. Click the badge above (or search "Popup Card" in HACS) and download the integration
2. Restart Home Assistant
3. Settings → Devices & Services → Add Integration → "Popup Card"
4. Click Submit. There's nothing to configure.

The Lovelace resource auto-registers, so the popup is available immediately.

## Quick usage

Use `action: fire-dom-event` with a `popup_card` key on any card that supports `tap_action`:

```yaml
type: custom:button-card
entity: sensor.temperature
tap_action:
  action: fire-dom-event
  popup_card:
    title: Temperature history
    auto_close: 10            # optional — close after 10s
    backdrop_blur: "8px"      # optional — frosted-glass backdrop
    content:
      type: custom:apexcharts-card
      graph_span: 24h
      series:
        - entity: sensor.temperature
```

See [Configuration](https://github.com/olivierplante/popup-card/blob/main/docs/configuration.md) for the auto-close timer and all styling options.

## Docs

- [Usage](https://github.com/olivierplante/popup-card/blob/main/docs/usage.md): YAML and JavaScript trigger patterns, supported card types
- [Configuration](https://github.com/olivierplante/popup-card/blob/main/docs/configuration.md): popup options, mobile behavior, theming, internals

## Support

[Report an issue](https://github.com/olivierplante/popup-card/issues) · [MIT License](https://github.com/olivierplante/popup-card/blob/main/LICENSE)
