"""
Steward management and audit log endpoints.
"""
from uuid import UUID
from typing import Optional
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query

from api.models.schemas import StewardCreate, StewardOut, AuditLogOut
from api.services.database import get_conn
from api.middleware.rbac import require_permission

router = APIRouter(tags=["Stewards & Audit"])


# ── Stewards ──────────────────────────────────────────────────────────────────
@router.post("/v1/stewards", response_model=StewardOut, status_code=201)
async def create_steward(
    body: StewardCreate,
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("write_metadata")),
):
    existing = await conn.fetchrow("SELECT id FROM stewards WHERE email=$1", body.email)
    if existing:
        raise HTTPException(status_code=409, detail="Steward email already registered")
    row = await conn.fetchrow(
        "INSERT INTO stewards (name,email,role,department) VALUES ($1,$2,$3,$4) RETURNING *",
        body.name, body.email, body.role, body.department
    )
    return dict(row)


@router.get("/v1/stewards", response_model=list[StewardOut])
async def list_stewards(
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("read_metadata")),
):
    rows = await conn.fetch("SELECT * FROM stewards ORDER BY name")
    return [dict(r) for r in rows]


@router.get("/v1/stewards/{steward_id}", response_model=StewardOut)
async def get_steward(
    steward_id: UUID,
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("read_metadata")),
):
    row = await conn.fetchrow("SELECT * FROM stewards WHERE id=$1", steward_id)
    if not row:
        raise HTTPException(status_code=404, detail="Steward not found")
    return dict(row)


# ── Audit Log ─────────────────────────────────────────────────────────────────
@router.get("/v1/audit", summary="View immutable audit log")
async def get_audit_log(
    user_email: Optional[str] = None,
    operation:  Optional[str] = None,
    result:     Optional[str] = None,
    limit:      int           = Query(50, ge=1, le=200),
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("read_metadata")),
):
    filters = []
    params: list = []
    i = 1

    if user_email:
        filters.append(f"user_email=${ i}"); params.append(user_email); i += 1
    if operation:
        filters.append(f"operation=${i}"); params.append(operation); i += 1
    if result:
        filters.append(f"result=${i}"); params.append(result); i += 1

    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    rows  = await conn.fetch(
        f"SELECT * FROM audit_log {where} ORDER BY event_time DESC LIMIT ${i}",
        *params, limit
    )
    return {"total": len(rows), "entries": [dict(r) for r in rows]}
