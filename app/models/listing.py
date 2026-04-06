from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, field_validator


class ListingRecord(BaseModel):
    """Validated listing ready for DB insertion.

    Every field except ``source_listing_id`` and ``raw_json`` is optional so
    the parser can tolerate incomplete upstream data gracefully.
    """

    source_listing_id: str
    title: str | None = None
    source: str | None = None
    location_en: str | None = None
    location_cn: str | None = None
    includes_text: str | None = None
    intersection: str | None = None
    province: str | None = None
    city: str | None = None
    slug: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    sublocality: str | None = None
    price_amount: float | None = None
    available_date_raw: str | None = None
    user_modified_at: str | None = None
    raw_json: dict[str, Any]

    @field_validator("user_modified_at", mode="before")
    @classmethod
    def _coerce_timestamp(cls, v: Any) -> str | None:
        """Accept Unix epoch int or string; normalise to ISO-8601 for TIMESTAMPTZ."""
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return datetime.fromtimestamp(v, tz=timezone.utc).isoformat()
        return str(v)

    def to_db_dict(self) -> dict[str, Any]:
        """Serialize for Supabase insert."""
        data = self.model_dump()
        if data.get("price_amount") is not None:
            data["price_amount"] = float(data["price_amount"])
        return data
