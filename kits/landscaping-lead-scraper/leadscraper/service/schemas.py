"""Request/response validation at the HTTP boundary.

Notable absences are deliberate:
- No places_key field: the Google key is a billable credential and stays in
  the server's environment, never on the phone.
- No Facebook fields: automated group scraping violates Meta's ToS; it stays
  CLI-only where the operator explicitly opts in.
"""

import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from .store import LEAD_STATUSES

# Craigslist board codes are exactly three lowercase letters ("wan", "hss").
# The category lands in a URL *path*, so this regex is a security boundary,
# not a formality — it is what keeps "../.." out.
_CATEGORY_RE = re.compile(r"^[a-z]{3}$")


class SearchIn(BaseModel):
    city: str = Field(min_length=1, max_length=80)
    state: str = Field(default="", max_length=80)
    keywords: str = Field(default="", max_length=200)
    categories: list[str] = Field(default=["wan"], max_length=4)
    max_per_source: int = Field(default=50, ge=1, le=200)
    skip_craigslist: bool = False
    skip_google: bool = False

    @field_validator("city")
    @classmethod
    def city_has_letters(cls, value):
        if not any(ch.isalnum() for ch in value):
            raise ValueError("city must contain letters")
        return value.strip()

    @field_validator("categories")
    @classmethod
    def categories_are_board_codes(cls, values):
        for value in values:
            if not _CATEGORY_RE.match(value):
                raise ValueError(f"bad category {value!r}: expected a 3-letter board code like 'wan'")
        return values


class LeadPatch(BaseModel):
    key: str = Field(min_length=1)
    status: Optional[str] = None
    user_notes: Optional[str] = Field(default=None, max_length=2000)
    next_action: Optional[str] = Field(default=None, max_length=10)  # YYYY-MM-DD or ""
    job_value: Optional[float] = Field(default=None, ge=0, le=10_000_000)

    @field_validator("status")
    @classmethod
    def status_is_known(cls, value):
        if value is not None and value not in LEAD_STATUSES:
            raise ValueError(f"status must be one of {LEAD_STATUSES}")
        return value

    @field_validator("next_action")
    @classmethod
    def next_action_is_a_date(cls, value):
        if value:  # "" is allowed and clears the date
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", value):
                raise ValueError("next_action must be YYYY-MM-DD")
        return value
