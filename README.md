# SME Metadata Governance Framework

**Development of a Framework for Metadata Management and Data Governance for SMEs**

> MIT Final Project | Murtadha Oduntan | 2025/A/MIT/0033 | Miva Open University

---

## Overview

A production-ready, open-source **Metadata Management and Data Governance Framework** built specifically for Small and Medium-sized Enterprises (SMEs) in African emerging markets. Aligned with DCAT-AP v2.1, OpenLineage, NIST Core RBAC, FAIR principles, and the Nigeria Data Protection Act 2023.

### Five Pillars

| # | Pillar | Standard | Endpoint |
|---|---|---|---|
| 1 | **Metadata Catalogue** | DCAT-AP v2.1 / Dublin Core / JSON-LD | `POST /v1/datasets` |
| 2 | **Data Lineage Tracker** | OpenLineage + YAML manifest | `POST /v1/lineage` |
| 3 | **RBAC Policy Engine** | NIST Core RBAC + JWT + Audit log | Middleware (all routes) |
| 4 | **FAIR Quality Assurance** | FAIR Principles — 20-item, 0–100 score | `POST /v1/fair/{id}/score` |
| 5 | **Governance Policy Templates** | NDPA 2023 aligned | `./policy/` directory |

---

## Quick Start — Docker Compose (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/sme-governance.git
cd sme-governance

# 2. Configure environment
cp .env.example .env
# Edit .env — set DB_PASSWORD and JWT_SECRET

# 3. Launch the complete stack
docker compose up -d

# 4. Verify all services are healthy
docker compose ps

# 5. Open interactive API documentation
open http://localhost:8000/docs
```

Services started: **API** → http://localhost:8000 (Swagger UI at /docs) and **Database** → localhost:5432.
Optional: `--profile notebooks` (Jupyter, http://localhost:8888) and `--profile tls` (nginx; needs certificates).
**Web interface:** http://localhost:8000/ui/ — see **RUN_DEMO.md** for a step-by-step laptop demo script.

---

## Cloud Deployment

### Option A — Railway.app (Recommended for quick deploy)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up

# Set environment variables
railway variables set DB_PASSWORD=<your-password>
railway variables set JWT_SECRET=<random-64-chars>
```

### Option B — Render.com

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your repository — Render reads `render.yaml` automatically
4. Set environment variables in the Render dashboard
5. Deploy → your API is live at `https://your-app.onrender.com`

### Option C — AWS EC2

```bash
# On Ubuntu 22.04 EC2 instance (t2.micro Free Tier)
sudo apt update && sudo apt install -y docker.io docker-compose-v2
git clone https://github.com/yourusername/sme-governance.git
cd sme-governance
cp .env.example .env && nano .env   # set secrets
docker compose up -d
```

---

## API Reference

### Authentication

```bash
# Login
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@smegov.ng","password":"Admin@SMEGov2026"}'

# Register a new user
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"steward@sme.ng","full_name":"Demo Steward",
       "password":"Secure@2026","role":"data_steward"}'
```

### Module 1 — Register a Dataset

```bash
TOKEN="your-jwt-token"

curl -X POST http://localhost:8000/v1/datasets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier":        "DS-2026-CUST-001",
    "title":             "Customer Transactions Q1 2026",
    "description":       "Daily POS sales transactions — Lagos retail branch",
    "creator":           "Sales Department",
    "created_date":      "2026-01-01",
    "access_rights":     "Confidential",
    "sensitivity_class": "Confidential",
    "subject_tags":      ["finance", "customers", "transactions"],
    "retention_period":  "7 years",
    "license_url":       "https://internal.sme.ng/data-policy"
  }'

# Get JSON-LD representation
curl "http://localhost:8000/v1/datasets/{id}?jsonld=true" \
  -H "Authorization: Bearer $TOKEN"
```

### Module 2 — Record Lineage

```bash
# Automated API call
curl -X POST http://localhost:8000/v1/lineage \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_name":  "ETL-CustomerExtract",
    "run_state": "COMPLETE",
    "input_datasets":  [{"name": "CustomerDB", "namespace": "prod"}],
    "output_datasets": [{"name": "Staging-v2", "namespace": "prod"}]
  }'

# YAML manifest upload (for non-technical stewards)
curl -X POST http://localhost:8000/v1/lineage/ingest-yaml \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@lineage/lineage_manifest_template.yml"

# View lineage graph
curl http://localhost:8000/v1/lineage/graph/ETL-CustomerExtract \
  -H "Authorization: Bearer $TOKEN"
```

### Module 4 — Compute FAIR Score

```bash
# Score a specific dataset
curl -X POST http://localhost:8000/v1/fair/{dataset_id}/score \
  -H "Authorization: Bearer $TOKEN"

# Catalogue-wide FAIR summary
curl http://localhost:8000/v1/fair/catalogue/summary \
  -H "Authorization: Bearer $TOKEN"
```

---

## Project Structure

```
sme_governance/
├── api/
│   ├── main.py                  # FastAPI application entry point
│   ├── routers/
│   │   ├── auth.py              # Authentication (login, register)
│   │   ├── datasets.py          # Module 1 — Metadata Catalogue API
│   │   ├── lineage.py           # Module 2 — Data Lineage Tracker
│   │   ├── fair.py              # Module 4 — FAIR Quality Scorer
│   │   └── stewards.py          # Steward management + Audit log
│   ├── models/
│   │   └── schemas.py           # Pydantic v2 request/response schemas
│   ├── middleware/
│   │   └── rbac.py              # Module 3 — RBAC Policy Engine
│   └── services/
│       ├── database.py          # asyncpg connection pool
│       └── auth.py              # JWT + bcrypt auth service
├── sql/
│   └── init.sql                 # Complete PostgreSQL DDL + RBAC seed
├── policy/
│   ├── 01_data_governance_policy.md
│   ├── 02_data_classification_standard.md
│   └── 03_04_05_procedures.md
├── lineage/
│   └── lineage_manifest_template.yml
├── notebooks/
│   └── fair_scorer.ipynb        # FAIR quality dashboard
├── tests/
│   └── test_all.py              # 84 automated tests
├── scripts/
│   └── nginx.conf               # NGINX reverse proxy config
├── docker-compose.yml           # Complete stack deployment
├── Dockerfile                   # Multi-stage production build
├── railway.toml                 # Railway.app deployment config
├── render.yaml                  # Render.com deployment config
├── requirements.txt             # Python dependencies (pinned)
├── .env.example                 # Environment variable template
└── README.md
```

---

## Running Tests

```bash
# Install dependencies
pip install -r requirements.txt

# Run all 84 tests
pytest tests/ -v

# Run with coverage report
pytest tests/ -v --cov=api --cov-report=term-missing

# Run specific module tests
pytest tests/ -v -k "TestDatasetSchema"
pytest tests/ -v -k "TestRBAC"
pytest tests/ -v -k "TestFAIR"
```

---

## Default Credentials (Change Before Production)

| Field | Value |
|---|---|
| Admin email | `admin@smegov.ng` |
| Admin password | `Admin@SMEGov2026` |
| Jupyter token | `smegov2026` |

> ⚠️ **Always change all default credentials before deploying to production.**

---

## RBAC Roles

| Role | Read Metadata | Write Metadata | Read Data | Manage Access |
|---|:---:|:---:|:---:|:---:|
| `data_owner` | ✓ All | ✓ All | ✓ All | ✓ All |
| `data_steward` | ✓ All | ✓ Public/Int/Conf | ✓ Public/Int/Conf | ✗ |
| `data_analyst` | ✓ Public/Int | ✗ | ✓ Public/Int | ✗ |
| `data_consumer` | ✓ excl. Restricted | ✗ | ✓ Public only | ✗ |
| `system_admin` | ✓ All | ✓ All | ✗ | ✗ |

---

## Tech Stack

| Component | Technology |
|---|---|
| API Framework | FastAPI 0.111 + Uvicorn |
| Database | PostgreSQL 15 (asyncpg) |
| Authentication | JWT (python-jose) + bcrypt |
| Schema Standard | DCAT-AP v2.1 + Dublin Core |
| Lineage Standard | OpenLineage 1.9.0 |
| Quality Framework | FAIR Principles (20-item checklist) |
| Containerisation | Docker + Docker Compose |
| Testing | pytest 7.4 (84 tests) |
| Notebooks | Jupyter Lab 4.0 + pandas + matplotlib |

---

## Academic Context

This system implements the framework described in:

> **Development of a Framework for Metadata Management and Data Governance for SMEs**
> Murtadha Oduntan | Matric No: 2025/A/MIT/0033
> MIT Final Project | Miva Open University, Abuja, Nigeria | June 2026

---

*© 2026 Murtadha Oduntan. Open-source under MIT License.*
