from __future__ import annotations

import logging
from typing import Any

from app.models.listing import ListingRecord

logger = logging.getLogger(__name__)

# Maps dotted source paths to DB column names.
# Update this dict when the upstream response shape changes.
FIELD_MAP: dict[str, str] = {
    "id": "source_listing_id",
    "title": "title",
    "source": "source",
    "location.en": "location_en",
    "location.cn": "location_cn",
    "includes": "includes_text",
    "intersection": "intersection",
    "province": "province",
    "city": "city",
    "slug": "slug",
    "coordinate.latitude": "latitude",
    "coordinate.longitude": "longitude",
    "sublocality": "sublocality",
    "price.amount": "price_amount",
    "availableDate": "available_date_raw",
    "status.userModifiedAt": "user_modified_at",
}


def _get_nested(obj: dict[str, Any], dotted_key: str) -> Any:
    """Resolve a dotted path like 'coordinate.latitude' against a nested dict."""
    parts = dotted_key.split(".")
    current: Any = obj
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def parse_listing(raw_item: dict[str, Any]) -> ListingRecord | None:
    """Convert a single raw API item into a ListingRecord.

    Returns None if the item is missing a source_listing_id.
    """
    mapped: dict[str, Any] = {}
    for source_path, db_field in FIELD_MAP.items():
        mapped[db_field] = _get_nested(raw_item, source_path)

    source_id = mapped.get("source_listing_id")
    if source_id is None:
        logger.warning("Skipping listing with missing id: %s", raw_item)
        return None

    mapped["source_listing_id"] = str(source_id)
    mapped["raw_json"] = raw_item

    try:
        return ListingRecord(**mapped)
    except Exception:
        logger.exception("Failed to parse listing id=%s", source_id)
        return None


def parse_listings(api_response: dict[str, Any]) -> list[ListingRecord]:
    """Extract all valid listings from the API response's data array."""
    items = api_response.get("data", [])
    if not isinstance(items, list):
        logger.error("Expected 'data' to be a list, got %s", type(items))
        return []

    results: list[ListingRecord] = []
    for item in items:
        record = parse_listing(item)
        if record is not None:
            results.append(record)

    logger.info("Parsed %d/%d listings successfully", len(results), len(items))
    return results
