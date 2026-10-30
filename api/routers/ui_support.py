"""
Read-only helper endpoints used by the web interface (/ui).

  GET /v1/access-matrix            -> the RBAC policy matrix (Pillar 3)
  GET /v1/policy-templates         -> list of NDPA policy templates (Pillar 5)
  GET /v1/policy-templates/{name}  -> Markdown content of one template

They only require a valid login (no extra RBAC check) so that opening these
pages does not fill the audit log with noise.
"""
from pathlib import Path

import asyncpg
from fastapi import APIRouter, Depends, HTTPException

from api.services.database import get_conn
from api.middleware.rbac import get_current_user

router = APIRouter(prefix="/v1", tags=["Interface Support"])

POLICY_DIR = Path(__file__).resolve().parents[2] / "policy"


@router.get("/access-matrix", summary="RBAC policy matrix (role x sensitivity x operation)")
async def access_matrix(
    conn: asyncpg.Connection = Depends(get_conn),
    _user: dict = Depends(get_current_user),
):
    rows = await conn.fetch(
        "SELECT role, sensitivity, operation, permission FROM access_policies "
        "ORDER BY role, sensitivity, operation"
    )
    return {"policies": [dict(r) for r in rows]}


@router.get("/policy-templates", summary="List NDPA-aligned governance policy templates")
async def list_policy_templates(_user: dict = Depends(get_current_user)):
    files = sorted(POLICY_DIR.glob("*.md")) if POLICY_DIR.exists() else []
    return {"templates": [
        {"name": f.name, "title": f.stem.replace("_", " ").strip().title(), "bytes": f.stat().st_size}
        for f in files
    ]}


@router.get("/policy-templates/{name}", summary="Get one policy template (Markdown)")
async def get_policy_template(name: str, _user: dict = Depends(get_current_user)):
    path = (POLICY_DIR / name).resolve()
    if POLICY_DIR.resolve() not in path.parents or path.suffix != ".md" or not path.is_file():
        raise HTTPException(status_code=404, detail="Template not found")
    return {"name": name, "markdown": path.read_text(encoding="utf-8")}
