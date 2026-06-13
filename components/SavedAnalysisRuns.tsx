"use client";

import { useEffect, useState } from "react";
import type { AnalyzeResponse } from "@/lib/analysis-types";
import type { SavedAnalysisRun } from "@/lib/saved-analysis-runs";

const STORAGE_KEY = "idea-analyzer:saved-runs:v1";
const MIGRATION_KEY = "idea-analyzer:saved-runs:file-migration-v1";

export type { SavedAnalysisRun } from "@/lib/saved-analysis-runs";

function readSavedRuns() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? (value as SavedAnalysisRun[]) : [];
  } catch {
    return [];
  }
}

export function SavedAnalysisRuns({
  idea,
  response,
  onOpen,
}: {
  idea: string;
  response: AnalyzeResponse;
  onOpen: (run: SavedAnalysisRun) => void;
}) {
  const [savedRuns, setSavedRuns] = useState<SavedAnalysisRun[]>([]);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadRuns() {
      try {
        const browserRuns = localStorage.getItem(MIGRATION_KEY) ? [] : readSavedRuns();
        if (browserRuns.length > 0) {
          const migrationResponses = await Promise.all(
            browserRuns.map((run) =>
              fetch("/api/saved-analyses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(run),
              })
            )
          );
          if (migrationResponses.some((response) => !response.ok)) {
            throw new Error("Unable to migrate browser saves.");
          }
          localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
        }

        const response = await fetch("/api/saved-analyses");
        if (!response.ok) throw new Error("Unable to load saved analyses.");
        const runs: unknown = await response.json();
        if (!cancelled) setSavedRuns(Array.isArray(runs) ? (runs as SavedAnalysisRun[]) : []);
      } catch {
        if (!cancelled) {
          setSavedRuns(readSavedRuns());
          setSavedMessage("Could not reach file storage. Showing browser saves.");
        }
      }
    }

    void loadRuns();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveCurrentRun() {
    const run: SavedAnalysisRun = {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      idea,
      response,
    };
    setSavedMessage("Saving...");
    try {
      const saveResponse = await fetch("/api/saved-analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(run),
      });
      if (!saveResponse.ok) throw new Error("Unable to save analysis.");
      setSavedRuns([run, ...savedRuns]);
      setSavedMessage("Saved to the project folder.");
    } catch {
      setSavedMessage("Could not save to the project folder.");
    }
  }

  function downloadRun(run: SavedAnalysisRun) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(run, null, 2)], { type: "application/json" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `idea-analysis-${run.response.runMetadata.codeVersion}-${run.id.slice(0, 8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function removeRun(id: string) {
    setSavedMessage("Deleting...");
    try {
      const response = await fetch(`/api/saved-analyses?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Unable to delete analysis.");
      setSavedRuns(savedRuns.filter((run) => run.id !== id));
      setSavedMessage("Deleted saved analysis.");
    } catch {
      setSavedMessage("Could not delete saved analysis.");
    }
  }

  return (
    <details className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
      <summary className="cursor-pointer px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Saved analysis runs ({savedRuns.length})
      </summary>
      <div className="border-t border-slate-100 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void saveCurrentRun()}
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
          >
            Save this output
          </button>
          <span className="text-xs text-slate-500">{savedMessage}</span>
        </div>

        {savedRuns.length > 0 ? (
          <div className="mt-5 space-y-3">
            {savedRuns.map((run) => {
              const summary =
                run.response.status === "analysis"
                  ? `${run.response.recommendedStrategyLabel}: ${run.response.scoreSummary}`
                  : run.response.reason;

              return (
                <article key={run.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {run.idea.split(/\r?\n/)[0].slice(0, 100)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(run.savedAt).toLocaleString()} · {run.response.runMetadata.model}
                        {run.response.runMetadata.deepThinking ? " · Deep thinking" : ""}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-slate-400">
                        {run.response.runMetadata.analysisVersion} · code{" "}
                        {run.response.runMetadata.codeVersion} · seed {run.response.runMetadata.seed}
                      </p>
                      <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-600">{summary}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onOpen(run)}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-400"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadRun(run)}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-400"
                      >
                        Download JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeRun(run.id)}
                        className="rounded-full px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Saved outputs are stored as JSON files in the project&apos;s saved-analyses folder.
          </p>
        )}
      </div>
    </details>
  );
}
