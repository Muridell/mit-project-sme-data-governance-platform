# DATA CATALOGUE REGISTRATION PROCEDURE
**[Organisation Name]** | Version 1.0 | Template 3 of 5

---

## Step 1 — Identify the Data Asset
Confirm the asset is not already registered: `GET /v1/datasets?tag=<keyword>`

## Step 2 — Gather Mandatory Baseline Fields (Dublin Core)
| Field | Description | Example |
|---|---|---|
| `identifier` | Unique code for this asset | `DS-2026-CUST-001` |
| `title` | Plain-English name | `Customer Transactions Q1 2026` |
| `description` | What does this dataset contain? | `Daily sales transactions, Lagos branch` |
| `creator` | Which team created it? | `Sales Department` |
| `created_date` | When was it first created? | `2026-01-01` |
| `access_rights` | Classification level | `Confidential` |
| `sensitivity_class` | Same as access_rights | `Confidential` |

## Step 3 — Register via API
```bash
curl -X POST https://your-api/v1/datasets \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier":        "DS-2026-CUST-001",
    "title":             "Customer Transactions Q1 2026",
    "description":       "Daily sales transactions — Lagos retail branch",
    "creator":           "Sales Department",
    "created_date":      "2026-01-01",
    "access_rights":     "Confidential",
    "sensitivity_class": "Confidential",
    "subject_tags":      ["finance", "customers", "transactions"],
    "retention_period":  "7 years",
    "steward_id":        "<steward-uuid>"
  }'
```

## Step 4 — Compute FAIR Score
```bash
curl -X POST https://your-api/v1/fair/<dataset-id>/score \
  -H "Authorization: Bearer <token>"
```

## Step 5 — Review and Remediate
Check the `remediation` list in the FAIR score response and action each item.

---

---

# DATA LINEAGE DOCUMENTATION STANDARD
**[Organisation Name]** | Version 1.0 | Template 4 of 5

---

## When to Document Lineage

Document a lineage event whenever:
- Data is extracted from a source system
- Data is transformed, filtered, or aggregated
- A new dataset is produced from existing datasets
- Data is loaded into a reporting or analytics system

## Option A — Automated (Python/API)
```python
import requests, uuid
requests.post("https://your-api/v1/lineage", headers=hdrs, json={
    "job_name":  "ETL-CustomerExtract",
    "run_state": "COMPLETE",
    "input_datasets":  [{"name": "CustomerDB",          "namespace": "prod"}],
    "output_datasets": [{"name": "StagingWarehouse-v2", "namespace": "prod"}],
    "facets": {"tool": "Python pandas", "rows_processed": 15008}
})
```

## Option B — YAML Manifest (Non-Technical Stewards)
Fill in `lineage/lineage_manifest_template.yml` and upload:
```bash
curl -X POST https://your-api/v1/lineage/ingest-yaml \
  -H "Authorization: Bearer <token>" \
  -F "file=@lineage_manifest_20260115.yml"
```

## View Lineage Graph
```bash
curl https://your-api/v1/lineage/graph/ETL-CustomerExtract \
  -H "Authorization: Bearer <token>"
```

---

---

# DATA ACCESS REQUEST AND RBAC MANAGEMENT PROCEDURE
**[Organisation Name]** | Version 1.0 | Template 5 of 5

---

## Role Permissions Quick Reference

| Role | Read Metadata | Write Metadata | Read Data | Manage Access |
|---|:---:|:---:|:---:|:---:|
| **Data Owner** | ✓ All | ✓ All | ✓ All | ✓ All |
| **Data Steward** | ✓ All | ✓ Public/Int/Conf | ✓ Public/Int/Conf | ✗ |
| **Data Analyst** | ✓ Public/Int | ✗ | ✓ Public/Int | ✗ |
| **Data Consumer** | ✓ All except Restricted | ✗ | ✓ Public only | ✗ |
| **System Admin** | ✓ All | ✓ All | ✗ | ✗ |

## Requesting Access
1. Email the Data Owner with: your name, role, dataset identifier, reason for access, duration needed.
2. Data Owner reviews and approves in writing (email is acceptable).
3. System Administrator updates your user role in the system.
4. Access is recorded in the audit log automatically.

## NDPA Breach Response (s.40)
If a data breach is suspected:
1. **Immediately** notify the Data Steward and Data Owner.
2. Data Owner activates the Breach Response Plan within **1 hour**.
3. If personal data is involved, notify **NITDA within 72 hours**: ndpc@nitda.gov.ng
4. Document all actions taken in the audit log.
5. Notify affected data subjects if there is high risk to their rights (NDPA s.41).

## Register a New User
```bash
curl -X POST https://your-api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":     "newuser@company.ng",
    "full_name": "Adaeze Obi",
    "password":  "SecurePass@2026",
    "role":      "data_analyst"
  }'
```

---
*Templates 3–5 of 5 | SME Metadata Governance Framework | 2025/A/MIT/0033*
