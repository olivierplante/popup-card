# Popup Card

A lightweight popup overlay for Home Assistant Lovelace dashboards. Renders any HA Lovelace card inside a modal popup — no browser_mod required.

## Features

- Render any HA Lovelace card in a popup (entities, markdown, apexcharts, vertical-stack, etc.)
- Mobile full-screen mode with swipe-down-to-close
- Close via backdrop click, X button, or Escape key
- Theme-compatible using HA CSS variables
- Works on desktop, tablets, and the Companion App (iOS/Android)
- No external dependencies, no browser registration

## Installation

### HACS (recommended)

1. Open HACS in your Home Assistant instance
2. Click the three dots menu (top right) → **Custom repositories**
3. Add the repository URL and select **Integration** as the category
4. Click **Download**, then find **Popup Card** in the list
5. Restart Home Assistant

### Manual

Copy the `popup_card` folder to `config/custom_components/` and add to `configuration.yaml`:

```yaml
popup_card:
```

Restart Home Assistant. The component auto-registers as a Lovelace resource.

## Usage

### From YAML (tap action)

Use `action: fire-dom-event` with a `popup_card` key on any card that supports `tap_action`:

```yaml
type: custom:button-card
entity: sensor.temperature
tap_action:
  action: fire-dom-event
  popup_card:
    title: Temperature History
    content:
      type: custom:apexcharts-card
      graph_span: 24h
      series:
        - entity: sensor.temperature
```

### From JavaScript (dynamic popups)

Dispatch an `ll-custom` event with `popup_card` in the detail:

```javascript
const event = new CustomEvent('ll-custom', {
  bubbles: true,
  composed: true,
  detail: {
    popup_card: {
      title: 'My Popup',
      content: {
        type: 'markdown',
        content: '**Hello** from a popup!'
      }
    }
  }
});
this.dispatchEvent(event);
```

### Configuration

| Key | Required | Description |
|-----|----------|-------------|
| `title` | No | Popup title displayed in the header |
| `content` | Yes | HA Lovelace card configuration (any valid card type) |

### Supported card types

Any card that works in a Lovelace dashboard works in the popup:

- `type: entities` — entity list
- `type: markdown` — markdown with Jinja2 templates
- `type: custom:apexcharts-card` — charts and graphs
- `type: vertical-stack` — stack multiple cards
- `type: history-graph` — history graphs
- Any custom card installed via HACS

## Mobile behavior

On screens narrower than 768px:
- Popup expands to full screen (no border radius, full width/height)
- Swipe down to close (80px threshold with drag animation)

## Theming

The popup uses HA theme variables by default. The dialog background uses `var(--ha-card-background)` and text uses `var(--primary-text-color)`.

## How it works

The component loads a JavaScript module that attaches a global listener on `document.body` for `ll-custom` events. When an event contains a `popup_card` key, it:

1. Creates a `position: fixed` overlay appended to `document.body`
2. Uses `window.loadCardHelpers()` to instantiate the HA card from the config
3. Passes the `hass` object to the card and keeps it updated
4. Cleans up the card element on close to prevent memory leaks

The `ll-custom` event is a standard Home Assistant core event dispatched by the frontend when a card uses `action: fire-dom-event`. No additional integrations are needed.
