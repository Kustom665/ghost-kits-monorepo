"""FastAPI app factory.

Every route is `def`, never `async def`: Starlette runs sync routes on its
threadpool, so blocking sqlite3 calls can never stall the event loop. That
one rule replaces remembering run_in_threadpool at every call site.

No CORS middleware on purpose — the page is served same-origin, and a `*`
origin on a scraper endpoint is exactly the door not to open.
"""

import csv
import hmac
import io
import os

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.responses import FileResponse, JSONResponse

from .. import __version__
from ..models import CSV_FIELDS
from ..pipeline import SearchRequest
from .config import JOB_MAX_SECONDS, db_path, load_or_create_token
from .jobs import JobRunner
from .schemas import LeadPatch, SearchIn
from .store import Store

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

EXPORT_FIELDS = CSV_FIELDS + ["status", "user_notes", "next_action", "job_value", "called_at"]


def _job_payload(job: dict) -> dict:
    return {
        "job_id": job["id"],
        "status": job["status"],
        "phase": job["phase"],
        "error": job["error"],
        "sources": job["sources"],
        "found": job["found"],
        "new_count": job["new_count"],
        "created_at": job["created_at"],
        "started_at": job["started_at"],
        "finished_at": job["finished_at"],
    }


def _lead_payload(row: dict) -> dict:
    return {
        "key": row["key"],
        "source": row["source"],
        "title": row["title"],
        "url": row["url"],
        "phone": row["phone"],
        "email": row["email"],
        "address": row["address"],
        "notes": row["notes"],
        "status": row["status"],
        "user_notes": row["user_notes"],
        "next_action": row["next_action"],
        "job_value": row["job_value"],
        "called_at": row["called_at"],
        "first_seen": row["first_seen"],
        "last_seen": row["last_seen"],
    }


def create_app(store: Store = None, runner: JobRunner = None, token: str = None) -> FastAPI:
    store = store or Store(db_path())
    runner = runner or JobRunner(store)
    token = token if token is not None else load_or_create_token()

    app = FastAPI(title="Lead Scraper", version=__version__, docs_url=None, redoc_url=None)
    app.state.store = store
    app.state.runner = runner
    app.state.token = token

    def require_token(authorization: str = Header(default="")) -> None:
        supplied = authorization.removeprefix("Bearer ").strip()
        if not supplied or not hmac.compare_digest(supplied, token):
            raise HTTPException(status_code=401, detail="bad or missing token")

    auth = Depends(require_token)

    # ------------------------------------------------------------- page

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"), media_type="text/html")

    # ------------------------------------------------------------- meta

    @app.get("/api/health")
    def health():
        return {"ok": True, "version": __version__, "auth_required": True}

    # ---------------------------------------------------------- searches

    @app.post("/api/searches", status_code=202, dependencies=[auth])
    def start_search(body: SearchIn):
        running = store.running_job_id()
        if running:
            return JSONResponse(
                status_code=409,
                content={"detail": "a search is already running", "job_id": running},
            )
        req = SearchRequest(
            city=body.city,
            state=body.state,
            keywords=body.keywords or SearchRequest.__dataclass_fields__["keywords"].default,
            categories=tuple(body.categories),
            max_per_source=body.max_per_source,
            skip_craigslist=body.skip_craigslist,
            skip_google=body.skip_google,
        )
        job_id = store.create_job(body.model_dump())
        runner.submit(job_id, req)
        job = store.get_job(job_id)
        return {"job_id": job_id, "status": job["status"], "created_at": job["created_at"]}

    @app.get("/api/searches/{job_id}", dependencies=[auth])
    def get_search(job_id: str):
        job = store.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="no such job")
        return _job_payload(job)

    @app.post("/api/searches/{job_id}/cancel", status_code=202, dependencies=[auth])
    def cancel_search(job_id: str):
        if not store.get_job(job_id):
            raise HTTPException(status_code=404, detail="no such job")
        accepted = store.request_cancel(job_id)
        return {
            "job_id": job_id,
            "cancelling": accepted,
            # honest: between-source only, urllib3 backoff is not interruptible
            "note": "stops after the current source finishes",
        }

    # ------------------------------------------------------------- leads

    @app.get("/api/leads", dependencies=[auth])
    def list_leads(
        status: str = Query(default=None),
        has_phone: bool = Query(default=None),
        limit: int = Query(default=200, ge=1, le=1000),
        offset: int = Query(default=0, ge=0),
    ):
        total, rows = store.list_leads(status=status, has_phone=has_phone, limit=limit, offset=offset)
        return {"total": total, "leads": [_lead_payload(r) for r in rows]}

    @app.patch("/api/leads", dependencies=[auth])
    def patch_lead(body: LeadPatch):
        # Key travels in the body: dedupe keys are URLs, and URL-in-path
        # percent-encoding is a reliable source of double-decode bugs.
        row = store.update_lead(
            body.key,
            status=body.status,
            user_notes=body.user_notes,
            next_action=body.next_action,
            job_value=body.job_value,
        )
        if row is None:
            raise HTTPException(status_code=404, detail="no such lead")
        return _lead_payload(row)

    @app.get("/api/leads.csv", dependencies=[auth])
    def export_csv():
        _, rows = store.list_leads(limit=100_000)
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=EXPORT_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: ("" if row.get(k) is None else row.get(k)) for k in EXPORT_FIELDS})
        return Response(
            content=buffer.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=leads.csv"},
        )

    # ------------------------------------------------------------- stats

    @app.get("/api/stats", dependencies=[auth])
    def stats():
        return store.stats()

    return app
