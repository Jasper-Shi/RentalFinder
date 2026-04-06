from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader

from app.config.settings import Settings

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = Path(__file__).parent / "templates"


class GmailSender:
    """Sends listing notification emails via Gmail SMTP."""

    def __init__(self, settings: Settings) -> None:
        self._host = settings.smtp_host
        self._port = settings.smtp_port
        self._username = settings.smtp_username or settings.gmail_sender_email
        self._password = settings.smtp_password or settings.gmail_app_password
        self._from_email = settings.gmail_sender_email
        self._from_name = settings.email_from_name
        self._reply_to = settings.email_reply_to
        self._subject_prefix = settings.email_subject_prefix
        self._timeout = settings.email_send_timeout_seconds

        self._jinja_env = Environment(
            loader=FileSystemLoader(str(_TEMPLATE_DIR)),
            autoescape=True,
        )

    def send_listings_email(
        self,
        to_email: str,
        to_name: str,
        listings: list[dict[str, Any]],
    ) -> tuple[bool, str | None]:
        """Send a batch of listings to one recipient.

        Returns (success, error_message_or_none).
        """
        try:
            subject = f"{self._subject_prefix} {len(listings)} New Rental Listing(s)"
            html_body = self._render_template(to_name, listings)

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{self._from_name} <{self._from_email}>"
            msg["To"] = to_email
            if self._reply_to:
                msg["Reply-To"] = self._reply_to

            msg.attach(MIMEText(html_body, "html"))

            with smtplib.SMTP(self._host, self._port, timeout=self._timeout) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(self._username, self._password)
                server.sendmail(self._from_email, [to_email], msg.as_string())

            logger.info("Email sent to %s (%d listings)", to_email, len(listings))
            return True, None

        except Exception as exc:
            logger.exception("Failed to send email to %s", to_email)
            return False, str(exc)

    def _render_template(
        self, recipient_name: str, listings: list[dict[str, Any]]
    ) -> str:
        template = self._jinja_env.get_template("listings_email.html")
        return template.render(
            recipient_name=recipient_name,
            listings=listings,
            count=len(listings),
        )
