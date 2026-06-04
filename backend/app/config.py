from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, populated from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+psycopg://meeting:meeting@db:5432/meeting"

    # Redis / Celery
    redis_url: str = "redis://redis:6379/0"

    # Auth
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days

    # Transcription
    deepgram_api_key: str = ""

    # Answering LLM (Groq)
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # Embeddings (OpenAI)
    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536

    # Storage
    upload_dir: str = "/data/uploads"
    max_upload_mb: int = 500

    # RAG retrieval
    retrieval_top_k: int = 5
    retrieval_fetch_k: int = 20
    retrieval_score_threshold: float = 0.2


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
