"""initial schema with pgvector

Revision ID: 0001
Revises:
Create Date: 2026-06-04
"""
import pgvector.sqlalchemy
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

EMBEDDING_DIM = 1536


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "recordings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("original_filename", sa.String(512), nullable=False),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("media_type", sa.String(32), nullable=False),
        sa.Column("mime_type", sa.String(128)),
        sa.Column("size_bytes", sa.Integer, server_default="0"),
        sa.Column("status", sa.String(32), server_default="uploaded"),
        sa.Column("error", sa.Text),
        sa.Column("duration_seconds", sa.Float),
        sa.Column("summary", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_recordings_user_id", "recordings", ["user_id"])
    op.create_index("ix_recordings_status", "recordings", ["status"])

    op.create_table(
        "transcript_segments",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("recording_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recordings.id"), nullable=False),
        sa.Column("idx", sa.Integer, nullable=False),
        sa.Column("speaker", sa.String(128), server_default="Unknown"),
        sa.Column("start_seconds", sa.Float, server_default="0"),
        sa.Column("end_seconds", sa.Float, server_default="0"),
        sa.Column("text", sa.Text, nullable=False),
    )
    op.create_index("ix_transcript_segments_recording_id", "transcript_segments", ["recording_id"])

    op.create_table(
        "transcript_chunks",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("recording_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recordings.id"), nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", pgvector.sqlalchemy.Vector(EMBEDDING_DIM)),
        sa.Column("start_seconds", sa.Float, server_default="0"),
        sa.Column("end_seconds", sa.Float, server_default="0"),
        sa.Column("speakers", sa.String(512)),
    )
    op.create_index("ix_transcript_chunks_recording_id", "transcript_chunks", ["recording_id"])
    # Approximate-nearest-neighbour index for cosine similarity search.
    op.execute(
        "CREATE INDEX ix_transcript_chunks_embedding ON transcript_chunks "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )

    op.create_table(
        "speakers",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("recording_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recordings.id"), nullable=False),
        sa.Column("label", sa.String(128), nullable=False),
        sa.Column("total_speaking_seconds", sa.Float, server_default="0"),
        sa.Column("segment_count", sa.Integer, server_default="0"),
    )
    op.create_index("ix_speakers_recording_id", "speakers", ["recording_id"])

    op.create_table(
        "action_items",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("recording_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recordings.id"), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("owner", sa.String(255)),
        sa.Column("due", sa.String(255)),
    )
    op.create_index("ix_action_items_recording_id", "action_items", ["recording_id"])

    op.create_table(
        "decisions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("recording_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recordings.id"), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
    )
    op.create_index("ix_decisions_recording_id", "decisions", ["recording_id"])

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("recording_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recordings.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("sources", postgresql.JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_chat_messages_recording_id", "chat_messages", ["recording_id"])
    op.create_index("ix_chat_messages_user_id", "chat_messages", ["user_id"])


def downgrade() -> None:
    op.drop_table("chat_messages")
    op.drop_table("decisions")
    op.drop_table("action_items")
    op.drop_table("speakers")
    op.drop_table("transcript_chunks")
    op.drop_table("transcript_segments")
    op.drop_table("recordings")
    op.drop_table("users")
