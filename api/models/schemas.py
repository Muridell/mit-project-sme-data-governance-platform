"""
Pydantic v2 schemas — DCAT-AP v2.1 aligned.
All mandatory Dublin Core baseline fields are required.
"""
from __future__ import annotations
from datetime import date, datetime
from typing import List, Optional, Dict, Any
from enum import Enum
from uuid import UUID
from pydantic import BaseModel, EmailStr, field_validator, model_validator
import re


# ── Enumerations ──────────────────────────────────────────────────────────────
class SensitivityClass(str, Enum):
    PUBLIC       = "Public"
    INTERNAL     = "Internal"
    CONFIDENTIAL = "Confidential"
    RESTRICTED   = "Restricted"


class RunState(str, Enum):
    START    = "START"
    COMPLETE = "COMPLETE"
    FAIL     = "FAIL"
    ABORT    = "ABORT"


class UserRole(str, Enum):
    DATA_OWNER    = "data_owner"
    DATA_STEWARD  = "data_steward"
    DATA_ANALYST  = "data_analyst"
    DATA_CONSUMER = "data_consumer"
    SYSTEM_ADMIN  = "system_admin"


class Operation(str, Enum):
    READ_METADATA  = "read_metadata"
    WRITE_METADATA = "write_metadata"
    READ_DATA      = "read_data"
    MANAGE_ACCESS  = "manage_access"


# ── Steward ───────────────────────────────────────────────────────────────────
class StewardCreate(BaseModel):
    name:       str
    email:      EmailStr
    role:       str
    department: Optional[str] = None


class StewardOut(StewardCreate):
    id:         UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Distribution ──────────────────────────────────────────────────────────────
class DistributionCreate(BaseModel):
    title:        Optional[str]  = None
    access_url:   str
    download_url: Optional[str]  = None
    format:       Optional[str]  = None
    byte_size:    Optional[int]  = None


class DistributionOut(DistributionCreate):
    id:         UUID
    dataset_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Dataset ───────────────────────────────────────────────────────────────────
class DatasetCreate(BaseModel):
    # ── Mandatory baseline (8 Dublin Core) ───────────────────
    identifier:        str
    title:             str
    description:       str
    creator:           str
    created_date:      date
    access_rights:     SensitivityClass
    sensitivity_class: SensitivityClass

    # ── Recommended extended (DCAT-AP) ───────────────────────
    modified_date:    Optional[date]      = None
    license_url:      Optional[str]       = None
    subject_tags:     Optional[List[str]] = None
    language:         Optional[str]       = "en"
    temporal_start:   Optional[date]      = None
    temporal_end:     Optional[date]      = None

    # ── SME custom extensions ─────────────────────────────────
    retention_period: Optional[str]  = None
    data_location:    Optional[str]  = None
    steward_id:       Optional[UUID] = None

    @field_validator("identifier")
    @classmethod
    def identifier_format(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("identifier must not be empty")
        if not re.match(r'^[A-Za-z0-9\-_\.]+$', v):
            raise ValueError("identifier may only contain letters, digits, hyphens, underscores, dots")
        return v

    @field_validator("title", "description", "creator")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("field must not be empty")
        return v.strip()

    @model_validator(mode="after")
    def temporal_range_valid(self) -> "DatasetCreate":
        if self.temporal_start and self.temporal_end:
            if self.temporal_end < self.temporal_start:
                raise ValueError("temporal_end must be after temporal_start")
        return self


class DatasetUpdate(BaseModel):
    title:             Optional[str]             = None
    description:       Optional[str]             = None
    modified_date:     Optional[date]            = None
    access_rights:     Optional[SensitivityClass]= None
    sensitivity_class: Optional[SensitivityClass]= None
    license_url:       Optional[str]             = None
    subject_tags:      Optional[List[str]]       = None
    retention_period:  Optional[str]             = None
    data_location:     Optional[str]             = None
    steward_id:        Optional[UUID]            = None


class DatasetOut(BaseModel):
    id:                UUID
    identifier:        str
    title:             str
    description:       str
    creator:           str
    created_date:      date
    modified_date:     Optional[date]
    access_rights:     SensitivityClass
    sensitivity_class: SensitivityClass
    license_url:       Optional[str]
    subject_tags:      Optional[List[str]]
    language:          Optional[str]
    temporal_start:    Optional[date]
    temporal_end:      Optional[date]
    retention_period:  Optional[str]
    data_location:     Optional[str]
    steward_id:        Optional[UUID]
    is_active:         bool
    created_at:        datetime
    updated_at:        datetime

    model_config = {"from_attributes": True}


class DatasetJSONLD(DatasetOut):
    """DatasetOut extended with JSON-LD context serialisation."""
    context:   Dict[str, Any] = {}
    type:      str            = "dcat:Dataset"
    fair_score: Optional[float] = None

    def to_jsonld(self) -> Dict[str, Any]:
        return {
            "@context": {
                "dcat":   "http://www.w3.org/ns/dcat#",
                "dct":    "http://purl.org/dc/terms/",
                "smegov": "https://sme.gov.ng/ontology#",
                "xsd":    "http://www.w3.org/2001/XMLSchema#"
            },
            "@type":                  "dcat:Dataset",
            "dct:identifier":         self.identifier,
            "dct:title":              self.title,
            "dct:description":        self.description,
            "dct:creator":            self.creator,
            "dct:created":            str(self.created_date),
            "dct:modified":           str(self.modified_date) if self.modified_date else None,
            "dct:accessRights":       self.access_rights.value,
            "dct:license":            self.license_url,
            "dct:subject":            self.subject_tags or [],
            "dct:language":           self.language,
            "smegov:sensitivityClass":self.sensitivity_class.value,
            "smegov:retentionPeriod": self.retention_period,
            "smegov:dataLocation":    self.data_location,
            "smegov:dataSteward":     str(self.steward_id) if self.steward_id else None,
            "smegov:fairScore":       self.fair_score,
        }


# ── Lineage ───────────────────────────────────────────────────────────────────
class LineageDataset(BaseModel):
    name:      str
    namespace: str = "sme-governance"
    facets:    Optional[Dict[str, Any]] = None


class LineageRunCreate(BaseModel):
    job_name:       str
    job_namespace:  str                    = "sme-governance"
    run_id:         Optional[str]          = None   # auto-generated if omitted
    run_state:      RunState               = RunState.COMPLETE
    nominal_time:   Optional[datetime]     = None
    input_datasets: Optional[List[LineageDataset]] = None
    output_datasets:Optional[List[LineageDataset]] = None
    facets:         Optional[Dict[str, Any]]       = None


class LineageRunOut(BaseModel):
    id:              UUID
    job_name:        str
    job_namespace:   str
    run_id:          UUID
    run_state:       str
    nominal_time:    Optional[datetime]
    input_datasets:  Optional[Any]
    output_datasets: Optional[Any]
    recorded_at:     datetime

    model_config = {"from_attributes": True}


# ── FAIR Quality Scoring ──────────────────────────────────────────────────────
class FAIRScoreOut(BaseModel):
    dataset_id: UUID
    fair_score: float
    f_score:    float
    a_score:    float
    i_score:    float
    r_score:    float
    grade:      str
    details:    Dict[str, Any]
    remediation:List[str]
    scored_at:  datetime

    model_config = {"from_attributes": True}


# ── Auth ──────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email:     EmailStr
    full_name: str
    password:  str
    role:      UserRole

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        return v


class UserOut(BaseModel):
    id:         UUID
    email:      str
    full_name:  str
    role:       str
    is_active:  bool
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    role:         str
    email:        str


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


# ── Audit ─────────────────────────────────────────────────────────────────────
class AuditLogOut(BaseModel):
    id:         UUID
    user_email: Optional[str]
    user_role:  Optional[str]
    dataset_id: Optional[UUID]
    operation:  Optional[str]
    result:     Optional[str]
    ip_address: Optional[str]
    event_time: datetime

    model_config = {"from_attributes": True}


# ── Generic responses ─────────────────────────────────────────────────────────
class MessageResponse(BaseModel):
    message: str

class PaginatedDatasets(BaseModel):
    total:    int
    page:     int
    per_page: int
    items:    List[DatasetOut]
