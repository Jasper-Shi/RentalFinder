from __future__ import annotations

import logging

from app.config.settings import Settings
from app.email_sender.gmail_sender import GmailSender
from app.repositories.subscription_repo import SubscriptionRepository

logger = logging.getLogger(__name__)


class EmailService:
    """Finds subscriptions due for email, sends pending listings, records delivery."""

    def __init__(
        self,
        settings: Settings,
        subscription_repo: SubscriptionRepository,
        gmail_sender: GmailSender,
    ) -> None:
        self._settings = settings
        self._repo = subscription_repo
        self._sender = gmail_sender

    def run(self) -> None:
        if not self._settings.email_enabled:
            logger.info("Email sending is disabled via EMAIL_ENABLED=false")
            return

        due_subs = self._repo.get_subscriptions_due_for_email()
        if not due_subs:
            logger.info("No subscriptions due for email")
            return

        rate_limit = self._settings.email_rate_limit_per_run
        sends_this_run = 0

        for sub in due_subs:
            if sends_this_run >= rate_limit:
                logger.info("Rate limit reached (%d), stopping for this run", rate_limit)
                break

            sub_id: int = sub["subscription_id"]
            user_email: str = sub["user_email"]
            user_name: str = sub.get("user_name") or user_email
            sub_name: str = sub.get("subscription_name") or "Subscription"
            freq_hours: int = sub["email_frequency_hours"]

            pending = self._repo.get_pending_listings(
                sub_id, limit=self._settings.email_batch_size
            )

            if not pending:
                logger.debug(
                    "No pending listings for subscription %d (%s), advancing timer",
                    sub_id,
                    sub_name,
                )
                self._repo.advance_next_email_at_rpc(sub_id, freq_hours)
                continue

            sl_ids = [row["sl_id"] for row in pending]
            logger.info(
                "Sending %d listing(s) for subscription '%s' to %s (%s)",
                len(pending),
                sub_name,
                user_name,
                user_email,
            )

            success, error = self._sender.send_listings_email(
                to_email=user_email,
                to_name=user_name,
                listings=pending,
                subscription_name=sub_name,
            )

            if success:
                self._repo.record_send_success(sub_id, sl_ids)
                sends_this_run += 1
            else:
                self._repo.record_send_failure(
                    sub_id, sl_ids, error or "Unknown error"
                )

            self._repo.advance_next_email_at_rpc(sub_id, freq_hours)

        logger.info("Email dispatch complete: %d email(s) sent this run", sends_this_run)
