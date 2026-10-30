"""
Module 2 — Data Lineage Tracker
OpenLineage-standard RunEvent capture + YAML manifest ingestion.
"""
import uuid
import json
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import asyncpg
import yaml
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from api.models.schemas import LineageRunCreate, LineageRunOut, MessageResponse
from api.services.database import get_conn
from api.middleware.rbac import require_permission

router = APIRouter(prefix="/v1/lineage", tags=["Data Lineage"])


# ── POST /v1/lineage — record a lineage event ─────────────────────────────────
@router.post("", response_model=LineageRunOut, status_code=201,
             summary="Record a data lineage event (OpenLineage RunEvent)")
async def record_lineage(
    body: LineageRunCreate,
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("write_metadata")),
):
    run_id      = uuid.UUID(body.run_id) if body.run_id else uuid.uuid4()
    nominal_time= body.nominal_time or datetime.now(timezone.utc)

    row = await conn.fetchrow(
        """INSERT INTO lineage_runs
           (job_name, job_namespace, run_id, run_state, nominal_time,
            input_datasets, output_datasets, facets)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *""",
        body.job_name, body.job_namespace, run_id, body.run_state.value,
        nominal_time,
        json.dumps([d.model_dump() for d in body.input_datasets])  if body.input_datasets  else None,
        json.dumps([d.model_dump() for d in body.output_datasets]) if body.output_datasets else None,
        json.dumps(body.facets) if body.facets else None,
    )
    return dict(row)


# ── GET /v1/lineage ───────────────────────────────────────────────────────────
@router.get("", summary="List all lineage runs")
async def list_lineage(
    job_name: Optional[str] = None,
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("read_metadata")),
):
    if job_name:
        rows = await conn.fetch(
            "SELECT * FROM lineage_runs WHERE job_name=$1 ORDER BY recorded_at DESC",
            job_name
        )
    else:
        rows = await conn.fetch(
            "SELECT * FROM lineage_runs ORDER BY recorded_at DESC LIMIT 100"
        )
    return {"total": len(rows), "runs": [dict(r) for r in rows]}


# ── POST /v1/lineage/ingest-yaml — manual YAML manifest ingestion ─────────────
@router.post("/ingest-yaml", response_model=MessageResponse,
             summary="Ingest lineage from plain-language YAML manifest")
async def ingest_yaml_manifest(
    file: UploadFile = File(..., description="YAML lineage manifest file"),
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("write_metadata")),
):
    """
    Accepts a plain-language YAML manifest (designed for non-technical data stewards)
    and maps it to an OpenLineage RunEvent stored in lineage_runs.

    Expected YAML format:
      data_source: "Customer DB"
      transformation_description: "Extract and clean customer records"
      output_dataset: "Staging Warehouse v2.1"
      responsible_person: "steward@company.ng"
      date_processed: "2026-01-15"
      notes: "Dropped duplicate rows (3,412 removed)"
    """
    content = await file.read()
    try:
        manifest = yaml.safe_load(content)
    except yaml.YAMLError as e:
        raise HTTPException(status_code=422, detail=f"Invalid YAML: {e}")

    required = ["data_source", "transformation_description", "output_dataset",
                "responsible_person", "date_processed"]
    missing  = [f for f in required if f not in manifest]
    if missing:
        raise HTTPException(status_code=422,
                            detail=f"Missing required fields: {', '.join(missing)}")

    # Map plain-language fields → OpenLineage schema
    job_name   = manifest["transformation_description"][:255]
    run_id     = uuid.uuid4()
    nominal_dt = datetime.fromisoformat(str(manifest["date_processed"])).replace(
        tzinfo=timezone.utc
    )
    inputs  = [{"name": manifest["data_source"],  "namespace": "sme-governance"}]
    outputs = [{"name": manifest["output_dataset"],"namespace": "sme-governance"}]
    facets  = {
        "responsible_person": manifest["responsible_person"],
        "notes": manifest.get("notes", ""),
        "source": "yaml-manifest"
    }

    await conn.execute(
        """INSERT INTO lineage_runs
           (job_name, job_namespace, run_id, run_state, nominal_time,
            input_datasets, output_datasets, facets)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
        job_name, "sme-governance", run_id, "COMPLETE", nominal_dt,
        json.dumps(inputs), json.dumps(outputs), json.dumps(facets)
    )
    return MessageResponse(
        message=f"Lineage event ingested: '{job_name}' "
                f"({manifest['data_source']} → {manifest['output_dataset']})"
    )


# ── GET /v1/lineage/graph/{job_name} — upstream/downstream graph ──────────────
@router.get("/graph/{job_name}", summary="Get lineage graph for a job")
async def lineage_graph(
    job_name: str,
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("read_metadata")),
):
    runs = await conn.fetch(
        "SELECT * FROM lineage_runs WHERE job_name=$1 ORDER BY nominal_time",
        job_name
    )
    if not runs:
        raise HTTPException(status_code=404, detail=f"No lineage found for job '{job_name}'")

    nodes, edges = set(), []
    for r in runs:
        inputs  = json.loads(r["input_datasets"])  if r["input_datasets"]  else []
        outputs = json.loads(r["output_datasets"]) if r["output_datasets"] else []
        job_node = f"JOB:{r['job_name']}"
        nodes.add(job_node)
        for inp in inputs:
            n = f"DS:{inp['name']}"; nodes.add(n)
            edges.append({"from": n, "to": job_node, "type": "input"})
        for out in outputs:
            n = f"DS:{out['name']}"; nodes.add(n)
            edges.append({"from": job_node, "to": n, "type": "output"})

    return {
        "job_name": job_name,
        "nodes": list(nodes),
        "edges": edges,
        "runs":  [dict(r) for r in runs],
    }
