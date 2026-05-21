# Configuration

[← Back to README](../README.md)

## Popup options

| Key | Required | Description |
|---|---|---|
| `title` | No | Popup title displayed in the header |
| `content` | Yes | HA Lovelace card configuration (any valid card type) |

## Mobile behavior

On screens narrower than 768px:

- Popup expands to full screen (no border radius, full width and height)
- Swipe down to close (80px threshold, with drag animation)

## Theming

The popup uses HA theme variables by default. The dialog background uses `var(--ha-card-background)` and text uses `var(--primary-text-color)`.

If your theme overrides these, the popup follows your theme without any extra configuration.

## How it works

The component loads a JavaScript module that attaches a global listener on `document.body` for `ll-custom` events. When an event contains a `popup_card` key, it:

1. Creates a `position: fixed` overlay appended to `document.body`
2. Uses `window.loadCardHelpers()` to instantiate the HA card from the config
3. Passes the `hass` object to the card and keeps it updated
4. Cleans up the card element on close to prevent memory leaks

The `ll-custom` event is a standard Home Assistant frontend event dispatched when a card uses `action: fire-dom-event`. No additional integrations are needed.
