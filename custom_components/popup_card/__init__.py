"""Popup Card - lightweight popup overlay for HA Lovelace dashboards."""
import logging
import pathlib

from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.config_entries import ConfigEntry, SOURCE_IMPORT
from homeassistant.core import HomeAssistant
import homeassistant.helpers.config_validation as cv

_LOGGER = logging.getLogger(__name__)

DOMAIN = "popup_card"
RESOURCE_URL = "/popup_card/popup-card.js"
JS_FILE = pathlib.Path(__file__).parent / "www" / "popup-card.js"
VERSION = "1.3.0"
VERSIONED_URL = f"{RESOURCE_URL}?v={VERSION}"

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Import legacy YAML configuration into a config entry."""
    if DOMAIN not in config:
        return True

    _LOGGER.warning(
        "Popup Card YAML configuration is no longer needed. "
        "The integration is now managed from Settings > Devices & Services. "
        "You can safely remove 'popup_card:' from configuration.yaml."
    )

    if hass.config_entries.async_entries(DOMAIN):
        return True

    hass.async_create_task(
        hass.config_entries.flow.async_init(
            DOMAIN, context={"source": SOURCE_IMPORT}, data={}
        )
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Register the popup-card Lovelace resource and serve its JS file."""

    await hass.http.async_register_static_paths(
        [StaticPathConfig(RESOURCE_URL, str(JS_FILE), cache_headers=True)]
    )

    resources = hass.data.get("lovelace", {}).resources
    if resources is None:
        _LOGGER.warning(
            "popup_card: Lovelace resources not available, "
            "popup may not load correctly"
        )
        return True

    if not resources.loaded:
        await resources.async_load()
        resources.loaded = True

    for item in resources.async_items():
        if item["url"].startswith(RESOURCE_URL):
            if not item["url"].endswith(VERSION):
                if isinstance(resources, ResourceStorageCollection):
                    await resources.async_update_item(
                        item["id"],
                        {"res_type": "module", "url": VERSIONED_URL},
                    )
                    _LOGGER.info("popup_card: updated resource URL to %s", VERSIONED_URL)
            return True

    if getattr(resources, "async_create_item", None):
        await resources.async_create_item(
            {"res_type": "module", "url": VERSIONED_URL}
        )
        _LOGGER.info("popup_card: registered Lovelace resource %s", VERSIONED_URL)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload the config entry.

    The static path stays registered until HA restarts (there's no public
    unregister API). The Lovelace resource is intentionally kept so users who
    just reload the entry don't lose it; it's removed in async_remove_entry.
    """
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Remove the Lovelace resource when the user uninstalls the integration."""
    resources = hass.data.get("lovelace", {}).resources
    if resources is None or not isinstance(resources, ResourceStorageCollection):
        return

    if not resources.loaded:
        await resources.async_load()
        resources.loaded = True

    for item in list(resources.async_items()):
        if item["url"].startswith(RESOURCE_URL):
            await resources.async_delete_item(item["id"])
            _LOGGER.info("popup_card: removed Lovelace resource %s", item["url"])
