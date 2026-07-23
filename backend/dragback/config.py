from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()
_ENVIRONMENT = os.getenv("DRAGBACK_ENV", "development")
_GRAPH_BACKEND = os.getenv("DRAGBACK_GRAPH_BACKEND", "memory")


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _default_demo_reset_enabled(environment: str, graph_backend: str) -> bool:
    """Keep the memory demo zero-config without defaulting remote stores to destructive writes."""

    return (
        graph_backend.strip().lower() == "memory"
        and environment.strip().lower() in {"development", "demo", "local", "test"}
    )


@dataclass(frozen=True)
class Settings:
    env: str = _ENVIRONMENT
    demo_reset_enabled: bool = _env_flag(
        "DRAGBACK_DEMO_RESET_ENABLED",
        _default_demo_reset_enabled(_ENVIRONMENT, _GRAPH_BACKEND),
    )
    graph_backend: str = _GRAPH_BACKEND
    grant_secret: str = os.getenv("DRAGBACK_GRANT_SECRET", "dragback-local-demo-secret")
    grant_ttl_seconds: int = int(os.getenv("DRAGBACK_GRANT_TTL_SECONDS", "3600"))
    authority_threshold: float = float(os.getenv("DRAGBACK_AUTHORITY_THRESHOLD", "0.75"))
    authority_url: str = os.getenv("DRAGBACK_AUTHORITY_URL", "http://localhost:8001")
    agent_url: str = os.getenv("DRAGBACK_AGENT_URL", "http://localhost:8002")
    executor_url: str = os.getenv("DRAGBACK_EXECUTOR_URL", "http://localhost:8003")
    service_timeout_seconds: float = float(os.getenv("DRAGBACK_SERVICE_TIMEOUT_SECONDS", "5"))
    neo4j_uri: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    neo4j_username: str = os.getenv("NEO4J_USERNAME", "neo4j")
    neo4j_password: str = os.getenv("NEO4J_PASSWORD", "dragback-demo")
    neo4j_database: str = os.getenv("NEO4J_DATABASE", "neo4j")
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY") or None
    anthropic_model: str | None = os.getenv("ANTHROPIC_MODEL") or None


settings = Settings()
