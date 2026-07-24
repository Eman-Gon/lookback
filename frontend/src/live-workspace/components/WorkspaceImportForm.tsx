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
      <div className="lw-import-layout">
        <form
          className="lw-import-form"
          aria-labelledby="workspace-import-title"
          onSubmit={submit}
          noValidate
        >
          <h2 id="workspace-import-title">Import workspace</h2>
          <strong className="lw-field-label">Choose a code-native file</strong>
          <label
            className="lw-dropzone"
            htmlFor="workspace-file"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              acceptFile(event.dataTransfer.files[0]);
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
            <strong>Choose {sourceName || "dragback.yaml"}</strong>
            <span>Drag and drop or click to browse</span>
          </label>

          <CodeDocumentEditor
            id="workspace-document"
            label={format === "yaml" ? "or edit YAML" : "or paste JSON"}
            value={content}
            onChange={onContentChange}
            disabled={busy}
          />

          <button
            className="sl-button sl-button--primary lw-import-submit"
            type="submit"
            disabled={busy || !readiness.ready}
          >
            {busy ? "Validating…" : "Validate and import"}
          </button>
          <small className="lw-supported-formats">
            Supported formats: dragback.yaml, YAML, or JSON
          </small>
        </form>

        <WorkspaceRequirements readiness={readiness} />
      </div>
    </>
  );
}
