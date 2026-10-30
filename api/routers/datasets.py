"""
Module 1 — Metadata Catalogue API
DCAT-AP v2.1 aligned dataset CRUD with JSON-LD serialisation.
"""
from typing import Optional, List
from uuid import UUID
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.models.schemas import (
    DatasetCreate, DatasetUpdate, DatasetOut, DatasetJSONLD,
    PaginatedDatasets, MessageResponse, SensitivityClass
)
from api.services.database import get_conn
from api.middleware.rbac import require_permission

router = APIRouter(prefix="/v1/datasets", tags=["Metadata Catalogue"])


# ── POST /v1/datasets ─────────────────────────────────────────────────────────
@router.post("", response_model=DatasetOut, status_code=201,
             summary="Register a new data asset")
async def create_dataset(
    body: DatasetCreate,
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("write_metadata")),
):
    existing = await conn.fetchrow(
        "SELECT id FROM datasets WHERE identifier=$1", body.identifier
    )
    if existing:
        raise HTTPException(status_code=409,
                            detail=f"Dataset '{body.identifier}' already registered")
    row = await conn.fetchrow(
        """INSERT INTO datasets
           (identifier, title, description, creator, created_date, modified_date,
            access_rights, sensitivity_class, license_url, subject_tags, language,
            temporal_start, temporal_end, retention_period, data_location, steward_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING *""",
        body.identifier, body.title, body.description, body.creator,
        body.created_date, body.modified_date,
        body.access_rights.value, body.sensitivity_class.value,
        body.license_url, body.subject_tags, body.language,
        body.temporal_start, body.temporal_end,
        body.retention_period, body.data_location, body.steward_id
    )
    return dict(row)


# ── GET /v1/datasets ──────────────────────────────────────────────────────────
@router.get("", response_model=PaginatedDatasets,
            summary="List all registered data assets")
async def list_datasets(
    sensitivity: Optional[SensitivityClass] = None,
    steward_id:  Optional[UUID]             = None,
    tag:         Optional[str]              = None,
    page:        int                        = Query(1,  ge=1),
    per_page:    int                        = Query(20, ge=1, le=100),
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("read_metadata")),
):
    filters = ["is_active = true"]
    params: list = []
    i = 1

    if sensitivity:
        filters.append(f"sensitivity_class = ${i}"); params.append(sensitivity.value); i += 1
    if steward_id:
        filters.append(f"steward_id = ${i}"); params.append(steward_id); i += 1
    if tag:
        filters.append(f"${i} = ANY(subject_tags)"); params.append(tag); i += 1

    where = " AND ".join(filters)
    total = await conn.fetchval(f"SELECT COUNT(*) FROM datasets WHERE {where}", *params)
    rows  = await conn.fetch(
        f"""SELECT * FROM datasets WHERE {where}
            ORDER BY created_at DESC
            LIMIT ${i} OFFSET ${i+1}""",
        *params, per_page, (page - 1) * per_page
    )
    return PaginatedDatasets(
        total=total, page=page, per_page=per_page,
        items=[dict(r) for r in rows]
    )


# ── GET /v1/datasets/{dataset_id} ─────────────────────────────────────────────
@router.get("/{dataset_id}", response_model=None,   # returns DatasetOut, or JSON-LD when ?jsonld=true
            summary="Retrieve a specific data asset")
async def get_dataset(
    dataset_id: UUID,
    jsonld:     bool = Query(False, description="Return JSON-LD serialisation"),
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("read_metadata")),
):
    row = await conn.fetchrow(
        "SELECT * FROM datasets WHERE id=$1 AND is_active=true", dataset_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if jsonld:
        # Fetch latest FAIR score
        score_row = await conn.fetchrow(
            "SELECT fair_score FROM quality_scores WHERE dataset_id=$1 ORDER BY scored_at DESC LIMIT 1",
            dataset_id
        )
        ds = DatasetJSONLD(**dict(row),
                           fair_score=float(score_row["fair_score"]) if score_row else None)
        return ds.to_jsonld()

    return dict(row)


# ── PUT /v1/datasets/{dataset_id} ─────────────────────────────────────────────
@router.put("/{dataset_id}", response_model=DatasetOut,
            summary="Update metadata for a data asset")
async def update_dataset(
    dataset_id: UUID,
    body: DatasetUpdate,
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("write_metadata")),
):
    row = await conn.fetchrow(
        "SELECT * FROM datasets WHERE id=$1 AND is_active=true", dataset_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Dataset not found")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return dict(row)

    updates["updated_at"] = __import__("datetime").datetime.utcnow()
    set_clause = ", ".join(f"{k}=${i+1}" for i, k in enumerate(updates))
    params     = list(updates.values()) + [dataset_id]

    updated = await conn.fetchrow(
        f"UPDATE datasets SET {set_clause} WHERE id=${len(params)} RETURNING *",
        *params
    )
    return dict(updated)


# ── DELETE /v1/datasets/{dataset_id} ──────────────────────────────────────────
@router.delete("/{dataset_id}", response_model=MessageResponse,
               summary="Deregister a data asset (soft delete)")
async def delete_dataset(
    dataset_id: UUID,
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("write_metadata")),
):
    row = await conn.fetchrow(
        "SELECT id FROM datasets WHERE id=$1 AND is_active=true", dataset_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Dataset not found")

    await conn.execute(
        "UPDATE datasets SET is_active=false, updated_at=NOW() WHERE id=$1", dataset_id
    )
    return MessageResponse(message=f"Dataset {dataset_id} deregistered successfully")


# ── GET /v1/datasets/{dataset_id}/lineage ─────────────────────────────────────
@router.get("/{dataset_id}/lineage", summary="Get data lineage for a dataset")
async def get_lineage(
    dataset_id: UUID,
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("read_metadata")),
):
    row = await conn.fetchrow(
        "SELECT identifier FROM datasets WHERE id=$1 AND is_active=true", dataset_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Dataset not found")

    identifier = row["identifier"]
    runs = await conn.fetch(
        """SELECT * FROM lineage_runs
           WHERE input_datasets::text LIKE $1
              OR output_datasets::text LIKE $1
           ORDER BY recorded_at DESC""",
        f"%{identifier}%"
    )
    return {
        "dataset_id": str(dataset_id),
        "identifier": identifier,
        "lineage_runs": [dict(r) for r in runs],
        "total": len(runs)
    }


# ── GET /v1/datasets/{dataset_id}/fair ────────────────────────────────────────
@router.get("/{dataset_id}/fair", summary="Get FAIR quality score for a dataset")
async def get_fair_score(
    dataset_id: UUID,
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("read_metadata")),
):
    row = await conn.fetchrow(
        "SELECT * FROM datasets WHERE id=$1 AND is_active=true", dataset_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Dataset not found")

    score = await conn.fetchrow(
        "SELECT * FROM quality_scores WHERE dataset_id=$1 ORDER BY scored_at DESC LIMIT 1",
        dataset_id
    )
    if not score:
        return {"message": "No FAIR score computed yet. POST /v1/fair/{dataset_id}/score to compute."}

    return dict(score)
