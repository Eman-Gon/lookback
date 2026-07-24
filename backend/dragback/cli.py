from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from types import TracebackType
from typing import Any, NoReturn
from urllib.parse import quote, urlsplit

import httpx
import yaml

DEFAULT_AGENT_URL = "http://127.0.0.1:8002"
DEFAULT_TIMEOUT_SECONDS = 15.0

JsonObject = dict[str, Any]


@dataclass(frozen=True)
class Route:
    method: str
    path: str


# The public API contract is intentionally centralized here. The CLI contains no
# authority logic and can follow additive API changes without changing commands.
ROUTES: dict[str, Route] = {
    "import": Route("POST", "/live-workspaces/import"),
    "list": Route("GET", "/live-workspaces"),
    "show": Route("GET", "/live-workspaces/{workspace_id}"),
    "approve-baseline": Route(
        "POST", "/live-workspaces/{workspace_id}/baseline/approve"
    ),
    "authorize": Route("POST", "/live-workspaces/{workspace_id}/authorize"),
    "propose-change": Route(
        "POST", "/live-workspaces/{workspace_id}/decisions/propose"
    ),
    "approve-change": Route(
        "POST",
        "/live-workspaces/{workspace_id}/decisions/{decision_id}/approve",
    ),
    "cancel-change": Route(
        "DELETE", "/live-workspaces/{workspace_id}/decisions/pending"
    ),
    "update-plan": Route("PUT", "/live-workspaces/{workspace_id}/plan"),
    "reauthorize": Route("POST", "/live-workspaces/{workspace_id}/reauthorize"),
    "verify-initial": Route(
        "POST", "/live-workspaces/{workspace_id}/grants/initial/verify"
    ),
    "verify-replacement": Route(
        "POST", "/live-workspaces/{workspace_id}/grants/replacement/verify"
    ),
}

_TOKEN_KEYS = {
    "token",
    "signed_token",
    "grant_token",
    "signature",
}
_DETERMINISTIC_VERIFICATION_CODES = {
    "BINDING_MISMATCH",
    "CURRENT_PLAN_REJECTED",
    "EXPIRED",
    "INVALID_TOKEN",
    "NON_ALLOW_VERDICT",
    "PLAN_HASH_MISMATCH",
    "STALE_SNAPSHOT",
}


class CliError(Exception):
    """A safe error suitable for terminal output."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "CLI_ERROR",
        status_code: int | None = None,
        payload: JsonObject | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.payload = payload


class DragbackArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        self.print_usage(sys.stderr)
        self.exit(2, f"{self.prog}: error: {message}\n")


class DragbackClient:
    def __init__(
        self,
        *,
        agent_url: str,
        timeout_seconds: float,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        normalized_url = agent_url.strip().rstrip("/")
        if not normalized_url:
            raise CliError("The agent service URL cannot be empty.", code="INVALID_URL")
        parsed_url = urlsplit(normalized_url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise CliError(
                "The agent service URL must be an absolute HTTP(S) URL.",
                code="INVALID_URL",
            )
        self._client = httpx.Client(
            base_url=normalized_url,
            timeout=timeout_seconds,
            transport=transport,
            headers={"Accept": "application/json", "User-Agent": "dragback-cli/0.1"},
        )

    def __enter__(self) -> DragbackClient:
        self._client.__enter__()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self._client.__exit__(exc_type, exc_value, traceback)

    def request(
        self,
        route: Route,
        *,
        workspace_id: str | None = None,
        decision_id: str | None = None,
        body: JsonObject | None = None,
    ) -> JsonObject:
        path_values = {
            "workspace_id": _path_segment(workspace_id),
            "decision_id": _path_segment(decision_id),
        }
        path = route.path.format(**path_values)
        try:
            response = self._client.request(route.method, path, json=body)
        except httpx.TimeoutException as exc:
            raise CliError(
                "The Dragback agent service timed out.",
                code="TRANSPORT_TIMEOUT",
            ) from exc
        except httpx.RequestError as exc:
            raise CliError(
                f"Could not reach the Dragback agent service: {exc}",
                code="TRANSPORT_ERROR",
            ) from exc

        payload = _response_payload(response)
        if response.is_success:
            return payload

        error = payload.get("error")
        error_mapping = error if isinstance(error, Mapping) else {}
        code = str(error_mapping.get("code") or f"HTTP_{response.status_code}")
        message = str(
            error_mapping.get("message")
            or payload.get("message")
            or f"The service returned HTTP {response.status_code}."
        )
        raise CliError(
            message,
            code=code,
            status_code=response.status_code,
            payload=payload,
        )


def _response_payload(response: httpx.Response) -> JsonObject:
    if response.status_code == 204 or not response.content:
        return {}
    try:
        raw = response.json()
    except ValueError as exc:
        raise CliError(
            "The Dragback agent service returned a non-JSON response.",
            code="INVALID_RESPONSE",
            status_code=response.status_code,
        ) from exc
    if not isinstance(raw, dict):
        raise CliError(
            "The Dragback agent service returned an invalid response shape.",
            code="INVALID_RESPONSE",
            status_code=response.status_code,
        )
    return {str(key): value for key, value in raw.items()}


def _path_segment(value: str | None) -> str:
    return quote(value, safe="") if value is not None else ""


def _load_document(filename: str) -> JsonObject:
    if filename == "-":
        raw = sys.stdin.read()
        source = "standard input"
        suffix = ""
    else:
        path = Path(filename)
        source = str(path)
        suffix = path.suffix.casefold()
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError as exc:
            raise CliError(
                f"Could not read {source}: {exc.strerror or exc}",
                code="INPUT_ERROR",
            ) from exc

    try:
        parsed: object
        if suffix == ".json":
            parsed = json.loads(raw)
        else:
            parsed = yaml.safe_load(raw)
    except (json.JSONDecodeError, yaml.YAMLError) as exc:
        raise CliError(
            f"Could not parse {source} as YAML or JSON: {exc}",
            code="INPUT_ERROR",
        ) from exc
    if not isinstance(parsed, dict):
        raise CliError(
            f"{source} must contain one object at its top level.",
            code="INPUT_ERROR",
        )
    return {str(key): value for key, value in parsed.items()}


def _redact(value: Any, *, key: str | None = None) -> Any:
    normalized_key = key.casefold() if key else ""
    if (
        normalized_key in _TOKEN_KEYS
        or "token" in normalized_key
        or (normalized_key == "signed_grant" and isinstance(value, str))
    ):
        return "[REDACTED]"
    if isinstance(value, Mapping):
        return {
            str(child_key): _redact(child_value, key=str(child_key))
            for child_key, child_value in value.items()
        }
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def _first_value(value: Any, names: set[str]) -> Any:
    if isinstance(value, Mapping):
        for key, child in value.items():
            if str(key) in names:
                return child
        for child in value.values():
            result = _first_value(child, names)
            if result is not None:
                return result
    elif isinstance(value, list):
        for child in value:
            result = _first_value(child, names)
            if result is not None:
                return result
    return None


def _verification_outcome(
    payload: JsonObject,
    *,
    grant: str,
) -> tuple[bool, str, str]:
    expected_key = f"{grant}_verification"
    expected = payload.get(expected_key)
    verification: Any = expected if isinstance(expected, Mapping) else payload
    raw_code = _first_value(
        verification,
        {"verification_code", "code"},
    )
    raw_applied = _first_value(verification, {"applied"})
    code = str(raw_code or "UNKNOWN")
    reason = str(
        _first_value(verification, {"reason", "message"})
        or "The service did not provide a verification reason."
    )
    return code == "VALID" and raw_applied is True, code, reason


def _error_payload(error: CliError) -> JsonObject:
    body: JsonObject = {
        "error": {
            "code": error.code,
            "message": error.message,
        }
    }
    if error.status_code is not None:
        body["error"]["status_code"] = error.status_code
    if error.payload:
        correlation_id = error.payload.get("correlation_id")
        if correlation_id:
            body["correlation_id"] = correlation_id
    return body


def _string(value: Any, default: str = "—") -> str:
    return str(value) if value not in (None, "") else default


def _print_human(command: str, payload: JsonObject) -> None:
    safe = _redact(payload)
    assert isinstance(safe, dict)

    if command == "list":
        raw_workspaces = safe.get("workspaces", safe.get("items", []))
        workspaces = raw_workspaces if isinstance(raw_workspaces, list) else []
        if not workspaces:
            print("No live workspaces found.")
            return
        print("WORKSPACE\tSTATUS\tGRAPH\tNAME")
        for item in workspaces:
            if not isinstance(item, Mapping):
                continue
            print(
                "\t".join(
                    (
                        _string(item.get("id")),
                        _string(item.get("status")),
                        _string(item.get("graph_version")),
                        _string(item.get("name")),
                    )
                )
            )
        return

    headings = {
        "import": "Workspace imported",
        "show": "Live workspace",
        "approve-baseline": "Baseline approval",
        "authorize": "Plan authorization",
        "propose-change": "Decision change proposed",
        "approve-change": "Decision change approval",
        "cancel-change": "Pending decision change canceled",
        "update-plan": "Plan updated",
    }
    print(headings.get(command, "Dragback response"))
    fields: tuple[tuple[str, set[str]], ...] = (
        ("Workspace", {"workspace_id", "id"}),
        ("Name", {"name"}),
        ("Status", {"status"}),
        ("Graph", {"graph_version", "decision_snapshot"}),
        (
            "Decision",
            {"decision_id", "changed_decision_id", "pending_decision_id"},
        ),
        ("Plan", {"plan_id"}),
        ("Verdict", {"verdict"}),
        ("Authorization", {"authorization_id"}),
        ("Expires", {"expires_at"}),
        ("Reason", {"reason"}),
    )
    pending_mutation = safe.get("pending_mutation")
    pending_decision = (
        pending_mutation.get("decision")
        if isinstance(pending_mutation, Mapping)
        else None
    )
    current_plan = safe.get("current_plan")
    authorization_key = {
        "authorize": "initial_authorization",
        "approve-change": "conflict_authorization",
        "update-plan": "replacement_authorization",
    }.get(command)
    if command == "show":
        authorization_key = next(
            (
                candidate
                for candidate in (
                    "replacement_authorization",
                    "conflict_authorization",
                    "initial_authorization",
                )
                if isinstance(safe.get(candidate), Mapping)
            ),
            None,
        )
    authorization = safe.get(authorization_key) if authorization_key else None
    authorization_fields = {
        "Verdict": {"verdict"},
        "Authorization": {"authorization_id"},
        "Expires": {"expires_at"},
        "Reason": {"reason"},
    }
    preferred_values = {
        "Decision": (
            pending_decision.get("id")
            if isinstance(pending_decision, Mapping)
            else None
        ),
        "Plan": (
            current_plan.get("id") if isinstance(current_plan, Mapping) else None
        ),
    }
    shown: set[str] = set()
    for label, names in fields:
        if label in authorization_fields:
            if not isinstance(authorization, Mapping):
                continue
            value = _first_value(authorization, authorization_fields[label])
        else:
            value = preferred_values.get(label) or _first_value(safe, names)
        marker = json.dumps(value, sort_keys=True, default=str) if value is not None else ""
        if value is not None and marker not in shown:
            print(f"{label}: {_string(value)}")
            shown.add(marker)


def _print_verification(payload: JsonObject, *, accepted: bool, code: str, reason: str) -> None:
    heading = "VALID — execution applied" if accepted else f"REJECTED — {code}"
    print(heading)
    print(f"Reason: {reason}")
    graph_version = _first_value(payload, {"graph_version", "decision_snapshot"})
    if graph_version is not None:
        print(f"Graph: {graph_version}")
    path = _first_value(payload, {"invalidation_path", "provenance_path"})
    if isinstance(path, list) and path:
        print("Path: " + " → ".join(str(node) for node in path))


def _add_runtime_options(
    parser: argparse.ArgumentParser,
    *,
    defaults: bool,
) -> None:
    default_url: str | object
    default_timeout: float | object
    default_json: bool | object
    if defaults:
        default_url = os.getenv("DRAGBACK_AGENT_URL", DEFAULT_AGENT_URL)
        default_timeout = DEFAULT_TIMEOUT_SECONDS
        default_json = False
    else:
        default_url = argparse.SUPPRESS
        default_timeout = argparse.SUPPRESS
        default_json = argparse.SUPPRESS
    parser.add_argument(
        "--agent-url",
        default=default_url,
        help=(
            "Agent service base URL "
            f"(default: DRAGBACK_AGENT_URL or {DEFAULT_AGENT_URL})"
        ),
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=default_timeout,
        help=f"HTTP timeout in seconds (default: {DEFAULT_TIMEOUT_SECONDS:g})",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        default=default_json,
        help="Emit redacted machine-readable JSON.",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = DragbackArgumentParser(
        prog="dragback",
        description=(
            "Import live workspaces and enforce snapshot-bound Dragback authorizations."
        ),
    )
    _add_runtime_options(parser, defaults=True)
    groups = parser.add_subparsers(dest="group", required=True)

    workspace = groups.add_parser(
        "workspace",
        help="Manage a user-owned live workspace.",
    )
    _add_runtime_options(workspace, defaults=False)
    commands = workspace.add_subparsers(dest="command", required=True)

    def command_parser(name: str, help_text: str) -> argparse.ArgumentParser:
        child = commands.add_parser(name, help=help_text)
        _add_runtime_options(child, defaults=False)
        return child

    import_parser = command_parser("import", "Import a YAML or JSON workspace.")
    import_parser.add_argument("file", help="Workspace file, or - for standard input.")

    command_parser("list", "List live workspaces.")

    show = command_parser("show", "Show a live workspace.")
    show.add_argument("workspace_id")

    approve_baseline = command_parser(
        "approve-baseline",
        "Approve the proposed baseline decision and create graph-v17.",
    )
    approve_baseline.add_argument("workspace_id")
    approve_baseline.add_argument("--role", required=True, help="Authenticated approver role.")

    authorize = command_parser(
        "authorize",
        "Authorize the current plan against the active graph snapshot.",
    )
    authorize.add_argument("workspace_id")

    propose_change = command_parser(
        "propose-change",
        "Propose an upstream decision change from YAML or JSON.",
    )
    propose_change.add_argument("workspace_id")
    propose_change.add_argument("file", help="Decision mutation file, or - for standard input.")

    approve_change = command_parser(
        "approve-change",
        "Approve a proposed decision change using an authoritative role.",
    )
    approve_change.add_argument("workspace_id")
    approve_change.add_argument("decision_id")
    approve_change.add_argument("--role", required=True, help="Authenticated approver role.")

    cancel_change = command_parser(
        "cancel-change",
        "Cancel the pending decision proposal without changing the graph.",
    )
    cancel_change.add_argument("workspace_id")

    verify = command_parser(
        "verify",
        "Ask the executor to verify and apply a stored authorization.",
    )
    verify.add_argument("workspace_id")
    verify.add_argument(
        "--grant",
        choices=("initial", "replacement"),
        default="initial",
        help="Stored grant to verify (default: initial).",
    )

    update_plan = command_parser(
        "update-plan",
        "Replace the current agent plan from YAML or JSON.",
    )
    update_plan.add_argument("workspace_id")
    update_plan.add_argument("file", help="Plan file, or - for standard input.")

    return parser


def _request_for_command(
    client: DragbackClient,
    args: argparse.Namespace,
) -> JsonObject:
    command = str(args.command)
    route_key = f"verify-{args.grant}" if command == "verify" else command
    route = ROUTES[route_key]
    workspace_id = getattr(args, "workspace_id", None)
    decision_id = getattr(args, "decision_id", None)
    body: JsonObject | None = None

    if command == "import":
        body = _load_document(args.file)
    elif command in {"approve-baseline", "approve-change"}:
        body = {"actor_role": args.role}
    elif command == "propose-change":
        body = _load_document(args.file)
    elif command == "verify":
        body = {}
    elif command == "update-plan":
        body = {"plan": _load_document(args.file)}
    elif command == "authorize":
        body = {}

    payload = client.request(
        route,
        workspace_id=workspace_id,
        decision_id=decision_id,
        body=body,
    )
    if command == "update-plan":
        return client.request(
            ROUTES["reauthorize"],
            workspace_id=workspace_id,
            body={},
        )
    return payload


def run(
    argv: Sequence[str] | None = None,
    *,
    transport: httpx.BaseTransport | None = None,
) -> int:
    args = build_parser().parse_args(argv)
    json_output = bool(args.json)
    try:
        if not math.isfinite(args.timeout) or args.timeout <= 0:
            raise CliError("The HTTP timeout must be greater than zero.", code="INVALID_TIMEOUT")
        with DragbackClient(
            agent_url=str(args.agent_url),
            timeout_seconds=float(args.timeout),
            transport=transport,
        ) as client:
            payload = _request_for_command(client, args)
    except CliError as error:
        if (
            args.command == "verify"
            and error.code in _DETERMINISTIC_VERIFICATION_CODES
        ):
            payload = error.payload or {"code": error.code, "reason": error.message}
            if json_output:
                print(json.dumps(_redact(payload), indent=2, sort_keys=True))
            else:
                _print_verification(
                    payload,
                    accepted=False,
                    code=error.code,
                    reason=error.message,
                )
            return 1
        safe_error = _error_payload(error)
        if json_output:
            print(json.dumps(safe_error, indent=2, sort_keys=True), file=sys.stderr)
        else:
            print(f"dragback: {error.message} [{error.code}]", file=sys.stderr)
        return 2

    if args.command == "verify":
        accepted, code, reason = _verification_outcome(payload, grant=str(args.grant))
        if json_output:
            print(json.dumps(_redact(payload), indent=2, sort_keys=True))
        else:
            _print_verification(payload, accepted=accepted, code=code, reason=reason)
        return 0 if accepted else 1

    if json_output:
        print(json.dumps(_redact(payload), indent=2, sort_keys=True))
    else:
        _print_human(str(args.command), payload)
    return 0


def main() -> int:
    return run()


if __name__ == "__main__":
    raise SystemExit(main())
