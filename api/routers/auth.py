"""
Authentication routes — login, register, profile.
"""
from fastapi import APIRouter, Depends, HTTPException, status
import asyncpg

from api.models.schemas import LoginRequest, Token, UserCreate, UserOut, MessageResponse
from api.services.auth import hash_password, verify_password, create_access_token
from api.services.database import get_conn
from api.middleware.rbac import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=Token)
async def login(body: LoginRequest, conn: asyncpg.Connection = Depends(get_conn)):
    user = await conn.fetchrow(
        "SELECT * FROM users WHERE email=$1 AND is_active=true", body.email
    )
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid email or password")
    token = create_access_token({"sub": user["email"], "role": user["role"]})
    return Token(access_token=token, role=user["role"], email=user["email"])


@router.post("/register", response_model=UserOut, status_code=201)
async def register(body: UserCreate, conn: asyncpg.Connection = Depends(get_conn)):
    existing = await conn.fetchrow("SELECT id FROM users WHERE email=$1", body.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    row = await conn.fetchrow(
        """INSERT INTO users (email, full_name, hashed_password, role)
           VALUES ($1,$2,$3,$4) RETURNING *""",
        body.email, body.full_name, hash_password(body.password), body.role.value
    )
    return dict(row)


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user
