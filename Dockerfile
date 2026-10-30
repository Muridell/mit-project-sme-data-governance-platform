# ═══════════════════════════════════════════════════════════════
#  SME Metadata Governance Framework — Dockerfile
#  Multi-stage build: builder → production
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: builder ──────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
 && pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt


# ── Stage 2: production ───────────────────────────────────────
FROM python:3.11-slim

LABEL maintainer="Murtadha Oduntan <admin@smegov.ng>"
LABEL description="SME Metadata Governance Framework API"
LABEL version="1.0.0"

# Runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy wheels and install
COPY --from=builder /wheels /wheels
COPY requirements.txt .
RUN pip install --no-cache /wheels/*

# Copy application code
COPY api/       ./api/
COPY sql/       ./sql/
COPY policy/    ./policy/
COPY frontend/  ./frontend/

# Non-root user for security
RUN useradd -m -u 1001 govuser && chown -R govuser:govuser /app
USER govuser

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", "--log-level", "info"]
