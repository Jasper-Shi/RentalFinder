from __future__ import annotations

import logging
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config.settings import Settings

logger = logging.getLogger(__name__)


class RentalApiError(Exception):
    """Raised when the 51.ca API returns a non-success response."""


class RentalApiClient:
    """HTTP client for the 51.ca rental listings API."""

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.api_base_url
        self._params = settings.api_query_params
        self._headers = settings.api_headers
        self._timeout = settings.api_timeout_seconds
        self._max_retries = settings.api_max_retries

    def _make_retry_decorator(self):
        return retry(
            stop=stop_after_attempt(self._max_retries),
            wait=wait_exponential(multiplier=1, min=2, max=30),
            retry=retry_if_exception_type((httpx.TransportError, RentalApiError)),
            reraise=True,
        )

    def fetch_listings(self) -> dict[str, Any]:
        """Fetch rental listings from 51.ca. Returns the raw JSON response dict.

        Retries on transient transport errors and 5xx responses.
        """
        decorated = self._make_retry_decorator()(self._do_fetch)
        return decorated()

    def _do_fetch(self) -> dict[str, Any]:
        logger.info("Fetching listings from %s", self._base_url)
        with httpx.Client(timeout=self._timeout) as client:
            response = client.get(
                self._base_url,
                params=self._params,
                headers=self._headers,
            )

        if response.status_code >= 500:
            raise RentalApiError(
                f"Server error {response.status_code}: {response.text[:200]}"
            )

        if response.status_code != 200:
            raise RentalApiError(
                f"Unexpected status {response.status_code}: {response.text[:200]}"
            )

        data = response.json()
        if not isinstance(data, dict):
            raise RentalApiError(f"Unexpected response type: {type(data)}")

        logger.info(
            "API returned %d listing(s)",
            len(data.get("data", [])),
        )
        return data

    def get_request_url(self) -> str:
        return self._base_url

    def get_request_params_snapshot(self) -> dict[str, str]:
        return dict(self._params)
