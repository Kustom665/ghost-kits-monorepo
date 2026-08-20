"""CSV export that survives being run every day against the same file."""

import csv
import os

from .extract import canonical_url, dedupe, dedupe_key
from .models import CSV_FIELDS


def existing_keys(path: str) -> set:
    """Dedupe keys already present in `path`, so re-runs don't re-list old leads."""
    keys = set()
    if not path or not os.path.exists(path):
        return keys
    with open(path, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            url = canonical_url(row.get("url", ""))
            if url:
                keys.add(url)
            else:
                title = " ".join((row.get("title") or "").lower().split())
                keys.add(f"{row.get('source', '')}::{title}")
    return keys


def write_csv(leads, path: str, append: bool = False) -> int:
    """Write leads to `path`. Returns the number of rows actually written."""
    seen = existing_keys(path) if append else set()
    fresh = dedupe(leads, seen=seen)
    if not fresh and append:
        return 0

    file_exists = os.path.exists(path) and os.path.getsize(path) > 0
    mode = "a" if append and file_exists else "w"
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)

    with open(path, mode, newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        if mode == "w":
            writer.writeheader()
        for lead in fresh:
            writer.writerow(lead.as_row())
    return len(fresh)


__all__ = ["existing_keys", "write_csv", "dedupe", "dedupe_key"]
