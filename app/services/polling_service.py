from __future__ import annotations

import logging
import traceback

from app.api_client.rental_api import RentalApiClient
from app.parsers.listing_parser import parse_listings
from app.repositories.listing_repo import ListingRepository
from app.repositories.polling_history_repo import PollingHistoryRepository

logger = logging.getLogger(__name__)


class PollingService:
    """Orchestrates: fetch -> parse -> deduplicate -> store -> log history."""

    def __init__(
        self,
        api_client: RentalApiClient,
        listing_repo: ListingRepository,
        history_repo: PollingHistoryRepository,
    ) -> None:
        self._api = api_client
        self._listing_repo = listing_repo
        self._history_repo = history_repo

    def run(self) -> None:
        run_id = self._history_repo.start_run(
            request_url=self._api.get_request_url(),
            request_params=self._api.get_request_params_snapshot(),
        )

        try:
            raw_response = self._api.fetch_listings()
            records = parse_listings(raw_response)
            total_fetched = len(records)

            if total_fetched == 0:
                logger.warning("No listings parsed from API response")
                self._history_repo.finish_run(run_id, status="success", total_fetched=0)
                return

            # Pre-filter against existing source IDs to build accurate counts
            source_ids = [r.source_listing_id for r in records]
            existing = self._listing_repo.get_existing_source_ids(source_ids)
            new_records = [r for r in records if r.source_listing_id not in existing]
            skipped = total_fetched - len(new_records)

            inserted = 0
            if new_records:
                db_rows = [r.to_db_dict() for r in new_records]
                inserted = self._listing_repo.bulk_insert(db_rows)

            self._history_repo.finish_run(
                run_id,
                status="success",
                total_fetched=total_fetched,
                new_inserted_count=inserted,
                skipped_existing_count=skipped,
            )
            logger.info(
                "Poll complete: fetched=%d new=%d skipped=%d",
                total_fetched,
                inserted,
                skipped,
            )

        except Exception as exc:
            tb = traceback.format_exc()
            logger.exception("Polling run %d failed", run_id)
            self._history_repo.finish_run(
                run_id,
                status="error",
                error_message=f"{exc}\n{tb}"[:2000],
            )
