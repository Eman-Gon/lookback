from __future__ import annotations

from typing import Protocol

from dragback.domain import DecisionMutation


class DecisionExtractor(Protocol):
    def extract(self, raw_text: str) -> DecisionMutation: ...


class FixtureDecisionExtractor:
    """Deterministic adapter used by the live demo."""

    def __init__(self, mutation: DecisionMutation) -> None:
        self._mutation = mutation

    def extract(self, raw_text: str) -> DecisionMutation:
        del raw_text
        return self._mutation.model_copy(deep=True)
