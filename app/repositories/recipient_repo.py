from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)

RECIPIENTS_TABLE = "recipients"
BRIDGE_TABLE = "recipient_listings"


class RecipientRepository:
    """Data access layer for recipients and recipient_listings tables."""

    def __init__(self, supabase: Client) -> None:
        self._sb = supabase

    # ------------------------------------------------------------------
    # Recipients
    # ------------------------------------------------------------------

    def get_active_recipients(self) -> list[dict[str, Any]]:
        resp = (
            self._sb.table(RECIPIENTS_TABLE)
            .select("*")
            .eq("is_active", True)
            .execute()
        )
        return resp.data

    # ------------------------------------------------------------------
    # Unsent listings (via Supabase RPC calling the DB function)
    # ------------------------------------------------------------------

    def get_unsent_listings(
        self, recipient_id: int, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Return listings not yet sent to a given recipient.

        Uses the get_unsent_listings_for_recipient RPC defined in the migration.
        """
        resp = self._sb.rpc(
            "get_unsent_listings_for_recipient",
            {"p_recipient_id": recipient_id, "p_limit": limit},
        ).execute()
        return resp.data

    # ------------------------------------------------------------------
    # Delivery tracking
    # ------------------------------------------------------------------

    def record_send_success(
        self, recipient_id: int, listing_ids: list[int]
    ) -> None:
        """Mark listings as successfully sent to a recipient."""
        now = datetime.now(timezone.utc).isoformat()
        rows = [
            {
                "recipient_id": recipient_id,
                "listing_id": lid,
                "delivery_status": "sent",
                "first_sent_at": now,
                "last_attempt_at": now,
            }
            for lid in listing_ids
        ]
        self._sb.table(BRIDGE_TABLE).upsert(
            rows, on_conflict="recipient_id,listing_id"
        ).execute()
        logger.info(
            "Recorded send success: recipient=%d, listings=%s", recipient_id, listing_ids
        )

    def record_send_failure(
        self, recipient_id: int, listing_ids: list[int], error_message: str
    ) -> None:
        """Mark listings as failed for a recipient, preserving the error."""
        now = datetime.now(timezone.utc).isoformat()
        rows = [
            {
                "recipient_id": recipient_id,
                "listing_id": lid,
                "delivery_status": "failed",
                "last_attempt_at": now,
                "error_message": error_message[:500],
            }
            for lid in listing_ids
        ]
        self._sb.table(BRIDGE_TABLE).upsert(
            rows, on_conflict="recipient_id,listing_id"
        ).execute()
        logger.warning(
            "Recorded send failure: recipient=%d, listings=%s, error=%s",
            recipient_id,
            listing_ids,
            error_message[:120],
        )
