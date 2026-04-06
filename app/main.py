from __future__ import annotations

import logging
import sys

from supabase import Client, create_client

from app.api_client.rental_api import RentalApiClient
from app.config.settings import Settings, get_settings
from app.email_sender.gmail_sender import GmailSender
from app.repositories.listing_repo import ListingRepository
from app.repositories.polling_history_repo import PollingHistoryRepository
from app.repositories.recipient_repo import RecipientRepository
from app.scheduler.job_runner import JobRunner
from app.services.email_service import EmailService
from app.services.polling_service import PollingService


def _configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )


def _build_supabase_client(settings: Settings) -> Client:
    return create_client(settings.supabase_url, settings.supabase_key)


def run() -> None:
    """Wire all dependencies together and start the scheduler."""
    settings = get_settings()
    _configure_logging(settings.log_level)

    logger = logging.getLogger(__name__)
    logger.info("RentalFinder starting up...")

    supabase = _build_supabase_client(settings)

    # Repositories
    listing_repo = ListingRepository(supabase)
    recipient_repo = RecipientRepository(supabase)
    history_repo = PollingHistoryRepository(supabase)

    # API client
    api_client = RentalApiClient(settings)

    # Services
    polling_service = PollingService(api_client, listing_repo, history_repo)
    gmail_sender = GmailSender(settings)
    email_service = EmailService(settings, recipient_repo, gmail_sender)

    # Scheduler
    runner = JobRunner(settings, polling_service, email_service)
    runner.start()
