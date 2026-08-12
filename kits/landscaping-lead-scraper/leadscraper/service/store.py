"""SQLite persistence for leads, call state, and scrape jobs.

Design rules:
- Leads are keyed by `extract.dedupe_key`, the same stable key the CSV dedupe
  uses, so a lead re-scraped tomorrow maps onto the row you already worked.
- The upsert refreshes scraped fields only. status / user_notes / next_action /
  job_value / called_at / first_seen are never touched by a scrape — "I already
  called this one" survives every re-search.
- A fresh connection per operation plus WAL journaling: the scrape worker
  thread and the request threadpool both write, and a shared connection with
  check_same_thread=False is the classic wrong answer here.
"""

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

from ..extract import dedupe_key

LEAD_STATUSES = ("new", "called", "follow_up", "won", "lost")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS leads (
  key         TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  title       TEXT NOT NULL,
  url         TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'new',
  user_notes  TEXT NOT NULL DEFAULT '',
  next_action TEXT,
  job_value   REAL,
  called_at   TEXT,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  last_job    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

CREATE TABLE IF NOT EXISTS jobs (
  id               TEXT PRIMARY KEY,
  status           TEXT NOT NULL,
  phase            TEXT NOT NULL DEFAULT '',
  params_json      TEXT NOT NULL,
  sources_json     TEXT NOT NULL DEFAULT '[]',
  found            INTEGER NOT NULL DEFAULT 0,
  new_count        INTEGER NOT NULL DEFAULT 0,
  error            TEXT NOT NULL DEFAULT '',
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  started_at       TEXT,
  finished_at      TEXT
);
"""

_LEAD_COLUMNS = (
    "key", "source", "title", "url", "phone", "email", "address", "notes",
    "status", "user_notes", "next_action", "job_value", "called_at",
    "first_seen", "last_seen", "last_job",
)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class Store:
    def __init__(self, path: str):
        self.path = path
        directory = os.path.dirname(os.path.abspath(path))
        os.makedirs(directory, exist_ok=True)
        self.init_schema()

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.path, timeout=5.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def init_schema(self):
        with self._conn() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(_SCHEMA)

    # ---------------------------------------------------------- leads

    def upsert_leads(self, leads, job_id: str = "") -> int:
        """Insert or refresh scraped leads. Returns how many keys were new."""
        now = _now()
        new_count = 0
        with self._conn() as conn:
            for lead in leads:
                key = dedupe_key(lead)
                if not key:
                    continue
                existed = conn.execute("SELECT 1 FROM leads WHERE key = ?", (key,)).fetchone()
                conn.execute(
                    """
                    INSERT INTO leads (key, source, title, url, phone, email, address,
                                       notes, first_seen, last_seen, last_job)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(key) DO UPDATE SET
                      title=excluded.title, url=excluded.url, phone=excluded.phone,
                      email=excluded.email, address=excluded.address,
                      notes=excluded.notes, last_seen=excluded.last_seen,
                      last_job=excluded.last_job
                    """,
                    (key, lead.source, lead.title, lead.url, lead.phone,
                     lead.email, lead.address, lead.notes, now, now, job_id),
                )
                if not existed:
                    new_count += 1
        return new_count

    def list_leads(self, status=None, has_phone=None, limit=200, offset=0):
        """Returns (total, rows) in Today order: due follow-ups first, then
        fresh leads with phone numbers, then everything else."""
        where, params = [], []
        if status:
            where.append("status = ?")
            params.append(status)
        if has_phone is True:
            where.append("phone != ''")
        elif has_phone is False:
            where.append("phone = ''")
        clause = f"WHERE {' AND '.join(where)}" if where else ""

        order = """
            ORDER BY
              (status = 'follow_up' AND next_action IS NOT NULL AND next_action <= ?) DESC,
              (status = 'new' AND phone != '') DESC,
              last_seen DESC,
              key
        """
        with self._conn() as conn:
            total = conn.execute(f"SELECT COUNT(*) FROM leads {clause}", params).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM leads {clause} {order} LIMIT ? OFFSET ?",
                [*params, _today(), limit, offset],
            ).fetchall()
        return total, [dict(row) for row in rows]

    def update_lead(self, key: str, status=None, user_notes=None, next_action=None, job_value=None):
        """Update call state. Returns the updated row, or None if unknown key."""
        sets, params = [], []
        if status is not None:
            if status not in LEAD_STATUSES:
                raise ValueError(f"bad status {status!r}")
            sets.append("status = ?")
            params.append(status)
            if status == "called":
                sets.append("called_at = ?")
                params.append(_now())
        if user_notes is not None:
            sets.append("user_notes = ?")
            params.append(user_notes)
        if next_action is not None:
            sets.append("next_action = ?")
            params.append(next_action or None)  # "" clears the date
        if job_value is not None:
            sets.append("job_value = ?")
            params.append(job_value if job_value != 0 else None)
        if not sets:
            return self.get_lead(key)
        with self._conn() as conn:
            cur = conn.execute(f"UPDATE leads SET {', '.join(sets)} WHERE key = ?", [*params, key])
            if cur.rowcount == 0:
                return None
        return self.get_lead(key)

    def get_lead(self, key: str):
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM leads WHERE key = ?", (key,)).fetchone()
        return dict(row) if row else None

    def stats(self):
        """Per-source funnel: your real numbers, not the brochure's."""
        with self._conn() as conn:
            rows = conn.execute(
                """
                SELECT source,
                       COUNT(*)                                   AS leads,
                       SUM(status != 'new')                       AS contacted,
                       SUM(status = 'won')                        AS won,
                       COALESCE(SUM(CASE WHEN status='won' THEN job_value END), 0) AS revenue
                FROM leads GROUP BY source ORDER BY source
                """
            ).fetchall()
        sources = []
        for row in rows:
            contacted = row["contacted"] or 0
            won = row["won"] or 0
            sources.append({
                "source": row["source"],
                "leads": row["leads"],
                "contacted": contacted,
                "won": won,
                "win_rate": round(won / contacted, 3) if contacted else None,
                "revenue": round(row["revenue"], 2),
            })
        totals = {
            "leads": sum(s["leads"] for s in sources),
            "contacted": sum(s["contacted"] for s in sources),
            "won": sum(s["won"] for s in sources),
            "revenue": round(sum(s["revenue"] for s in sources), 2),
        }
        totals["win_rate"] = (
            round(totals["won"] / totals["contacted"], 3) if totals["contacted"] else None
        )
        return {"sources": sources, "totals": totals}

    # ---------------------------------------------------------- jobs

    def create_job(self, params: dict) -> str:
        job_id = uuid.uuid4().hex
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO jobs (id, status, params_json, created_at) VALUES (?,?,?,?)",
                (job_id, "queued", json.dumps(params), _now()),
            )
        return job_id

    def get_job(self, job_id: str):
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            return None
        job = dict(row)
        job["params"] = json.loads(job.pop("params_json"))
        job["sources"] = json.loads(job.pop("sources_json"))
        return job

    def running_job_id(self):
        with self._conn() as conn:
            row = conn.execute(
                "SELECT id FROM jobs WHERE status IN ('queued','running') "
                "ORDER BY created_at DESC LIMIT 1"
            ).fetchone()
        return row["id"] if row else None

    def mark_job_running(self, job_id: str):
        with self._conn() as conn:
            conn.execute(
                "UPDATE jobs SET status='running', started_at=? WHERE id=?", (_now(), job_id)
            )

    def update_progress(self, job_id: str, phase: str, sources: list):
        with self._conn() as conn:
            conn.execute(
                "UPDATE jobs SET phase=?, sources_json=? WHERE id=?",
                (phase, json.dumps(sources), job_id),
            )

    def finish_job(self, job_id: str, status: str, sources: list, found: int,
                   new_count: int, error: str = ""):
        with self._conn() as conn:
            conn.execute(
                "UPDATE jobs SET status=?, error=?, sources_json=?, found=?, "
                "new_count=?, finished_at=?, phase='' WHERE id=?",
                (status, error, json.dumps(sources), found, new_count, _now(), job_id),
            )

    def request_cancel(self, job_id: str) -> bool:
        with self._conn() as conn:
            cur = conn.execute(
                "UPDATE jobs SET cancel_requested=1 WHERE id=? "
                "AND status IN ('queued','running')",
                (job_id,),
            )
            return cur.rowcount > 0

    def is_cancelled(self, job_id: str) -> bool:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT cancel_requested FROM jobs WHERE id=?", (job_id,)
            ).fetchone()
        return bool(row and row["cancel_requested"])

    def fail_orphaned_jobs(self) -> int:
        """Startup hygiene: a job still 'running' after a restart is dead."""
        with self._conn() as conn:
            cur = conn.execute(
                "UPDATE jobs SET status='error', error='server restarted mid-job', "
                "finished_at=? WHERE status IN ('queued','running')",
                (_now(),),
            )
            return cur.rowcount
