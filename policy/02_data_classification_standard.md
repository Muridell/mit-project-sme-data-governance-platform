# DATA CLASSIFICATION AND HANDLING STANDARD
**[Organisation Name]** | Version 1.0 | Effective: [Date]

---

## 1. Classification Levels

### 🟢 PUBLIC
- **Definition:** Data explicitly approved for public release with no restrictions.
- **Examples:** Marketing materials, published reports, product catalogues, public pricing.
- **NDPA Risk:** Low — no personal data.
- **Storage:** Any approved system.
- **Sharing:** Freely shareable externally.
- **Access:** All staff + external parties.

---

### 🔵 INTERNAL
- **Definition:** Data for internal use only; not for external distribution but not sensitive.
- **Examples:** Internal procedures, staff directories, operational metrics, project plans.
- **NDPA Risk:** Low-Medium — may include staff contact details.
- **Storage:** Internal systems with access controls.
- **Sharing:** Internal staff only; requires approval for any external sharing.
- **Access:** All active staff.

---

### 🟡 CONFIDENTIAL
- **Definition:** Sensitive business or personal data requiring restricted access and protection.
- **Examples:** Customer personal data, financial records, contracts, HR records, salary data.
- **NDPA Risk:** High — likely contains personal data under NDPA 2023 s.65.
- **Storage:** Encrypted systems; access-controlled databases only.
- **Sharing:** Named individuals only; written approval from Data Owner required.
- **Access:** Data Owner + explicitly approved Data Stewards and Analysts.
- **NDPA Requirement:** Must be registered in the Personal Data Processing Register.

---

### 🔴 RESTRICTED
- **Definition:** Highest sensitivity — legal obligation, competitive risk, or individual harm if disclosed.
- **Examples:** Medical records, financial account numbers, passwords, legal privilege documents, M&A data.
- **NDPA Risk:** Very High — special category data (NDPA s.30) or critical business data.
- **Storage:** Encrypted at rest and in transit; dedicated secure storage only.
- **Sharing:** Explicit written authorisation from Data Owner + notification to Data Steward.
- **Access:** Data Owner only by default; exceptions require documented approval.
- **NDPA Requirement:** Data Protection Impact Assessment (DPIA) required before processing.

---

## 2. Classification Decision Tree

```
Is this data publicly available already?
  YES → PUBLIC
  NO  → Does it contain personal data (names, emails, phone, ID, financial)?
          YES → Is it medical, financial account, or legal privilege data?
                  YES → RESTRICTED
                  NO  → CONFIDENTIAL
          NO  → Is it for internal use only?
                  YES → INTERNAL
                  NO  → PUBLIC
```

---

## 3. Handling Requirements Matrix

| Requirement | Public | Internal | Confidential | Restricted |
|---|:---:|:---:|:---:|:---:|
| Encryption at rest | ✗ | Recommended | ✓ Required | ✓ Required |
| Encryption in transit | Recommended | ✓ Required | ✓ Required | ✓ Required |
| Access logging | ✗ | Recommended | ✓ Required | ✓ Required |
| RBAC enforcement | ✗ | ✓ Required | ✓ Required | ✓ Required |
| Retention period documented | Recommended | ✓ Required | ✓ Required | ✓ Required |
| NDPA Processing Register | ✗ | If staff data | ✓ Required | ✓ Required |
| DPIA required | ✗ | ✗ | If high volume | ✓ Required |
| Annual review | ✗ | ✓ Required | ✓ Required | ✓ Required |

---

## 4. Retention Periods (Defaults — override per asset)

| Data Type | Default Retention |
|---|---|
| Customer transaction records | 7 years (tax obligation) |
| Employee HR records | Duration of employment + 7 years |
| Marketing contact data | 2 years from last interaction |
| Financial statements | 7 years |
| Contracts | Duration + 7 years |
| System access logs | 2 years |
| Breach investigation records | 5 years |

---

*Template 2 of 5 | SME Metadata Governance Framework | 2025/A/MIT/0033*
