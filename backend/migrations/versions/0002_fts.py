"""add generated tsvector column for full-text search

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-04
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # GENERATED ALWAYS AS STORED: PostgreSQL computes and stores the value on
    # every INSERT/UPDATE, and backfills all existing rows automatically when
    # the column is added.
    op.execute(
        "ALTER TABLE transcript_chunks "
        "ADD COLUMN ts_content tsvector "
        "GENERATED ALWAYS AS (to_tsvector('english', content)) STORED"
    )
    op.execute(
        "CREATE INDEX ix_transcript_chunks_ts_content "
        "ON transcript_chunks USING gin (ts_content)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_transcript_chunks_ts_content")
    op.drop_column("transcript_chunks", "ts_content")
