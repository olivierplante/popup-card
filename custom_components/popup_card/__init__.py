"""Popup Card - lightweight popup overlay for HA Lovelace dashboards."""
import logging
import pathlib

from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.core import HomeAssistant
import homeassistant.helpers.config_validation as cv

_LOGGER = logging.getLogger(__name__)

DOMAIN = "popup_card"
RESOURCE_URL = "/popup_card/popup-card.js"
JS_FILE = pathlib.Path(__file__).parent / "www" / "popup-card.js"
VERSION = "1.0.0"
VERSIONED_URL = f"{RESOURCE_URL}?v={VERSION}"

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register the popup-card Lovelace resource."""

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
