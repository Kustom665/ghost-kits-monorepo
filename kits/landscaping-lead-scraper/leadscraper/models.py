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
    """What a source returns: its leads plus a human-readable status line.

    `error` means the source produced nothing; `warnings` means it produced
    leads but part of the sweep failed (e.g. one board 404'd). A source with
    warnings is still ok — degraded is not dead.
    """

    name: str
    leads: list = field(default_factory=list)
    error: str = ""
    warnings: list = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.error
