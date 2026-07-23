from __future__ import annotations

import json
from typing import Any

from dragback.domain import Artifact, Edge, EdgeKind


class Neo4jGraphStore:
    """Neo4j implementation of the graph-store contract.

    The deterministic tests use the memory store. Enable this adapter with
    DRAGBACK_GRAPH_BACKEND=neo4j after installing the `graph` extra.
    """

    def __init__(self, *, uri: str, username: str, password: str, database: str) -> None:
        try:
            from neo4j import GraphDatabase
        except ImportError as exc:
            raise RuntimeError('Install Dragback with `pip install -e ".[graph]"`') from exc
        self._driver = GraphDatabase.driver(uri, auth=(username, password))
        self._database = database

    def close(self) -> None:
        self._driver.close()

    @staticmethod
    def _properties(artifact: Artifact) -> dict[str, Any]:
        payload = artifact.model_dump(mode="json")
        payload["scopes"] = sorted(artifact.scopes)
        payload["invalidated_scopes"] = sorted(artifact.invalidated_scopes)
        payload["attributes_json"] = json.dumps(payload.pop("attributes"), sort_keys=True)
        return payload

    @staticmethod
    def _artifact_from_record(record: dict[str, Any]) -> Artifact:
        payload = dict(record)
        payload["attributes"] = json.loads(payload.pop("attributes_json", "{}"))
        return Artifact.model_validate(payload)

    def reset(self, *, version: int, artifacts: list[Artifact], edges: list[Edge]) -> None:
        with self._driver.session(database=self._database) as session:
            session.run("MATCH (n) DETACH DELETE n")
            session.run("CREATE (:GraphMeta {id: 'main', version: $version})", version=version)
        for artifact in artifacts:
            self.add_artifact(artifact)
        for edge in edges:
            self.add_edge(edge)

    @property
    def version(self) -> int:
        with self._driver.session(database=self._database) as session:
            record = session.run(
                "MATCH (m:GraphMeta {id: 'main'}) RETURN m.version AS version"
            ).single()
        return int(record["version"] if record else 0)

    @property
    def version_label(self) -> str:
        return f"graph-v{self.version}"

    def increment_version(self) -> str:
        with self._driver.session(database=self._database) as session:
            record = session.run(
                "MATCH (m:GraphMeta {id: 'main'}) "
                "SET m.version = m.version + 1 RETURN m.version AS version"
            ).single()
        return f"graph-v{int(record['version'])}"

    def add_artifact(self, artifact: Artifact) -> None:
        props = self._properties(artifact)
        with self._driver.session(database=self._database) as session:
            session.run("CREATE (a:Artifact $props)", props=props)

    def update_artifact(self, artifact: Artifact) -> None:
        props = self._properties(artifact)
        with self._driver.session(database=self._database) as session:
            result = session.run(
                "MATCH (a:Artifact {id: $id}) SET a = $props RETURN a.id AS id",
                id=artifact.id,
                props=props,
            ).single()
        if result is None:
            raise KeyError(f"Unknown artifact: {artifact.id}")

    def get_artifact(self, artifact_id: str) -> Artifact:
        with self._driver.session(database=self._database) as session:
            record = session.run(
                "MATCH (a:Artifact {id: $id}) RETURN properties(a) AS props", id=artifact_id
            ).single()
        if record is None:
            raise KeyError(f"Unknown artifact: {artifact_id}")
        return self._artifact_from_record(record["props"])

    def list_artifacts(self) -> list[Artifact]:
        with self._driver.session(database=self._database) as session:
            records = session.run("MATCH (a:Artifact) RETURN properties(a) AS props")
            return [self._artifact_from_record(record["props"]) for record in records]

    def add_edge(self, edge: Edge) -> None:
        if edge.kind not in set(EdgeKind):
            raise ValueError(f"Unsupported relationship type: {edge.kind}")
        relationship = edge.kind.value
        query = (
            "MATCH (s:Artifact {id: $source_id}), (t:Artifact {id: $target_id}) "
            f"CREATE (s)-[r:{relationship}]->(t) "
            "SET r.scopes = $scopes, r.evidence_ref = $evidence_ref"
        )
        with self._driver.session(database=self._database) as session:
            session.run(
                query,
                source_id=edge.source_id,
                target_id=edge.target_id,
                scopes=sorted(edge.scopes),
                evidence_ref=edge.evidence_ref,
            )

    def list_edges(self) -> list[Edge]:
        with self._driver.session(database=self._database) as session:
            records = session.run(
                "MATCH (s:Artifact)-[r]->(t:Artifact) "
                "RETURN s.id AS source_id, t.id AS target_id, type(r) AS kind, "
                "r.scopes AS scopes, r.evidence_ref AS evidence_ref"
            )
            return [
                Edge(
                    source_id=record["source_id"],
                    target_id=record["target_id"],
                    kind=EdgeKind(record["kind"]),
                    scopes=set(record["scopes"] or []),
                    evidence_ref=record["evidence_ref"],
                )
                for record in records
            ]

    def outgoing_edges(
        self, artifact_id: str, kinds: set[EdgeKind] | None = None
    ) -> list[Edge]:
        edges = [edge for edge in self.list_edges() if edge.source_id == artifact_id]
        return [edge for edge in edges if kinds is None or edge.kind in kinds]

    def snapshot(self) -> dict[str, object]:
        return {
            "graph_version": self.version_label,
            "artifacts": [item.model_dump(mode="json") for item in self.list_artifacts()],
            "edges": [edge.model_dump(mode="json") for edge in self.list_edges()],
        }
