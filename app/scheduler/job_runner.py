from __future__ import annotations

import functools
import logging
import threading
import time

import schedule

from app.config.settings import Settings
from app.services.email_service import EmailService
from app.services.polling_service import PollingService

logger = logging.getLogger(__name__)


def _no_overlap(func):
    """Decorator that silently skips a job invocation if the previous one is still running."""
    lock = threading.Lock()

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        if not lock.acquire(blocking=False):
            logger.warning("Skipping %s: previous run still active", func.__name__)
            return
        try:
            return func(*args, **kwargs)
        finally:
            lock.release()

    return wrapper


class JobRunner:
    """Registers and runs the polling and email jobs on a schedule."""

    def __init__(
        self,
        settings: Settings,
        polling_service: PollingService,
        email_service: EmailService,
    ) -> None:
        self._settings = settings
        self._polling_service = polling_service
        self._email_service = email_service

    def start(self) -> None:
        """Register jobs and enter the main loop (blocking)."""
        poll_job = _no_overlap(self._run_poll)
        email_job = _no_overlap(self._run_email)

        poll_mins = self._settings.poll_interval_minutes
        email_mins = self._settings.email_interval_minutes

        schedule.every(poll_mins).minutes.do(poll_job)
        schedule.every(email_mins).minutes.do(email_job)

        logger.info(
            "Scheduler started: poll every %d min, email every %d min",
            poll_mins,
            email_mins,
        )

        # Run the polling job immediately on startup, then enter the loop.
        logger.info("Running initial poll on startup...")
        poll_job()

        while True:
            schedule.run_pending()
            time.sleep(1)

    def _run_poll(self) -> None:
        logger.info("=== Polling job started ===")
        try:
            self._polling_service.run()
        except Exception:
            logger.exception("Unhandled error in polling job")
        logger.info("=== Polling job finished ===")

    def _run_email(self) -> None:
        logger.info("=== Email job started ===")
        try:
            self._email_service.run()
        except Exception:
            logger.exception("Unhandled error in email job")
        logger.info("=== Email job finished ===")
