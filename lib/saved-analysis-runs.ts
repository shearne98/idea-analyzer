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

const LEGACY_RESPONSE_FIELDS = [
  "smallestViableWedge",
  "paymentValidation",
  "manualValidationTest",
  "questionsToAskUsers",
  "evidenceNeededBeforeBuilding",
  "recommendedNextAction",
  "afterFirstPayment",
  "founderFitScore",
  "founderFitReason",
  "painOrDesireScore",
  "painOrDesireReason",
  "mvpTestabilityScore",
  "mvpTestabilityReason",
  "commercialPotentialScore",
  "commercialPotentialReason",
  "scoreCalibration",
  "buildDecision",
] as const;

function migrateSavedAnalysisRun(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.response) || value.response.status !== "analysis") {
    return value;
  }

  const response = { ...value.response };
  const payment = isRecord(response.paymentValidation) ? response.paymentValidation : {};
  const manual = isRecord(response.manualValidationTest) ? response.manualValidationTest : {};
  const successCriteria = Array.isArray(manual.successCriteria) ? manual.successCriteria : [];
  const questions = Array.isArray(response.questionsToAskUsers) ? response.questionsToAskUsers : [];
  const evidence = Array.isArray(response.evidenceNeededBeforeBuilding)
    ? response.evidenceNeededBeforeBuilding
    : [];

  response.firstTestableVersion =
    String(response.firstTestableVersion ?? response.smallestViableWedge ?? "").trim();
  response.validationPlan = isRecord(response.validationPlan)
    ? response.validationPlan
    : {
        testType: "7_day_payment_validation",
        testTypeLabel: "7-Day Payment Validation",
        goal: String(payment.goal ?? manual.goal ?? "").trim(),
        offerOrExperiment: String(payment.offer ?? response.firstTestableVersion ?? "").trim(),
        steps: Array.isArray(payment.steps) ? payment.steps : Array.isArray(manual.steps) ? manual.steps : [],
        decisionRule: String(payment.decisionRule ?? successCriteria[0] ?? "").trim(),
        constraints: Array.isArray(payment.constraints)
          ? payment.constraints
          : Array.isArray(manual.failureCriteria)
            ? manual.failureCriteria
            : [],
        timeRequired: String(payment.timeRequired ?? manual.timeRequired ?? "").trim(),
        costEstimate: String(payment.costEstimate ?? manual.costEstimate ?? "").trim(),
      };
  response.keyUnknowns = Array.isArray(response.keyUnknowns)
    ? response.keyUnknowns
    : [...questions, ...evidence].map((item, index) => ({
        unknown: String(evidence[index] ?? item),
        howToResolve: String(questions[index] ?? "Resolve this during the Validation Plan."),
      }));
  response.afterValidation = isRecord(response.afterValidation)
    ? response.afterValidation
    : isRecord(response.afterFirstPayment)
      ? response.afterFirstPayment
      : {
          deliverManually: "Fulfil the promise manually for the first validated customers.",
          learnFromCustomers: "Learn what customers valued and what confused them.",
          repeatBeforeScaling: "Repeat the validation signal before systematizing or scaling.",
        };

  for (const field of LEGACY_RESPONSE_FIELDS) delete response[field];
  return { ...value, response };
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
              const original: unknown = JSON.parse(
                await fs.readFile(path.join(directory, file), "utf8")
              );
              const migrated = migrateSavedAnalysisRun(original);
              if (!isSavedAnalysisRun(migrated)) return null;
              if (JSON.stringify(migrated) !== JSON.stringify(original)) {
                await fs.writeFile(
                  path.join(directory, file),
                  `${JSON.stringify(migrated, null, 2)}\n`,
                  "utf8"
                );
              }
              return migrated;
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
