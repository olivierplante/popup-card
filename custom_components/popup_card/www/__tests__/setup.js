// Mark the environment as a test run BEFORE popup-card.js is imported, so its
// auto-init block (which attaches a global ll-custom listener and logs to the
// console) is skipped. Tests drive show()/close() directly.
globalThis.window = globalThis.window || globalThis;
window.__POPUP_CARD_TEST__ = true;
