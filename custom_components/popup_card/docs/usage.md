# Usage

[← Back to README](../README.md)

## From YAML (tap action)

Use `action: fire-dom-event` with a `popup_card` key on any card that supports `tap_action`:

```yaml
type: custom:button-card
entity: sensor.temperature
tap_action:
  action: fire-dom-event
  popup_card:
    title: Temperature history
    content:
      type: custom:apexcharts-card
      graph_span: 24h
      series:
        - entity: sensor.temperature
```

## Auto-close and styling

Add `auto_close` (seconds) and any of the style keys alongside `title`/`content`:

```yaml
type: custom:button-card
entity: light.living_room
tap_action:
  action: fire-dom-event
  popup_card:
    title: Living room
    auto_close: 8
    background: "rgba(20, 20, 40, 0.85)"
    backdrop_blur: "8px"
    content:
      type: entities
      entities:
        - light.living_room
```

See [Configuration](configuration.md#styling-the-popup-frame) for the full key
list and the raw-CSS `style` escape hatch.

## Using card_mod

`card_mod` styles a card's `ha-card` element. The popup **frame** (dialog,
backdrop, header) is not an `ha-card`, so `card_mod` can't style the frame — use
the [style keys or `style`](configuration.md#styling-the-popup-frame) for that.

However, `card_mod` works normally on the **content card** inside the popup,
because that is a real Lovelace card:

```yaml
popup_card:
  title: Lights
  content:
    type: entities
    entities:
      - light.living_room
    card_mod:
      style: |
        ha-card {
          background: rebeccapurple;
        }
```

## From JavaScript (dynamic popups)

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

## Supported card types

Any card that works in a Lovelace dashboard works in the popup:

- `type: entities`: entity list
- `type: markdown`: markdown with Jinja2 templates
- `type: custom:apexcharts-card`: charts and graphs
- `type: vertical-stack`: stack multiple cards
- `type: history-graph`: history graphs
- Any custom card installed via HACS
