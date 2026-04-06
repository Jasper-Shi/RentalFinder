"""Thin entry point: loads .env, then starts the application."""

from dotenv import load_dotenv

load_dotenv()

from app.main import run  # noqa: E402

if __name__ == "__main__":
    run()
