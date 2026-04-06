from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)

SUBSCRIPTIONS_TABLE = "subscriptions"
BRIDGE_TABLE = "subscription_listings"


class SubscriptionRepository:
    """Data access layer for subscriptions and subscription_listings tables."""

    def __init__(self, supabase: Client) -> None:
        self._sb = supabase

    # ------------------------------------------------------------------
    # Subscriptions
    # ------------------------------------------------------------------

    def get_active_subscriptions(self) -> list[dict[str, Any]]:
        """Return all active subscriptions joined with their user info."""
        resp = (
            self._sb.table(SUBSCRIPTIONS_TABLE)
            .select("*, users!inner(id, email, name, is_active)")
            .eq("is_active", True)
            .eq("users.is_active", True)
            .execute()
        )
        return resp.data

    def update_last_polled(self, subscription_id: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self._sb.table(SUBSCRIPTIONS_TABLE).update(
            {"last_polled_at": now, "updated_at": now}
        ).eq("id", subscription_id).execute()

    def advance_next_email_at(self, subscription_id: int, frequency_hours: int) -> None:
        """Set last_emailed_at=NOW and push next_email_at forward by frequency_hours."""
        now = datetime.now(timezone.utc).isoformat()
        self._sb.table(SUBSCRIPTIONS_TABLE).update(
            {
                "last_emailed_at": now,
                "next_email_at": f"NOW() + INTERVAL '{frequency_hours} hours'",
                "updated_at": now,
            }
        ).eq("id", subscription_id).execute()

    def advance_next_email_at_rpc(self, subscription_id: int, frequency_hours: int) -> None:
        """Advance next_email_at using raw SQL via RPC to handle interval arithmetic."""
        now = datetime.now(timezone.utc).isoformat()
        # Supabase REST API doesn't support SQL expressions in updates,
        # so we compute the next time in Python instead.
        from datetime import timedelta
        next_at = (datetime.now(timezone.utc) + timedelta(hours=frequency_hours)).isoformat()
        self._sb.table(SUBSCRIPTIONS_TABLE).update(
            {
                "last_emailed_at": now,
                "next_email_at": next_at,
                "updated_at": now,
            }
        ).eq("id", subscription_id).execute()

    # ------------------------------------------------------------------
    # Subscriptions due for email (via RPC)
    # ------------------------------------------------------------------

    def get_subscriptions_due_for_email(self) -> list[dict[str, Any]]:
        resp = self._sb.rpc("get_subscriptions_due_for_email").execute()
        return resp.data

    # ------------------------------------------------------------------
    # Subscription-listing matching (polling side)
    # ------------------------------------------------------------------

    def record_matched_listings(
        self, subscription_id: int, listing_ids: list[int]
    ) -> int:
        """Insert pending subscription_listings rows for newly matched listings.

        Uses upsert with ignore_duplicates so already-matched pairs are skipped.
        Returns the number of new rows created.
        """
        if not listing_ids:
            return 0

        now = datetime.now(timezone.utc).isoformat()
        rows = [
            {
                "subscription_id": subscription_id,
                "listing_id": lid,
                "delivery_status": "pending",
                "matched_at": now,
            }
            for lid in listing_ids
        ]
        resp = (
            self._sb.table(BRIDGE_TABLE)
            .upsert(rows, on_conflict="subscription_id,listing_id", ignore_duplicates=True)
            .execute()
        )
        count = len(resp.data) if resp.data else 0
        logger.info(
            "Recorded %d matched listing(s) for subscription %d",
            count,
            subscription_id,
        )
        return count

    # ------------------------------------------------------------------
    # Pending listings for email (via RPC)
    # ------------------------------------------------------------------

    def get_pending_listings(
        self, subscription_id: int, limit: int = 50
    ) -> list[dict[str, Any]]:
        resp = self._sb.rpc(
            "get_pending_listings_for_subscription",
            {"p_subscription_id": subscription_id, "p_limit": limit},
        ).execute()
        return resp.data

    # ------------------------------------------------------------------
    # Delivery tracking (email side)
    # ------------------------------------------------------------------

    def record_send_success(
        self, subscription_id: int, sl_ids: list[int]
    ) -> None:
        """Mark subscription_listings rows as sent (batch)."""
        now = datetime.now(timezone.utc).isoformat()
        self._sb.table(BRIDGE_TABLE).update(
            {"delivery_status": "sent", "sent_at": now, "updated_at": now}
        ).in_("id", sl_ids).execute()
        logger.info(
            "Recorded send success: subscription=%d, count=%d",
            subscription_id,
            len(sl_ids),
        )

    def record_send_failure(
        self, subscription_id: int, sl_ids: list[int], error_message: str
    ) -> None:
        """Mark subscription_listings rows as failed (batch)."""
        now = datetime.now(timezone.utc).isoformat()
        self._sb.table(BRIDGE_TABLE).update(
            {
                "delivery_status": "failed",
                "error_message": error_message[:500],
                "updated_at": now,
            }
        ).in_("id", sl_ids).execute()
        logger.warning(
            "Recorded send failure: subscription=%d, count=%d, error=%s",
            subscription_id,
            len(sl_ids),
            error_message[:120],
        )
