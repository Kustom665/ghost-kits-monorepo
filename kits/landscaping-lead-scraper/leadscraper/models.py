"""Lead record shared by every source."""

from dataclasses import asdict, dataclass, field

CSV_FIELDS = ["source", "title", "url", "phone", "email", "address", "notes"]


@dataclass
class Lead:
    source: str
    title: str
    url: str = ""
    phone: str = ""
    email: str = ""
    address: str = ""
    notes: str = ""

    def as_row(self) -> dict:
        return {k: (v or "") for k, v in asdict(self).items()}


@dataclass
class SourceResult:
    """What a source returns: its leads plus a human-readable status line."""

    name: str
    leads: list = field(default_factory=list)
    error: str = ""

    @property
    def ok(self) -> bool:
        return not self.error
