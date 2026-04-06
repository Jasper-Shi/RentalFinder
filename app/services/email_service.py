from __future__ import annotations

import logging

from app.config.settings import Settings
from app.email_sender.gmail_sender import GmailSender
from app.repositories.recipient_repo import RecipientRepository

logger = logging.getLogger(__name__)


class EmailService:
    """Orchestrates: query unsent listings -> batch -> send -> record delivery."""

    def __init__(
        self,
        settings: Settings,
        recipient_repo: RecipientRepository,
        gmail_sender: GmailSender,
    ) -> None:
        self._settings = settings
        self._repo = recipient_repo
        self._sender = gmail_sender

    def run(self) -> None:
        if not self._settings.email_enabled:
            logger.info("Email sending is disabled via EMAIL_ENABLED=false")
            return

        recipients = self._repo.get_active_recipients()
        if not recipients:
            logger.info("No active recipients found")
            return

        rate_limit = self._settings.email_rate_limit_per_run
        sends_this_run = 0

        for recipient in recipients:
            if sends_this_run >= rate_limit:
                logger.info("Rate limit reached (%d), stopping for this run", rate_limit)
                break

            recipient_id: int = recipient["id"]
            email: str = recipient["email"]
            name: str = recipient.get("name") or email

            unsent = self._repo.get_unsent_listings(
                recipient_id, limit=self._settings.email_batch_size
            )
            if not unsent:
                logger.debug("No unsent listings for %s", email)
                continue

            listing_ids = [row["id"] for row in unsent]
            logger.info(
                "Sending %d listing(s) to %s (%s)", len(unsent), name, email
            )

            success, error = self._sender.send_listings_email(
                to_email=email,
                to_name=name,
                listings=unsent,
            )

            if success:
                self._repo.record_send_success(recipient_id, listing_ids)
                sends_this_run += 1
            else:
                self._repo.record_send_failure(
                    recipient_id, listing_ids, error or "Unknown error"
                )

        logger.info("Email dispatch complete: %d email(s) sent this run", sends_this_run)
