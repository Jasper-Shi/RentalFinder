from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

# Default headers sent with every 51.ca API request.
_DEFAULT_API_HEADERS: dict[str, str] = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-CA,en;q=0.9,zh;q=0.8,en-GB;q=0.7,en-US;q=0.6,zh-CN;q=0.5",
    "authorization": "Bearer guest",
    "priority": "u=1, i",
    "referer": "https://house.51.ca/rental/map",
    "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
    ),
}


class Settings(BaseSettings):
    """Central configuration loaded from environment variables / .env file."""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    # --- Supabase ---
    supabase_url: str
    supabase_key: str

    # --- 51.ca API (global; per-subscription filters come from DB) ---
    api_base_url: str = "https://house.51.ca/api/v7/rental/listings"
    api_headers: dict[str, str] = _DEFAULT_API_HEADERS
    api_timeout_seconds: int = 30
    api_max_retries: int = 3

    # --- Scheduler ---
    poll_interval_minutes: int = 60
    email_check_interval_minutes: int = 5

    # --- Gmail / SMTP ---
    gmail_sender_email: str = ""
    gmail_app_password: str = ""
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    email_from_name: str = "RentalFinder"

    # --- Email options ---
    email_subject_prefix: str = "[RentalFinder]"
    email_batch_size: int = 50
    email_reply_to: str = ""
    email_enabled: bool = True
    email_send_timeout_seconds: int = 30
    email_rate_limit_per_run: int = 10

    # --- Logging ---
    log_level: str = "INFO"

    @field_validator("api_headers", mode="before")
    @classmethod
    def _parse_json_string(cls, v: Any) -> dict[str, str]:
        if isinstance(v, str):
            return json.loads(v)
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
