"use client";

import { AlertTriangle, CheckSquare, LoaderCircle, Square, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ChunkedDeleteResult } from "@/lib/bulk-client";

// ---------------------------------------------------------------------------
// Selection state
// ---------------------------------------------------------------------------

export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Header-checkbox behavior: select every visible id, or clear them all when they are all selected. */
  const toggleAll = useCallback((visibleIds: string[]) => {
    setSelected((current) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => current.has(id));
      const next = new Set(current);
      for (const id of visibleIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const replace = useCallback((ids: Iterable<string>) => setSelected(new Set(ids)), []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const remove = useCallback((ids: Iterable<string>) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  return { selected, toggle, toggleAll, replace, clear, remove };
}

// ---------------------------------------------------------------------------
// Checkboxes
// ---------------------------------------------------------------------------

export function MasterCheckbox({ visibleIds, selected, onToggleAll, label }: { visibleIds: string[]; selected: Set<string>; onToggleAll: () => void; label: string }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const selectedVisible = visibleIds.filter((id) => selected.has(id)).length;
  const all = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  const some = selectedVisible > 0 && !all;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);
  return (
    <input
      ref={ref}
      className="select-checkbox"
      type="checkbox"
      checked={all}
      disabled={visibleIds.length === 0}
      onChange={onToggleAll}
      onClick={(event) => event.stopPropagation()}
      aria-label={label}
    />
  );
}

export function RowCheckbox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <input
      className="select-checkbox"
      type="checkbox"
      checked={checked}
      onChange={onToggle}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      aria-label={label}
    />
  );
}

// ---------------------------------------------------------------------------
// Selection bar
// ---------------------------------------------------------------------------

export function SelectionBar({
  visibleIds,
  selected,
  onToggleAll,
  masterLabel,
  onClear,
  onDelete,
  deleteLabel = "Delete selected",
  matchingTotal,
  onSelectAllMatching,
  selectingAll = false,
  note,
}: {
  visibleIds: string[];
  selected: Set<string>;
  onToggleAll: () => void;
  masterLabel: string;
  onClear: () => void;
  onDelete: () => void;
  deleteLabel?: string;
  matchingTotal?: number;
  onSelectAllMatching?: () => void;
  selectingAll?: boolean;
  note?: string;
}) {
  const count = selected.size;
  const canSelectMatching = onSelectAllMatching && matchingTotal !== undefined && matchingTotal > visibleIds.length && count < matchingTotal;
  return (
    <div className={`selection-bar ${count ? "selection-bar-active" : ""}`} role="toolbar" aria-label="Selection actions">
      <label className="selection-master">
        <MasterCheckbox visibleIds={visibleIds} selected={selected} onToggleAll={onToggleAll} label={masterLabel} />
        <span>{count ? `${count.toLocaleString()} selected` : "Select"}</span>
      </label>
      {canSelectMatching ? (
        <button className="button button-quiet button-small" type="button" onClick={onSelectAllMatching} disabled={selectingAll}>
          {selectingAll ? <LoaderCircle size={13} className="spin" aria-hidden="true" /> : <CheckSquare size={13} aria-hidden="true" />}
          Select all {matchingTotal.toLocaleString()} matching
        </button>
      ) : null}
      {count ? (
        <button className="button button-quiet button-small" type="button" onClick={onClear}>
          <Square size={13} aria-hidden="true" /> Clear selection
        </button>
      ) : null}
      {note ? <span className="selection-note">{note}</span> : null}
      <button className="button button-danger-ghost button-small selection-delete" type="button" disabled={!count} onClick={onDelete}>
        <Trash2 size={13} aria-hidden="true" /> {deleteLabel} ({count.toLocaleString()})
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmed, progress-reporting delete dialog
// ---------------------------------------------------------------------------

export type BulkRunContext = {
  onProgress: (processed: number, total: number, phase?: string) => void;
  shouldStop: () => boolean;
};

type Phase = "confirm" | "running" | "done";

export function BulkDeleteDialog({
  title,
  description,
  count,
  previews,
  confirmWord = "DELETE",
  actionVerb = "Delete",
  warning,
  run,
  onClose,
}: {
  title: string;
  description: string;
  count: number;
  previews: string[];
  confirmWord?: string;
  actionVerb?: string;
  warning?: string;
  run: (context: BulkRunContext) => Promise<ChunkedDeleteResult>;
  onClose: (result: ChunkedDeleteResult | null) => void;
}) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [typed, setTyped] = useState("");
  const [progress, setProgress] = useState({ processed: 0, total: count, label: "" });
  const [result, setResult] = useState<ChunkedDeleteResult | null>(null);
  const stopRef = useRef(false);
  const [stopRequested, setStopRequested] = useState(false);
  const titleId = "bulk-delete-title";

  const start = async () => {
    if (typed.trim() !== confirmWord) return;
    setPhase("running");
    stopRef.current = false;
    try {
      const outcome = await run({
        onProgress: (processed, total, label) => setProgress({ processed, total, label: label ?? "" }),
        shouldStop: () => stopRef.current,
      });
      setResult(outcome);
    } catch (error) {
      setResult({ deleted: [], failed: [], remaining: [], stopped: false, error: error instanceof Error ? error.message : "Delete failed." });
    }
    setPhase("done");
  };

  const close = () => {
    if (phase === "running") return;
    onClose(result);
  };

  const attempted = result ? result.deleted.length + result.failed.length : 0;

  return (
    <div className="editor-overlay bulk-overlay" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <div className="editor-scrim" onClick={close} />
      <div className="bulk-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="drawer-heading">
          <div><span className="eyebrow">DESTRUCTIVE ACTION</span><h2 id={titleId}>{title}</h2></div>
          <button className="icon-button" type="button" onClick={close} disabled={phase === "running"} aria-label="Close dialog"><X size={17} aria-hidden="true" /></button>
        </div>
        <p className="bulk-description">{description}</p>
        {warning ? <div className="bulk-warning"><AlertTriangle size={15} aria-hidden="true" /><span>{warning}</span></div> : null}
        {previews.length ? (
          <ul className="bulk-preview" aria-label="Items to delete">
            {previews.slice(0, 6).map((preview, index) => <li key={`${index}-${preview}`}>{preview}</li>)}
            {count > Math.min(6, previews.length) ? <li className="muted">and {(count - Math.min(6, previews.length)).toLocaleString()} more</li> : null}
          </ul>
        ) : null}

        {phase === "confirm" ? (
          <>
            <label className="field-label" htmlFor="bulk-confirm-input">Type {confirmWord} to confirm</label>
            <input
              id="bulk-confirm-input"
              className="text-input"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void start(); }}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            <div className="drawer-actions">
              <button className="button button-secondary" type="button" onClick={close}>Cancel</button>
              <button className="button button-danger" type="button" disabled={typed.trim() !== confirmWord} onClick={() => void start()}>
                <Trash2 size={15} aria-hidden="true" /> {actionVerb} {count.toLocaleString()}
              </button>
            </div>
          </>
        ) : null}

        {phase === "running" ? (
          <div className="bulk-progress" role="status">
            <div className="bulk-progress-track"><div className="bulk-progress-fill" style={{ width: `${progress.total ? Math.round((progress.processed / progress.total) * 100) : 0}%` }} /></div>
            <span className="mono">{progress.label || "Deleting"} · {progress.processed.toLocaleString()} / {progress.total.toLocaleString()}</span>
            <button className="button button-secondary" type="button" disabled={stopRequested} onClick={() => { stopRef.current = true; setStopRequested(true); }}>
              {stopRequested ? "Stopping after this batch…" : "Stop"}
            </button>
          </div>
        ) : null}

        {phase === "done" && result ? (
          <div className="bulk-result" role="status">
            <strong>Deleted {result.deleted.length.toLocaleString()} of {Math.max(count, attempted).toLocaleString()}.</strong>
            {result.stopped ? <span>Stopped by request; {result.remaining.length.toLocaleString()} not attempted and still selected.</span> : null}
            {result.error ? <span className="bulk-error">{result.error}</span> : null}
            {result.failed.length ? (
              <details>
                <summary>{result.failed.length.toLocaleString()} failed</summary>
                <ul className="bulk-preview">{result.failed.slice(0, 20).map((failure) => <li key={failure.id}><code>{failure.id}</code> {failure.error}</li>)}</ul>
              </details>
            ) : null}
            <div className="drawer-actions"><button className="button button-primary" type="button" onClick={close}>Close</button></div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
