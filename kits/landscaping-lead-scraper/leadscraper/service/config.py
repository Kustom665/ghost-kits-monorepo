"""Service configuration: data directory, auth token, limits."""

import os
import secrets

DATA_DIR = os.path.expanduser(os.environ.get("LEADSCRAPER_HOME", "~/.leadscraper"))
JOB_MAX_SECONDS = int(os.environ.get("LEADSCRAPER_JOB_TIMEOUT", "300"))


def db_path() -> str:
    return os.environ.get("LEADSCRAPER_DB") or os.path.join(DATA_DIR, "leads.db")


def token_path() -> str:
    return os.path.join(DATA_DIR, "token")


def load_or_create_token() -> str:
    """One static bearer token per install, created on first run, mode 0600."""
    path = token_path()
    if os.path.exists(path):
        with open(path, encoding="utf-8") as handle:
            existing = handle.read().strip()
        if existing:
            return existing
    os.makedirs(os.path.dirname(path), exist_ok=True)
    token = secrets.token_urlsafe(24)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(token + "\n")
    return token
