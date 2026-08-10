# Configuration

[← Back to README](../README.md)

## Popup options

| Key | Values | Default | What it does |
|---|---|---|---|
| `title` | text | none | Text shown in the header, beside the close button. Omit it for a header with only the close button. |
| `content` | card config | required | Any Lovelace card configuration. The card is built the same way your dashboard builds it, so any card type works, including custom ones. |
| `auto_close` | seconds | never | Closes the popup by itself after this many seconds. `0`, a negative value, or omitting the key means it stays open until dismissed. Any manual close cancels the timer. |
| `auto_close_progress` | `true` / `false` | `true` | Whether the thin countdown bar drains across the top of the dialog while `auto_close` runs. Set `false` to keep the timer but hide the bar. No effect without `auto_close`. |
| `sticky_header` | `true` / `false` | `false` | Keeps the title and close button in place and scrolls only the content. Also changes how the popup is sized: it hugs its content up to `--popup-card-max-height`, and goes full screen on phones where cards that can fill their container will fill it. |
| `close_position` | `right` / `left` | `right` | Which side the close button sits on. `left` mirrors the header so the button leads and the title follows, the way Home Assistant lays out its own dialogs. |
| `presentation` | `centered` / `sheet` | `centered` | Where the popup sits. `centered` places it in the middle of the screen; `sheet` anchors it to the bottom edge with rounded top corners and rises into place. Unknown values fall back to `centered`. |
| `style` | CSS | none | Raw CSS applied to this popup only, for anything the keys above and the styling keys below do not cover. See [Raw CSS](#raw-css-style). |

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

## Layout options

### Sticky header

By default the whole dialog scrolls, so a long content card scrolls the title
and close button out of view. Set `sticky_header: true` to keep them in place
and scroll only the content:

```yaml
popup_card:
  title: History
  sticky_header: true
  content:
    type: logbook
    entities:
      - light.living_room
```

The popup sizes itself to its content and starts scrolling once it reaches
`--popup-card-max-height` (80vh by default). Below 768px it is full screen, and
cards that can fill their container (the logbook and history cards, for
example) fill it rather than stopping at their default height.

Swipe-to-close still works: a downward swipe only dismisses the popup when
everything under your finger is already at the top, so scrolling a list inside
the popup does not close it.

### Close button position

`close_position: left` mirrors the header so the close button leads and the
title follows, the way Home Assistant's own dialogs are laid out:

```yaml
popup_card:
  title: Living room
  close_position: left
  content:
    type: entities
    entities:
      - light.living_room
```

### Presentation

`presentation: sheet` anchors the popup to the bottom edge with rounded top
corners, instead of centering it in the viewport:

```yaml
popup_card:
  title: Quick controls
  presentation: sheet
  sticky_header: true
  content:
    type: entities
    entities:
      - light.living_room
      - switch.fan
```

The sheet keeps its shape at every width, including below 768px where a
centered popup would go full screen. It respects the device safe area at the
bottom.

The sheet rises into place as it appears. Set `--popup-card-sheet-rise` to
change that distance, or to `0` for no motion at all.

## Styling the popup frame

The popup frame is a `<dialog>` holding plain elements: backdrop, header and
content. It is **not** an `ha-card`, so `card_mod` cannot target it (see
[card_mod note in Usage](usage.md#using-card_mod)). Use these keys instead.

### Discrete style keys

All optional. Each overrides the corresponding default:

| Key | Applies to | Default |
|---|---|---|
| `background` | Dialog background (color, rgba, or gradient) | your theme's card background |
| `backdrop` | Backdrop color behind the dialog | `rgba(0,0,0,.8)` |
| `backdrop_blur` | Frosted-glass blur on the backdrop (any CSS length, e.g. `8px`) | none |
| `border_radius` | Dialog corner radius | `16px` |
| `border` | Dialog border | `1px solid rgba(255,255,255,.08)` |
| `title_color` | Header title text color | `var(--primary-text-color, #fff)` |

Each key sets the matching CSS variable from the table below on this popup
only.

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

### CSS variables

Every surface of the frame reads a CSS variable. Set one in a popup config
through the discrete keys above, or set it once in your Home Assistant theme
and every popup follows, including popups you did not write yourself.

| Variable | Default | What it does |
|---|---|---|
| `--popup-card-background` | `var(--ha-card-background, var(--card-background-color, rgba(30,30,30,.95)))` | Fill behind the header and content. Follows your theme's card color unless you override it. Accepts any background value, including gradients. |
| `--popup-card-backdrop` | `rgba(0,0,0,.8)` | Color of the dimmed area covering the page behind the popup. Lower the alpha for a lighter scrim. |
| `--popup-card-backdrop-filter` | `none` | Filter applied to whatever shows through the backdrop, most usefully `blur(8px)` for a frosted effect. Set by the `backdrop_blur` key. |
| `--popup-card-radius` | `16px` | Corner rounding of the dialog. A `sheet` popup applies it to the top corners only. |
| `--popup-card-border` | `1px solid rgba(255,255,255,.08)` | Border around the dialog. Set to `none` for a flat surface, which suits themes that use a shadow instead. |
| `--popup-card-shadow` | `none` | Drop shadow under the dialog. Home Assistant's own dialogs use a shadow rather than a border. |
| `--popup-card-width` | `90%` | Width the dialog aims for, as a share of the screen. The maximum below still caps it. |
| `--popup-card-max-width` | `500px`, `640px` for `sheet` | Upper bound on width, so the popup does not stretch across a wide screen. |
| `--popup-card-max-height` | `80vh`, `90vh` for `sheet` | Height at which the popup stops growing and its content starts scrolling. |
| `--popup-card-padding` | `16px 24px 24px` | Space around the content card, between it and the dialog edges. |
| `--popup-card-header-padding` | `20px 24px 0` | Space around the header row holding the title and close button. |
| `--popup-card-title-color` | `var(--primary-text-color, #fff)` | Title text color. Follows your theme by default. |
| `--popup-card-title-size` | `18px` | Title font size. Home Assistant's dialog titles are `20px`. |
| `--popup-card-title-weight` | `700` | Title font weight. Home Assistant's dialog titles use `500`. |
| `--popup-card-close-color` | `currentColor` | Close button color. Inheriting the text color keeps it visible on both light and dark surfaces. |
| `--popup-card-progress-color` | `currentColor` | Color of the `auto_close` countdown bar, drawn at 25% opacity. |
| `--popup-card-animation-duration` | `var(--ha-dialog-show-duration, 200ms)` | How long the popup takes to appear and disappear. Ignored when the system asks for reduced motion. |
| `--popup-card-sheet-rise` | `24px` | How far a `sheet` popup travels upward as it appears. Set `0` for no motion. |

To make every popup match Home Assistant's own dialogs, set the variables in
your theme:

```yaml
my_theme:
  popup-card-radius: 28px
  popup-card-max-width: 580px
  popup-card-backdrop: rgba(0, 0, 0, 0.25)
  popup-card-shadow: 0 6px 12px -3px rgba(0, 0, 0, 0.12), 0 16px 32px -6px rgba(0, 0, 0, 0.2)
  popup-card-border: none
  popup-card-title-size: 20px
  popup-card-title-weight: 500
```

Home Assistant themes declare variables without the leading `--`.

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
| `.popup-card-overlay` | Fullscreen flex container (a modal `<dialog>`) |
| `.popup-card-backdrop` | Dimming layer behind the dialog |
| `.popup-card-dialog` | The dialog box |
| `.popup-card-header` | Header row (title + close button) |
| `.popup-card-title` | Title text |
| `.popup-card-close` | Close (✕) button |
| `.popup-card-content` | Where your content card renders |
| `.popup-card-progress` | Auto-close countdown bar (only present when `auto_close` is set) |

Modifier classes are added when the matching option is used:

| Class | Added when |
|---|---|
| `.popup-card-sticky` | `sticky_header: true`, on the dialog |
| `.popup-card-sheet` | `presentation: sheet`, on the overlay |
| `.popup-card-close-left` | `close_position: left`, on the header |

The overlay also carries two state classes while it opens: `.popup-card-ready`
once the frame is mounted, and `.popup-card-settled` once the content has
stopped resizing and the popup is shown. Both are what the open animation
hangs off, so avoid redefining them in `style`.

**Precedence:** theme variables < discrete keys < `style`. Discrete keys are
set on the popup itself, so they beat a value inherited from your theme. Raw
`style` sets properties directly and is emitted last, so it beats both.

## How a popup behaves

**Closing.** A popup closes on a click outside it, the close button, the
Escape key, a downward swipe, the back button or back gesture, and the
`auto_close` timer if one is set. Whichever path is used, the popup tears down
completely: the content card, its scoped styles, the timer and the history
entry all go with it, so reopening starts clean.

**Only one at a time.** Opening a popup closes any popup already open.

**Focus and the page behind.** The popup is a modal dialog, so the rest of the
page becomes inert while it is open: it cannot be clicked, tabbed into, or read
past by a screen reader. Keyboard focus starts on the popup itself rather than
on the close button, so no control shows a focus ring on open.

**Stacking.** The popup renders in the browser's top layer, above the whole
page, so a theme or dashboard layout that uses transforms, filters or
containment cannot clip or cover it.

**Waiting for content.** Cards that fetch their data, such as logbook and
history, finish rendering after they are created. The popup keeps its surface
hidden until the content stops changing size, up to a short cap, so it does not
appear and then jump. The backdrop appears immediately, so the tap still feels
answered.

**Reduced motion.** When the system asks for reduced motion, the open and close
animations are skipped.

## Mobile behavior

On screens narrower than 768px:

- A `centered` popup expands to full screen (no border radius, full width and height)
- A `sticky_header` popup is full screen, and a card that can fill its container fills it
- A `sheet` popup keeps its shape, anchored to the bottom edge
- Swipe down to close (80px threshold, with drag animation)
- The back button and back gesture close the popup

## Theming

The popup follows your theme without any extra configuration. The dialog
background falls back through `--ha-card-background` then
`--card-background-color`, the title uses `--primary-text-color`, and the close
button uses the inherited text color.

For finer control, set any of the `--popup-card-*` variables listed above in
your theme.

## How it works

The component loads a JavaScript module that attaches a global listener on `document.body` for `ll-custom` events. When an event contains a `popup_card` key, it:

1. Creates a `<dialog>` overlay and opens it with `showModal()`, so the browser renders it in the top layer (no ancestor transform, filter or z-index can clip it) and makes the rest of the page inert
2. Uses `window.loadCardHelpers()` to instantiate the HA card from the config
3. Passes the `hass` object to the card and keeps it updated
4. Injects a per-popup scoped stylesheet (from the style keys + `style`) and a unique class on the overlay so styles can't leak between popups
5. Pushes one history entry so the back button closes the popup, and consumes it on close
6. Reveals the popup once its content has stopped resizing, so a card that loads its data does not make the popup jump as it appears
7. Cleans up the card element, the scoped stylesheet, the history entry and any `auto_close` timer on close to prevent leaks

The `ll-custom` event is a standard Home Assistant frontend event dispatched when a card uses `action: fire-dom-event`. No additional integrations are needed.
