"""
RBAC Policy Engine — FastAPI dependency.

Maps HTTP method + route pattern → operation, then checks
access_policies table for (role, sensitivity_class, operation) → ALLOW/DENY.
Every decision is written to audit_log.
"""
import hashlib
import json
from typing import Optional
from uuid import UUID

import asyncpg
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.services.auth import decode_token
from api.services.database import get_conn

bearer = HTTPBearer(auto_error=False)


# ── Resolve operation from request ────────────────────────────────────────────
def resolve_operation(method: str, path: str) -> str:
    method = method.upper()
    if "/manage-access" in path or "/policies" in path:
        return "manage_access"
    if method == "GET":
        if "/data/" in path:
            return "read_data"
        return "read_metadata"
    if method in ("POST", "PUT", "PATCH", "DELETE"):
        return "write_metadata"
    return "read_metadata"


# ── Current user dependency ───────────────────────────────────────────────────
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    conn: asyncpg.Connection = Depends(get_conn),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Missing authorisation token")
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid or expired token")
    user = await conn.fetchrow(
        "SELECT id, email, full_name, role, is_active, created_at FROM users WHERE email=$1",
        payload.get("sub")
    )
    if not user or not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="User not found or inactive")
    return dict(user)


# ── Audit log writer ──────────────────────────────────────────────────────────
async def write_audit(
    conn, user: dict, dataset_id: Optional[str],
    operation: str, result: str,
    request: Request, details: dict = None
) -> None:
    # SHA-256 hash chaining for tamper detection
    last = await conn.fetchrow(
        "SELECT prev_hash, id FROM audit_log ORDER BY event_time DESC LIMIT 1"
    )
    prev = last["id"] if last else "genesis"
    chain_input = f"{prev}:{user.get('email')}:{operation}:{result}"
    prev_hash = hashlib.sha256(chain_input.encode()).hexdigest()

    await conn.execute(
        """INSERT INTO audit_log
           (user_id, user_email, user_role, dataset_id, operation,
            result, ip_address, user_agent, details, prev_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
        user.get("id"), user.get("email"), user.get("role"),
        UUID(dataset_id) if dataset_id else None,
        operation, result,
        str(request.client.host) if request.client else None,
        request.headers.get("user-agent"),
        json.dumps(details or {}),
        prev_hash
    )


# ── RBAC check dependency factory ─────────────────────────────────────────────
def require_permission(operation: Optional[str] = None):
    """
    Returns a FastAPI dependency that:
      1. Authenticates the user via JWT
      2. Resolves the operation (from arg or HTTP method)
      3. Checks access_policies for the user's role + dataset sensitivity
      4. Writes to audit_log
      5. Raises 403 if denied
    """
    async def _check(
        request: Request,
        conn:    asyncpg.Connection = Depends(get_conn),
        user:    dict               = Depends(get_current_user),
    ) -> dict:
        op = operation or resolve_operation(request.method, str(request.url.path))
        role = user["role"]

        # Try to resolve dataset sensitivity from path param or body
        sensitivity = "Public"  # default
        dataset_id  = request.path_params.get("dataset_id")
        if dataset_id:
            row = await conn.fetchrow(
                "SELECT sensitivity_class FROM datasets WHERE id=$1 AND is_active=true",
                UUID(dataset_id)
            )
            if row:
                sensitivity = row["sensitivity_class"]

        # Check policy
        policy = await conn.fetchrow(
            """SELECT permission FROM access_policies
               WHERE role=$1 AND sensitivity=$2 AND operation=$3""",
            role, sensitivity, op
        )

        result = policy["permission"] if policy else "DENY"
        await write_audit(conn, user, dataset_id, op, result, request,
                          {"sensitivity": sensitivity})

        if result != "ALLOW":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' is not permitted to '{op}' "
                       f"on '{sensitivity}' assets"
            )
        return user

    return _check
