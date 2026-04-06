from __future__ import annotations

import logging
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)

TABLE = "listings"
# Supabase caps the IN filter at 100-ish items; chunk to be safe.
_CHUNK_SIZE = 80


class ListingRepository:
    """Data access layer for the listings table."""

    def __init__(self, supabase: Client) -> None:
        self._sb = supabase

    def get_existing_source_ids(self, source_ids: list[str]) -> set[str]:
        """Return the subset of *source_ids* that already exist in the DB."""
        if not source_ids:
            return set()

        found: set[str] = set()
        for i in range(0, len(source_ids), _CHUNK_SIZE):
            chunk = source_ids[i : i + _CHUNK_SIZE]
            resp = (
                self._sb.table(TABLE)
                .select("source_listing_id")
                .in_("source_listing_id", chunk)
                .execute()
            )
            found.update(row["source_listing_id"] for row in resp.data)

        return found

    def bulk_insert(self, records: list[dict[str, Any]]) -> int:
        """Insert new listings, silently skipping duplicates on source_listing_id.

        Returns the number of rows actually written.
        """
        if not records:
            return 0

        resp = (
            self._sb.table(TABLE)
            .upsert(records, on_conflict="source_listing_id", ignore_duplicates=True)
            .execute()
        )
        inserted = len(resp.data) if resp.data else 0
        logger.info("Bulk upsert: %d record(s) written", inserted)
        return inserted

    def get_db_ids_by_source_ids(self, source_ids: list[str]) -> list[int]:
        """Given a list of source_listing_ids, return their DB primary key ids."""
        if not source_ids:
            return []

        db_ids: list[int] = []
        for i in range(0, len(source_ids), _CHUNK_SIZE):
            chunk = source_ids[i : i + _CHUNK_SIZE]
            resp = (
                self._sb.table(TABLE)
                .select("id")
                .in_("source_listing_id", chunk)
                .execute()
            )
            db_ids.extend(row["id"] for row in resp.data)

        return db_ids

    def get_all_ids(self) -> list[dict[str, Any]]:
        """Return id + source_listing_id for all listings (for diagnostics)."""
        resp = self._sb.table(TABLE).select("id, source_listing_id").execute()
        return resp.data
