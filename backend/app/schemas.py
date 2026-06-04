import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---- Auth ----
class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    created_at: datetime


# ---- Recordings ----
class RecordingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    original_filename: str
    media_type: str
    mime_type: str | None
    size_bytes: int
    status: str
    error: str | None
    duration_seconds: float | None
    created_at: datetime
    updated_at: datetime


class SpeakerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    label: str
    total_speaking_seconds: float
    segment_count: int


class ActionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    description: str
    owner: str | None
    due: str | None


class DecisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    description: str


class RecordingDetailOut(RecordingOut):
    summary: str | None
    speakers: list[SpeakerOut] = []
    action_items: list[ActionItemOut] = []
    decisions: list[DecisionOut] = []


class SegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    idx: int
    speaker: str
    start_seconds: float
    end_seconds: float
    text: str


# ---- Chat ----
class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class ChatSource(BaseModel):
    chunk_id: int
    chunk_index: int
    start_seconds: float
    end_seconds: float
    speakers: str | None
    score: float


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: str
    content: str
    sources: list | None = None
    created_at: datetime


class ChatResponse(BaseModel):
    answer: str
    sources: list[ChatSource] = []
