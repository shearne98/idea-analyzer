import { promises as fs } from "fs";
import path from "path";
import type { AnalyzeResponse } from "@/lib/analysis-types";

const SAVED_ANALYSES_DIRECTORY = path.join(process.cwd(), "saved-analyses");

export type SavedAnalysisRun = {
  id: string;
  savedAt: string;
  idea: string;
  response: AnalyzeResponse;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isSavedAnalysisRun(value: unknown): value is SavedAnalysisRun {
  if (!isRecord(value) || !isRecord(value.response) || !isRecord(value.response.runMetadata)) {
    return false;
  }
  const metadata = value.response.runMetadata;

  return (
    typeof value.id === "string" &&
    /^[a-zA-Z0-9-]+$/.test(value.id) &&
    typeof value.savedAt === "string" &&
    !Number.isNaN(Date.parse(value.savedAt)) &&
    typeof value.idea === "string" &&
    (value.response.status === "analysis" || value.response.status === "needs_clarification") &&
    typeof metadata.analysisVersion === "string" &&
    typeof metadata.codeVersion === "string" &&
    typeof metadata.model === "string" &&
    typeof metadata.deepThinking === "boolean" &&
    typeof metadata.temperature === "number" &&
    Number.isFinite(metadata.temperature) &&
    typeof metadata.seed === "number" &&
    Number.isFinite(metadata.seed)
  );
}

export function createSavedAnalysisRunStore(directory: string) {
  const runFilePath = (id: string) => path.join(directory, `${id}.json`);

  return {
    async list() {
      await fs.mkdir(directory, { recursive: true });
      const files = await fs.readdir(directory);
      const runs = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => {
            try {
              const value: unknown = JSON.parse(
                await fs.readFile(path.join(directory, file), "utf8")
              );
              return isSavedAnalysisRun(value) ? value : null;
            } catch {
              return null;
            }
          })
      );

      return runs
        .filter((run): run is SavedAnalysisRun => run !== null)
        .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    },

    async save(run: SavedAnalysisRun) {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(runFilePath(run.id), `${JSON.stringify(run, null, 2)}\n`, "utf8");
    },

    async delete(id: string) {
      if (!/^[a-zA-Z0-9-]+$/.test(id)) return false;

      try {
        await fs.unlink(runFilePath(id));
        return true;
      } catch (error) {
        if (isRecord(error) && error.code === "ENOENT") return false;
        throw error;
      }
    },
  };
}

const defaultStore = createSavedAnalysisRunStore(SAVED_ANALYSES_DIRECTORY);

export const listSavedAnalysisRuns = () => defaultStore.list();
export const saveAnalysisRun = (run: SavedAnalysisRun) => defaultStore.save(run);
export const deleteAnalysisRun = (id: string) => defaultStore.delete(id);
