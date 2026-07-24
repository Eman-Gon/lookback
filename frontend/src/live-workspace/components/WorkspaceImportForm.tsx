import type { FormEvent } from "react";
import type {
  WorkspaceDocumentFormat,
  WorkspaceValidationIssue,
} from "../model";
import type { WorkspaceReadiness } from "../state";
import { CodeDocumentEditor } from "./CodeDocumentEditor";
import { ValidationSummary } from "./ValidationSummary";
import { WorkspaceRequirements } from "./WorkspaceRequirements";

export interface WorkspaceImportFormProps {
  content: string;
  sourceName: string;
  format: WorkspaceDocumentFormat;
  readiness: WorkspaceReadiness;
  busy: boolean;
  errorMessage: string;
  validationIssues: readonly WorkspaceValidationIssue[];
  onContentChange: (content: string) => void;
  onFile: (file: File) => void;
  onSubmit: () => void;
  onDownloadTemplate: () => void;
  onDismissError: () => void;
}

export function WorkspaceImportForm({
  content,
  sourceName,
  format,
  readiness,
  busy,
  errorMessage,
  validationIssues,
  onContentChange,
  onFile,
  onSubmit,
  onDownloadTemplate,
  onDismissError,
}: WorkspaceImportFormProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  const acceptFile = (file: File | undefined) => {
    if (file) onFile(file);
  };

  return (
    <>
      <ValidationSummary
        message={errorMessage}
        issues={validationIssues}
        onDismiss={onDismissError}
      />
      <form
        className="lw-import-form"
        aria-labelledby="workspace-import-title"
        onSubmit={submit}
        noValidate
      >
        <div className="lw-section-heading">
          <div>
            <h2 id="workspace-import-title">Choose a workspace file</h2>
            <p>Use YAML or JSON up to 1 MB. The file is read locally first.</p>
          </div>
          <span>{sourceName || "Starter example loaded"}</span>
        </div>
        <label
          className="lw-dropzone"
          htmlFor="workspace-file"
          onDragOver={(event) => {
            if (!busy) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!busy) acceptFile(event.dataTransfer.files[0]);
          }}
        >
          <input
            className="sl-visually-hidden"
            id="workspace-file"
            type="file"
            accept=".yaml,.yml,.json,application/json,text/yaml"
            disabled={busy}
            onChange={(event) => acceptFile(event.target.files?.[0])}
          />
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 16V4m0 0L8 8m4-4 4 4M5 15v4h14v-4" />
          </svg>
          <strong>
            {sourceName ? sourceName : "Upload a YAML or JSON file"}
          </strong>
          <span>
            {sourceName
              ? "File loaded. Drop another file here to replace it."
              : "Drag and drop here, or click to choose a file."}
          </span>
        </label>

        <div className="lw-import-actions">
          <button
            className="sl-button sl-button--primary lw-import-submit"
            type="submit"
            disabled={busy || !readiness.ready}
          >
            {busy
              ? "Validating and importing…"
              : "Validate and continue"}
          </button>
          <button
            className="sl-button sl-button--secondary"
            type="button"
            disabled={busy}
            onClick={onDownloadTemplate}
          >
            Download starter JSON
          </button>
        </div>

        <details className="lw-disclosure">
          <summary>Review or edit the workspace document</summary>
          <p>
            This is the exact document Dragback will validate. Advanced users
            can edit it before continuing.
          </p>
          <CodeDocumentEditor
            id="workspace-document"
            label={format === "yaml" ? "Workspace YAML" : "Workspace JSON"}
            value={content}
            onChange={onContentChange}
            disabled={busy}
          />
        </details>

        <details className="lw-disclosure">
          <summary>File checklist</summary>
          <WorkspaceRequirements readiness={readiness} />
        </details>
      </form>
    </>
  );
}
