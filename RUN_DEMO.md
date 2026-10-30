# Run the system on your laptop (supervisor demo)

## 1. One-time setup
- Install **Docker Desktop** (Windows/Mac) and start it. Wait until it says "Engine running".
- Unzip this project, open a terminal **inside the `sme_governance` folder**.

## 2. Start the system
Windows (Command Prompt):      `copy .env.example .env`
Mac/Linux / PowerShell:        `cp .env.example .env`

Then:
```
docker compose down -v        # only needed if you ran an older version before
docker compose up -d --build
docker compose ps             # wait until sme_governance_api shows "healthy" (30-60 s)
```
Open the **web interface: http://localhost:8000/ui/** (the API docs are at http://localhost:8000/docs and the health check at http://localhost:8000/health).

Optional extras: `docker compose --profile notebooks up -d` (Jupyter, large download) · `--profile tls` (nginx, needs certificates — not needed for a demo).

Stop: `docker compose down` · Wipe all data: `docker compose down -v`

## 3. Demo with the web interface (recommended)
Open **http://localhost:8000/ui/**.

1. Click **Create demo accounts** (once), then click `steward@sme.ng` to sign in (all demo passwords: `Demo@2026`).
2. **Dashboard** → **Load sample data**: 5 datasets (retail, logistics, professional services), 2 lineage runs, FAIR scores.
3. **Metadata Catalogue** → click *Customer Orders Q2 2026*: **Overview**, **JSON-LD** (DCAT-AP output), **FAIR score** (click *Recompute* for the 20-item checklist and improvement advice), **Lineage**.
4. **Data Lineage** → pick a job to see the graph; record a new event, or upload a YAML manifest (a template can be downloaded on the page).
5. **Register Dataset** → *Fill sample values* → register; the FAIR score is computed straight away.
6. **Access Control** → the role/sensitivity matrix and a live permission checker.
7. **Sign out**, sign in as `consumer@sme.ng`, go to **Register Dataset** and submit → **403 Access denied**. Note the Restricted dataset “Client Engagement Notes” cannot be opened by a Data Steward either.
8. Sign in as `admin@smegov.ng` / `Admin@SMEGov2026` → **Audit Log**: every ALLOW/DENY decision, hash-chained.
9. **Policy Templates**: the five NDPA-aligned documents.

## 3b. Demo with the raw API (Swagger) — alternative
1. **Register users** — `POST /auth/register`:
   `{"email":"steward@sme.ng","full_name":"Demo Steward","password":"Secure@2026","role":"data_steward"}`
   and again with `consumer@sme.ng` / role `data_consumer`.
2. **Login** — `POST /auth/login` as the steward. Copy `access_token`, click **Authorize** (top right), paste the token only, Authorize.
3. **Pillar 1 – Catalogue** — `POST /v1/datasets`:
```
{"identifier":"DS-2026-CUST-001","title":"Customer Transactions Q1 2026",
 "description":"Daily POS sales transactions - Lagos retail branch",
 "creator":"Sales Department","created_date":"2026-01-01",
 "access_rights":"Confidential","sensitivity_class":"Confidential",
 "subject_tags":["finance","customers","transactions"],
 "retention_period":"7 years","license_url":"https://internal.sme.ng/data-policy"}
```
   Copy the returned `id`. Then `GET /v1/datasets/{id}` with `jsonld=true` to show the DCAT-AP / JSON-LD output.
4. **Pillar 2 – Lineage** — `POST /v1/lineage`:
   `{"job_name":"ETL-CustomerExtract","run_state":"COMPLETE","input_datasets":[{"name":"CustomerDB","namespace":"prod"}],"output_datasets":[{"name":"Staging-v2","namespace":"prod"}]}`
   then `GET /v1/lineage/graph/ETL-CustomerExtract`.
5. **Pillar 4 – FAIR** — `POST /v1/fair/{id}/score` (score + remediation list), then `GET /v1/fair/catalogue/summary`.
6. **Pillar 3 – RBAC** — log in as the consumer, Authorize with that token, try `POST /v1/datasets` → **403 Forbidden**.
7. **Audit trail** — login as `admin@smegov.ng` / `Admin@SMEGov2026`, Authorize, `GET /v1/audit`.
8. **Pillar 5 – Policies** — open the `policy/` folder (5 NDPA-aligned templates).

## 4. Troubleshooting
- *Port 5432 or 8000 already in use* → stop the other program, or edit the left-hand port in `docker-compose.yml` (e.g. `"5433:5432"`).
- *API not healthy* → `docker compose logs api`.
- *Login fails after an upgrade* → run `docker compose down -v` then `up -d --build` (the seed only runs on a fresh database).
