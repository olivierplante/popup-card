# Configuration

[← Back to README](../README.md)

## Popup options

| Key | Required | Description |
|---|---|---|
| `title` | No | Popup title displayed in the header |
| `content` | Yes | HA Lovelace card configuration (any valid card type) |
| `auto_close` | No | Seconds before the popup closes itself. Omit, `0`, or a negative value means it never auto-closes (default). |
| `auto_close_progress` | No | Show the countdown bar while `auto_close` runs. Defaults to `true`; set `false` to close silently with no bar. |

## Auto-close timer

Set `auto_close` to a number of seconds to have the popup dismiss itself:

```yaml
popup_card:
  title: Saved
  auto_close: 5
  content:
    type: markdown
    content: Your settings were saved.
```

When `auto_close` is set, a very subtle 2px bar at the top edge of the dialog
drains over the duration as a countdown hint. Closing the popup manually (X
button, backdrop, Escape, or swipe) cancels the timer.

> **Note:** combining the countdown bar with `backdrop_blur` can make the bar
> drain a little choppily — animating over a live `backdrop-filter` is a known
> browser limitation. If you use `backdrop_blur` and want a smooth close, set
> `auto_close_progress: false` to hide the bar.

To auto-close without the bar, set `auto_close_progress: false` — the timer
still runs, it just closes silently:

```yaml
popup_card:
  auto_close: 5
  auto_close_progress: false
  content:
    type: markdown
    content: Closes in 5 seconds, no countdown bar.
```

## Styling the popup frame

The popup frame (dialog box, backdrop, header) is built from plain `<div>`s in
the light DOM — it is **not** an `ha-card`, so `card_mod` cannot target it (see
[card_mod note in Usage](usage.md#using-card_mod)). Use these keys instead.

### Discrete style keys

All optional. Each overrides the corresponding default:

| Key | Applies to | Default |
|---|---|---|
| `background` | Dialog background (color, rgba, or gradient) | `var(--ha-card-background, rgba(30,30,30,.95))` |
| `backdrop` | Backdrop color behind the dialog | `rgba(0,0,0,.8)` |
| `backdrop_blur` | Frosted-glass blur on the backdrop (any CSS length, e.g. `8px`) | none |
| `border_radius` | Dialog corner radius | `16px` |
| `border` | Dialog border | `1px solid rgba(255,255,255,.08)` |
| `title_color` | Header title text color | `var(--primary-text-color, #fff)` |

```yaml
popup_card:
  title: Lights
  background: "rgba(20, 20, 40, 0.85)"
  backdrop: "rgba(0, 0, 0, 0.6)"
  backdrop_blur: "8px"
  border_radius: "24px"
  title_color: "#ffffff"
  content:
    type: entities
    entities:
      - light.living_room
```

### Raw CSS (`style`)

For anything the discrete keys don't cover, pass a raw CSS string in `style`.
Selectors are automatically scoped to this popup, so styles never leak to other
popups. **Raw `style` always wins over the discrete keys** — think of the keys
as friendly shortcuts and `style` as the source of truth.

```yaml
popup_card:
  title: Fancy
  background: "black"          # overridden by the style block below
  style: |
    .popup-card-dialog {
      background: linear-gradient(135deg, #1e1e2e, #313244);
      box-shadow: 0 0 40px rgba(139, 92, 246, 0.5);
    }
    .popup-card-backdrop {
      background: rgba(10, 0, 30, 0.7);
    }
  content:
    type: markdown
    content: "**Styled** popup"
```

Available class names for `style`:

| Class | Element |
|---|---|
| `.popup-card-overlay` | Fullscreen flex container |
| `.popup-card-backdrop` | Dimming layer behind the dialog |
| `.popup-card-dialog` | The dialog box |
| `.popup-card-header` | Header row (title + close button) |
| `.popup-card-title` | Title text |
| `.popup-card-close` | Close (✕) button |
| `.popup-card-content` | Where your content card renders |
| `.popup-card-progress` | Auto-close countdown bar (only present when `auto_close` is set) |

**Precedence:** base defaults < discrete keys < `style`. All rules are emitted
at equal specificity in that order, so later rules win.

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
4. Injects a per-popup scoped stylesheet (from the style keys + `style`) and a unique class on the overlay so styles can't leak between popups
5. Cleans up the card element, the scoped stylesheet, and any `auto_close` timer on close to prevent leaks

The `ll-custom` event is a standard Home Assistant frontend event dispatched when a card uses `action: fire-dom-event`. No additional integrations are needed.
