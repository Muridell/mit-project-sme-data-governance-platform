"""
SME Metadata Governance Framework — FastAPI Application
Author : Murtadha Oduntan | 2025/A/MIT/0033 | Miva Open University
Version: 1.0.0
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.services.database import get_pool, close_pool
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from api.routers import auth, datasets, lineage, fair, stewards, ui_support


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()           # warm the connection pool on startup
    yield
    await close_pool()         # clean shutdown


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "SME Metadata Governance Framework API",
    description = (
        "A lightweight, DCAT-AP aligned Metadata Management and Data Governance "
        "Framework for SMEs in emerging markets.\n\n"
        "**MIT Final Project** | Murtadha Oduntan | 2025/A/MIT/0033 | Miva Open University\n\n"
        "### Five Pillars\n"
        "1. **Metadata Catalogue** — DCAT-AP v2.1 / Dublin Core / JSON-LD\n"
        "2. **Data Lineage** — OpenLineage standard + YAML manifest ingestion\n"
        "3. **RBAC Policy Engine** — NIST Core RBAC with 5 roles & immutable audit log\n"
        "4. **FAIR Quality Assurance** — 20-item checklist, 0–100 score, remediation list\n"
        "5. **Governance Policy Templates** — 5 NDPA-aligned Markdown templates\n"
    ),
    version     = "1.0.0",
    contact     = {"name": "Murtadha Oduntan", "email": "admin@smegov.ng"},
    license_info= {"name": "MIT License"},
    lifespan    = lifespan,
    docs_url    = "/docs",
    redoc_url   = "/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins    = os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials= True,
    allow_methods    = ["*"],
    allow_headers    = ["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(datasets.router)
app.include_router(lineage.router)
app.include_router(fair.router)
app.include_router(stewards.router)
app.include_router(ui_support.router)

# ── Web interface (static files, served at /ui) ───────────────────────────────
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/ui", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="ui")


# ── Health & root ─────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "SME Metadata Governance Framework",
        "version": "1.0.0",
        "status":  "running",
        "docs":    "/docs",
        "ui":      "/ui/",
        "pillars": ["metadata_catalogue","data_lineage","rbac","fair_quality","policy_templates"]
    }


@app.get("/health", tags=["Health"])
async def health():
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return JSONResponse(status_code=503,
                            content={"status": "unhealthy", "error": str(e)})
