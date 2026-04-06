from __future__ import annotations

import logging
import traceback

from app.api_client.rental_api import (
    RentalApiClient,
    build_query_params_from_subscription,
)
from app.parsers.listing_parser import parse_listings
from app.repositories.listing_repo import ListingRepository
from app.repositories.polling_history_repo import PollingHistoryRepository
from app.repositories.subscription_repo import SubscriptionRepository

logger = logging.getLogger(__name__)


class PollingService:
    """Iterates active subscriptions, fetches listings per subscription's filters,
    upserts into the global listings table, and records matches in
    subscription_listings.
    """

    def __init__(
        self,
        api_client: RentalApiClient,
        listing_repo: ListingRepository,
        subscription_repo: SubscriptionRepository,
        history_repo: PollingHistoryRepository,
    ) -> None:
        self._api = api_client
        self._listing_repo = listing_repo
        self._sub_repo = subscription_repo
        self._history_repo = history_repo

    def run(self) -> None:
        subscriptions = self._sub_repo.get_active_subscriptions()
        if not subscriptions:
            logger.info("No active subscriptions to poll")
            return

        logger.info("Polling %d active subscription(s)", len(subscriptions))

        for sub in subscriptions:
            try:
                self._poll_subscription(sub)
            except Exception:
                logger.exception(
                    "Unhandled error polling subscription %d", sub["id"]
                )

    def _poll_subscription(self, sub: dict) -> None:
        sub_id: int = sub["id"]
        sub_name: str = sub.get("name", "")
        query_params = build_query_params_from_subscription(sub)

        run_id = self._history_repo.start_run(
            request_url=self._api.get_request_url(),
            request_params=query_params,
            subscription_id=sub_id,
        )

        try:
            raw_response = self._api.fetch_listings(query_params)
            records = parse_listings(raw_response)
            total_fetched = len(records)

            if total_fetched == 0:
                logger.warning("Subscription %d (%s): no listings parsed", sub_id, sub_name)
                self._history_repo.finish_run(run_id, status="success", total_fetched=0)
                self._sub_repo.update_last_polled(sub_id)
                return

            # Upsert into global listings table (dedup by source_listing_id)
            source_ids = [r.source_listing_id for r in records]
            existing = self._listing_repo.get_existing_source_ids(source_ids)
            new_records = [r for r in records if r.source_listing_id not in existing]
            skipped = total_fetched - len(new_records)

            inserted = 0
            if new_records:
                db_rows = [r.to_db_dict() for r in new_records]
                inserted = self._listing_repo.bulk_insert(db_rows)

            # Resolve listing DB IDs for ALL fetched records (new + existing)
            # so we can record subscription-listing matches.
            listing_db_ids = self._listing_repo.get_db_ids_by_source_ids(source_ids)

            # Record matches in subscription_listings (pending delivery)
            if listing_db_ids:
                self._sub_repo.record_matched_listings(sub_id, listing_db_ids)

            self._sub_repo.update_last_polled(sub_id)

            self._history_repo.finish_run(
                run_id,
                status="success",
                total_fetched=total_fetched,
                new_inserted_count=inserted,
                skipped_existing_count=skipped,
            )
            logger.info(
                "Subscription %d (%s) poll complete: fetched=%d new=%d skipped=%d matched=%d",
                sub_id,
                sub_name,
                total_fetched,
                inserted,
                skipped,
                len(listing_db_ids),
            )

        except Exception as exc:
            tb = traceback.format_exc()
            logger.exception("Polling run %d failed for subscription %d", run_id, sub_id)
            self._history_repo.finish_run(
                run_id,
                status="error",
                error_message=f"{exc}\n{tb}"[:2000],
            )
