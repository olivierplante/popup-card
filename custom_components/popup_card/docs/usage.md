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
