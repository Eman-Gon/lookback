from __future__ import annotations

from dataclasses import dataclass

from dragback.authority.engine import IntentAuthority
from dragback.config import settings
from dragback.fixtures import load_graph_fixture
from dragback.grants import GrantSigner
from dragback.graph import GraphStore, create_graph_store


@dataclass
class AuthorityRuntime:
    graph: GraphStore
    authority: IntentAuthority

    def reset(self) -> None:
        version, artifacts, edges, _ = load_graph_fixture()
        self.graph.reset(version=version, artifacts=artifacts, edges=edges)
        self.authority.last_report = None


def create_authority_runtime() -> AuthorityRuntime:
    graph = create_graph_store(settings)
    signer = GrantSigner(settings.grant_secret, settings.grant_ttl_seconds)
    authority = IntentAuthority(
        graph=graph,
        signer=signer,
        authority_threshold=settings.authority_threshold,
    )
    runtime = AuthorityRuntime(graph=graph, authority=authority)
    if settings.demo_reset_enabled:
        runtime.reset()
    return runtime
