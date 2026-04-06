# RentalFinder

A scheduled Python service that polls [51.ca](https://house.51.ca) for new rental listings, stores them in **Supabase**, and emails unsent listings to configured recipients via **Gmail SMTP**.

---

## Features

- **Polling job** — fetches listings from the 51.ca API on a configurable schedule (default: every 60 minutes).
- **Email dispatch job** — batches new listings per recipient and sends them via Gmail on a separate schedule (default: every 120 minutes).
- **Deduplication** — listings are deduplicated by `source_listing_id` at both the application and database level. The `recipient_listings` bridge table prevents the same listing from ever being emailed twice to the same person.
- **Observability** — every poll run is recorded in `polling_history`; every email delivery is tracked in `recipient_listings`.
- **Docker-ready** — includes `Dockerfile` and `docker-compose.yml` for easy deployment.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Docker (optional) | 20+ |
| A Supabase project | Free tier is fine |
| A Gmail account with App Password | See below |

---

## Project Structure

```
RentalFinder/
├── app/
│   ├── main.py                     # Wires dependencies, starts scheduler
│   ├── config/settings.py          # Pydantic Settings (all env vars)
│   ├── api_client/rental_api.py    # 51.ca HTTP client with retry
│   ├── parsers/listing_parser.py   # JSON → ListingRecord mapping
│   ├── models/listing.py           # Pydantic data models
│   ├── repositories/               # Supabase data access layer
│   ├── services/                   # Business logic (polling, email)
│   ├── email_sender/               # Gmail SMTP + Jinja2 HTML template
│   └── scheduler/job_runner.py     # schedule lib, overlap guard
├── migrations/
│   └── 001_initial_schema.sql      # Supabase table definitions
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── run.py                          # Entry point
```

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in the Supabase dashboard.
3. Paste the contents of `migrations/001_initial_schema.sql` and run it.
4. Copy your **Project URL** and **anon/service-role key** from **Project Settings → API**.

### 2. Gmail App Password

Google requires an **App Password** when using SMTP with 2-Step Verification.

1. Go to [myaccount.google.com](https://myaccount.google.com).
2. Navigate to **Security → 2-Step Verification** and ensure it is **enabled**.
3. Go to **Security → App passwords** (or search "App passwords" in the account settings).
4. Select **Mail** as the app and **Other (Custom name)** as the device, e.g. "RentalFinder".
5. Click **Generate**. Copy the 16-character password.
6. Use this password for both `GMAIL_APP_PASSWORD` and `SMTP_PASSWORD` in your `.env`.

### 3. Add Recipients

Insert at least one row into the `recipients` table (via the Supabase dashboard Table Editor or SQL Editor):

```sql
INSERT INTO recipients (email, name, is_active)
VALUES ('alice@example.com', 'Alice', true);
```

### 4. Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your real values. Every variable is documented with inline comments in `.env.example`.

---

## Running Locally

```bash
# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate   # macOS/Linux
# .venv\Scripts\activate    # Windows

# Install dependencies
pip install -r requirements.txt

# Start the service
python run.py
```

The service will:
1. Run an initial poll immediately on startup.
2. Schedule subsequent polls every `POLL_INTERVAL_MINUTES` minutes.
3. Schedule email dispatch every `EMAIL_INTERVAL_MINUTES` minutes.
4. Log all activity to stdout.

---

## Running with Docker

```bash
# Build and start
docker compose up --build -d

# Follow logs
docker compose logs -f rental-finder

# Stop
docker compose down
```

The container reads all configuration from the `.env` file via `env_file` in `docker-compose.yml`. No database container is needed — Supabase is remote.

---

## Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_KEY` | Yes | — | Supabase anon or service-role key |
| `API_BASE_URL` | No | `https://house.51.ca/api/v7/rental/listings` | 51.ca API endpoint |
| `API_QUERY_PARAMS` | No | *(see .env.example)* | JSON string of query parameters |
| `API_HEADERS` | No | *(see .env.example)* | JSON string of HTTP headers |
| `API_TIMEOUT_SECONDS` | No | `30` | HTTP request timeout |
| `API_MAX_RETRIES` | No | `3` | Retry attempts on transient errors |
| `POLL_INTERVAL_MINUTES` | No | `60` | Polling frequency |
| `EMAIL_INTERVAL_MINUTES` | No | `120` | Email dispatch frequency |
| `GMAIL_SENDER_EMAIL` | Yes | — | Gmail From address |
| `GMAIL_APP_PASSWORD` | Yes | — | Gmail App Password |
| `SMTP_HOST` | No | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USERNAME` | No | *(GMAIL_SENDER_EMAIL)* | SMTP login |
| `SMTP_PASSWORD` | No | *(GMAIL_APP_PASSWORD)* | SMTP password |
| `EMAIL_FROM_NAME` | No | `RentalFinder` | Display name in From header |
| `EMAIL_SUBJECT_PREFIX` | No | `[RentalFinder]` | Email subject prefix |
| `EMAIL_BATCH_SIZE` | No | `50` | Max listings per email |
| `EMAIL_REPLY_TO` | No | — | Reply-To header |
| `EMAIL_ENABLED` | No | `true` | Set `false` to disable emails |
| `EMAIL_SEND_TIMEOUT_SECONDS` | No | `30` | SMTP send timeout |
| `EMAIL_RATE_LIMIT_PER_RUN` | No | `5` | Max emails per dispatch run |
| `LOG_LEVEL` | No | `INFO` | Python log level |

---

## Updating the Listing Parser

The field mapping between the 51.ca API response and the database is defined in `app/parsers/listing_parser.py` as the `FIELD_MAP` dictionary. To accommodate API changes:

1. Update the dotted source path (left side) to match the new JSON structure.
2. Keep the database column name (right side) unchanged unless you also update the migration.

---

## Suggested Next Steps

- Add unit tests with `pytest`.
- Add a `/health` HTTP endpoint for uptime monitoring.
- Support pagination if the API returns more than `perPage` results.
- Support multiple search configurations (different areas/price ranges).
- Add a simple web dashboard for managing recipients.
