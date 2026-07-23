from __future__ import annotations

from dataclasses import replace

import pytest
from dragback import config
from dragback import runtime as runtime_module
from dragback.domain import Artifact, Edge
from dragback.graph.memory import MemoryGraphStore


class ResetTrackingStore(MemoryGraphStore):
    def __init__(self) -> None:
        super().__init__()
        self.reset_calls = 0

    def reset(self, *, version: int, artifacts: list[Artifact], edges: list[Edge]) -> None:
        self.reset_calls += 1
        super().reset(version=version, artifacts=artifacts, edges=edges)


def test_memory_development_keeps_zero_config_demo_reset() -> None:
    assert config._default_demo_reset_enabled("development", "memory") is True


@pytest.mark.parametrize("environment", ["development", "demo", "local", "test", "production"])
def test_neo4j_never_enables_destructive_reset_by_default(environment: str) -> None:
    assert config._default_demo_reset_enabled(environment, "neo4j") is False


def test_explicit_reset_flag_can_opt_in(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DRAGBACK_DEMO_RESET_ENABLED", "true")

    assert config._env_flag("DRAGBACK_DEMO_RESET_ENABLED", False) is True


@pytest.mark.parametrize(
    ("reset_enabled", "expected_calls", "expected_version"),
    [(False, 0, 0), (True, 1, 17)],
)
def test_authority_startup_only_seeds_when_reset_is_enabled(
    monkeypatch: pytest.MonkeyPatch,
    reset_enabled: bool,
    expected_calls: int,
    expected_version: int,
) -> None:
    graph = ResetTrackingStore()
    monkeypatch.setattr(
        runtime_module,
        "settings",
        replace(
            runtime_module.settings,
            graph_backend="neo4j",
            demo_reset_enabled=reset_enabled,
        ),
    )
    monkeypatch.setattr(runtime_module, "create_graph_store", lambda _settings: graph)

    created = runtime_module.create_authority_runtime()

    assert graph.reset_calls == expected_calls
    assert created.graph.version == expected_version
