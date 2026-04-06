from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)

TABLE = "polling_history"


class PollingHistoryRepository:
    """Data access layer for the polling_history table."""

    def __init__(self, supabase: Client) -> None:
        self._sb = supabase

    def start_run(
        self,
        request_url: str,
        request_params: dict[str, Any],
        subscription_id: int | None = None,
    ) -> int:
        """Create a new polling_history row with status='running'. Returns its id."""
        now = datetime.now(timezone.utc).isoformat()
        payload: dict[str, Any] = {
            "started_at": now,
            "status": "running",
            "request_url": request_url,
            "request_params_snapshot": request_params,
        }
        if subscription_id is not None:
            payload["subscription_id"] = subscription_id

        resp = self._sb.table(TABLE).insert(payload).execute()
        row_id: int = resp.data[0]["id"]
        logger.info("Polling run started: id=%d subscription=%s", row_id, subscription_id)
        return row_id

    def finish_run(
        self,
        run_id: int,
        *,
        status: str = "success",
        total_fetched: int = 0,
        new_inserted_count: int = 0,
        skipped_existing_count: int = 0,
        error_message: str | None = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        payload: dict[str, Any] = {
            "finished_at": now,
            "status": status,
            "total_fetched": total_fetched,
            "new_inserted_count": new_inserted_count,
            "skipped_existing_count": skipped_existing_count,
        }
        if error_message:
            payload["error_message"] = error_message[:2000]

        self._sb.table(TABLE).update(payload).eq("id", run_id).execute()
        logger.info(
            "Polling run finished: id=%d status=%s new=%d skipped=%d",
            run_id,
            status,
            new_inserted_count,
            skipped_existing_count,
        )
