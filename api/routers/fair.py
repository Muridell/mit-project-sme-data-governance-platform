"""
Module 4 — FAIR Quality Assurance Scorer
20-item checklist across Findable, Accessible, Interoperable, Reusable.
Each item is a verifiable binary criterion. Total score: 0–100.
"""
import json
from datetime import datetime, timezone
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException

from api.models.schemas import FAIRScoreOut
from api.services.database import get_conn
from api.middleware.rbac import require_permission

router = APIRouter(prefix="/v1/fair", tags=["FAIR Quality Assurance"])

GRADES = {(90,101):"A (Excellent)",(75,90):"B (Good)",(60,75):"C (Acceptable)",
          (40,60):"D (Needs Work)",(0,40):"F (Non-Compliant)"}

def grade(score:float)->str:
    for (lo,hi),g in GRADES.items():
        if lo<=score<hi: return g
    return "F (Non-Compliant)"


async def _score_dataset(dataset_id: UUID, conn: asyncpg.Connection, user_email: str) -> dict:
    ds = await conn.fetchrow(
        "SELECT * FROM datasets WHERE id=$1 AND is_active=true", dataset_id
    )
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    ds = dict(ds)

    # Check lineage exists
    has_lineage = await conn.fetchval(
        "SELECT COUNT(*) FROM lineage_runs WHERE input_datasets::text LIKE $1 OR output_datasets::text LIKE $1",
        f"%{ds['identifier']}%"
    )
    # Check steward assigned
    steward = None
    if ds["steward_id"]:
        steward = await conn.fetchrow("SELECT * FROM stewards WHERE id=$1", ds["steward_id"])

    # ── Checklist ──────────────────────────────────────────────────────────────
    checks = {
        # FINDABLE (max 25)
        "F1_unique_identifier":    bool(ds["identifier"]),
        "F2_searchable_catalogue": True,  # registered in this catalogue = always True
        "F3_id_in_metadata":       bool(ds["identifier"]),
        "F4_sensitivity_class":    bool(ds["sensitivity_class"]),
        "F5_subject_tags":         bool(ds["subject_tags"] and len(ds["subject_tags"]) >= 2),
        # ACCESSIBLE (max 25)
        "A1_access_rights_stated": bool(ds["access_rights"]),
        "A2_contact_point":        steward is not None,
        "A3_data_location":        bool(ds["data_location"]),
        "A4_auth_documented":      True,  # RBAC policy always enforced = True
        "A5_license_specified":    bool(ds["license_url"]),
        # INTEROPERABLE (max 25)
        "I1_standard_vocab":       True,  # DCAT-AP always used = True
        "I2_controlled_taxonomy":  bool(ds["subject_tags"] and len(ds["subject_tags"]) >= 1),
        "I3_machine_readable_fmt": bool(ds["data_location"]),
        "I4_related_datasets":     False,  # requires dct:relation — not yet in schema
        "I5_jsonld_available":     True,   # JSON-LD endpoint always available
        # REUSABLE (max 25)
        "R1_lineage_record":       has_lineage > 0,
        "R2_retention_period":     bool(ds["retention_period"]),
        "R3_steward_assigned":     steward is not None,
        "R4_ndpa_guidance":        ds["sensitivity_class"] in ("Confidential","Restricted","Internal","Public"),
        "R5_completeness_80":      None,   # computed below
    }

    # Completeness: mandatory fields filled
    mandatory = ["identifier","title","description","creator","created_date",
                 "access_rights","sensitivity_class"]
    filled = sum(1 for f in mandatory if ds.get(f))
    checks["R5_completeness_80"] = filled / len(mandatory) >= 0.80

    # ── Scores ────────────────────────────────────────────────────────────────
    f_keys = [k for k in checks if k.startswith("F")]
    a_keys = [k for k in checks if k.startswith("A")]
    i_keys = [k for k in checks if k.startswith("I")]
    r_keys = [k for k in checks if k.startswith("R")]

    def subscore(keys):
        return round(sum(5 for k in keys if checks[k]) , 2)

    f_score = subscore(f_keys)
    a_score = subscore(a_keys)
    i_score = subscore(i_keys)
    r_score = subscore(r_keys)
    total   = f_score + a_score + i_score + r_score

    # ── Remediation list ──────────────────────────────────────────────────────
    remediation_map = {
        "F5_subject_tags":       "Add at least 2 subject tags (e.g. 'finance', 'customers')",
        "A2_contact_point":      "Assign a Data Steward to this dataset",
        "A3_data_location":      "Specify the data_location field (file path or URL)",
        "A5_license_specified":  "Add a license URL (e.g. Creative Commons or internal policy URL)",
        "I2_controlled_taxonomy":"Use a controlled vocabulary for subject tags (e.g. Schema.org)",
        "I3_machine_readable_fmt":"Ensure data_location points to a machine-readable format",
        "I4_related_datasets":   "Document relationships to other datasets (future: dct:relation field)",
        "R1_lineage_record":     "Record at least one lineage event via POST /v1/lineage",
        "R2_retention_period":   "Set the retention_period field (e.g. '5 years', '2026-12-31')",
        "R3_steward_assigned":   "Assign a named Data Steward responsible for this dataset",
        "R5_completeness_80":    "Complete all mandatory metadata fields (title, description, creator, dates)",
    }
    remediation = [
        msg for key, msg in remediation_map.items()
        if not checks.get(key)
    ]

    # ── Persist score ─────────────────────────────────────────────────────────
    await conn.execute(
        """INSERT INTO quality_scores
           (dataset_id, fair_score, f_score, a_score, i_score, r_score, details, scored_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
        dataset_id, total, f_score, a_score, i_score, r_score,
        json.dumps(checks), user_email
    )

    return {
        "dataset_id":  dataset_id,
        "fair_score":  total,
        "f_score":     f_score,
        "a_score":     a_score,
        "i_score":     i_score,
        "r_score":     r_score,
        "grade":       grade(total),
        "details":     checks,
        "remediation": remediation,
        "scored_at":   datetime.now(timezone.utc),
    }


@router.post("/{dataset_id}/score", summary="Compute and store FAIR score for a dataset")
async def compute_fair_score(
    dataset_id: UUID,
    conn: asyncpg.Connection = Depends(get_conn),
    user: dict = Depends(require_permission("read_metadata")),
):
    return await _score_dataset(dataset_id, conn, user["email"])


@router.get("/{dataset_id}/score", summary="Get latest FAIR score for a dataset")
async def get_fair_score(
    dataset_id: UUID,
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("read_metadata")),
):
    row = await conn.fetchrow(
        "SELECT * FROM quality_scores WHERE dataset_id=$1 ORDER BY scored_at DESC LIMIT 1",
        dataset_id
    )
    if not row:
        raise HTTPException(status_code=404,
                            detail="No FAIR score found. POST /v1/fair/{id}/score to compute.")
    return dict(row)


@router.get("/catalogue/summary", summary="FAIR score summary across the entire catalogue")
async def catalogue_fair_summary(
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(require_permission("read_metadata")),
):
    rows = await conn.fetch(
        """SELECT d.identifier, d.title, d.sensitivity_class,
                  qs.fair_score, qs.f_score, qs.a_score, qs.i_score, qs.r_score, qs.scored_at
           FROM datasets d
           LEFT JOIN LATERAL (
               SELECT * FROM quality_scores q WHERE q.dataset_id=d.id
               ORDER BY scored_at DESC LIMIT 1
           ) qs ON true
           WHERE d.is_active=true
           ORDER BY qs.fair_score DESC NULLS LAST"""
    )
    scored    = [r for r in rows if r["fair_score"] is not None]
    unscored  = [r for r in rows if r["fair_score"] is None]
    avg_score = round(sum(r["fair_score"] for r in scored)/len(scored),1) if scored else 0

    return {
        "total_datasets": len(rows),
        "scored":         len(scored),
        "unscored":       len(unscored),
        "average_fair":   avg_score,
        "overall_grade":  grade(avg_score),
        "datasets":       [dict(r) for r in rows],
    }
