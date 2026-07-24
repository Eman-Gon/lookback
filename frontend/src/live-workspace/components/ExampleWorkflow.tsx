const WORKFLOW = [
  {
    title: "Authorize current plan",
    detail:
      "Import your workspace, approve the baseline, and issue a real snapshot-bound authorization.",
  },
  {
    title: "Approve a changed decision",
    detail:
      "When a decision changes, approve the updated decision to create a new baseline.",
  },
  {
    title: "Run dragback verify",
    detail:
      "Ensure actions still match the latest approved company decision.",
  },
] as const;

export function ExampleWorkflow() {
  return (
    <section className="lw-example" aria-labelledby="workspace-example-title">
      <h2 id="workspace-example-title">Example workflow</h2>
      <ol>
        {WORKFLOW.map((item, index) => (
          <li key={item.title}>
            <span>{index + 1}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
            {index < WORKFLOW.length - 1 ? (
              <svg viewBox="0 0 70 20" aria-hidden="true">
                <path d="M1 10h65m-7-6 7 6-7 6" />
              </svg>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="lw-cli-example">
        <strong>CLI example</strong>
        <code>dragback workspace import dragback.yaml</code>
        <span>Validate and import a workspace from a file.</span>
      </div>
    </section>
  );
}
