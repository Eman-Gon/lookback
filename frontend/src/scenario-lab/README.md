# Scenario Lab UI

`ScenarioLab` is a presentation layer for deterministic Dragback scenario runs.
It does not traverse the graph, compute verdicts, sign grants, or infer expected
results in the browser.

## Integration

Pass two props:

- `data`: scenario definitions, measured run summaries, and optional service
  status.
- `client`: the adapter that starts, advances, resets, and runs scenarios
  through the existing backend services.

```tsx
import { ScenarioLab } from "./scenario-lab";

<ScenarioLab data={scenarioLabData} client={scenarioLabClient} />
```

The adapter should map backend responses into `ScenarioRunState`. In
particular, it must supply the provenance path, selective outcomes, authority
verdict, grant metadata, executor rejection code (for example,
`STALE_SNAPSHOT`), and expected-versus-actual run results. Grant tokens are
intentionally absent from the UI model.

`loadScenarioState` is optional. Implement it when report rows should reopen a
persisted run with full evidence. All other client methods are required.

## Views

- Catalog: category count rail, risk/result filters, and inline scenario detail.
- Run: four-stage guided proof with one primary stage canvas.
- Report: measured counts, expected-to-actual columns, and expandable failures.
- Evidence: modal drawer for raw IDs, hashes, timestamps, and grant metadata.

All styling is scoped beneath `.sl-root` in `scenario-lab.css`.
