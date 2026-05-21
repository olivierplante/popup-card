"""Config flow for the Popup Card integration.

Single-step confirmation flow. The integration has no per-instance configuration
so this exists solely so users can add and remove it from the UI, which gives
Home Assistant a lifecycle hook to clean up the Lovelace resource when the
integration is removed.

Also handles importing existing YAML config (`popup_card:`) so users who set up
via configuration.yaml before 1.1.0 get migrated automatically on upgrade.
"""

from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult

DOMAIN = "popup_card"


class PopupCardConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Popup Card."""

    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None) -> FlowResult:
        """Handle the manual add-from-UI flow."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title="Popup Card", data={})

        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))

    async def async_step_import(self, import_data: dict) -> FlowResult:
        """Handle import from configuration.yaml (one-time auto-migration)."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        return self.async_create_entry(title="Popup Card", data={})
