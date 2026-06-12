"use client";

import { useState } from "react";
import { DEFAULT_OLLAMA_MODEL, OLLAMA_MODELS, type OllamaModel } from "@/lib/ollama-models";

type ManualTest = {
  goal: string;
  steps: string[];
  successCriteria: string[];
  failureCriteria: string[];
  timeRequired: string;
  costEstimate: string;
};

type AnalysisResult = {
  ideaSummary: string;
  oneSentenceVerdict: string;
  strongestVersion: string;
  smallestViableWedge: string;
  targetCustomer: string;
  corePainOrDesire: string;
  founderFitScore: number;
  founderFitReason: string;
  painOrDesireScore: number;
  painOrDesireReason: string;
  mvpTestabilityScore: number;
  mvpTestabilityReason: string;
  commercialPotentialScore: number;
  commercialPotentialReason: string;
  scoreCalibration: string;
  mostDangerousAssumption: string;
  whyThisMightFail: string[];
  whatNotToBuildYet: string[];
  manualValidationTest: ManualTest;
  questionsToAskUsers: string[];
  evidenceNeededBeforeBuilding: string[];
  recommendedNextAction: string;
  buildDecision: "build_later" | "test_manually_first" | "pause" | "kill";
};

export default function Home() {
  const [idea, setIdea] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedModel, setSelectedModel] = useState<OllamaModel>(DEFAULT_OLLAMA_MODEL);
  const [analyzedModel, setAnalyzedModel] = useState<OllamaModel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const formatList = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map((item) => String(item));
    if (typeof value === "string") {
      return value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  };

  const hasContent = (value: unknown) => {
    if (Array.isArray(value)) return value.length > 0;
    return typeof value === "string" && value.trim().length > 0;
  };

  const buildDecisionLabel = (decision: AnalysisResult["buildDecision"]) => {
    switch (decision) {
      case "test_manually_first":
        return "Test manually first";
      case "build_later":
        return "Build later";
      case "pause":
        return "Pause";
      case "kill":
        return "Kill";
      default:
        return decision;
    }
  };

  const buildDecisionStyles = (decision: AnalysisResult["buildDecision"]) => {
    switch (decision) {
      case "test_manually_first":
        return "border-amber-200 bg-amber-50 text-amber-800";
      case "build_later":
        return "border-sky-200 bg-sky-50 text-sky-800";
      case "pause":
        return "border-slate-300 bg-slate-100 text-slate-700";
      case "kill":
        return "border-rose-200 bg-rose-50 text-rose-800";
      default:
        return "border-slate-300 bg-slate-100 text-slate-700";
    }
  };

  async function handleAnalyze() {
    setError("");
    setResult(null);
    setAnalyzedModel(null);
    if (!idea.trim()) {
      setError("Please enter a business idea before analyzing.");
      return;
    }

    setIsLoading(true);
    const requestedModel = selectedModel;

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idea: idea.trim(), model: requestedModel }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || "Analysis failed. Please try again.");
        return;
      }

      setResult(data);
      setAnalyzedModel(requestedModel);
    } catch {
      setError("Unable to connect to the analysis service. Check your network or make sure Ollama is running.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-12 sm:px-8">
        <div className="mb-10 rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-sm shadow-slate-200">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Business Idea Analyzer
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Paste your business idea and get a skeptical product strategist view with practical next steps.
          </p>

          <label className="mt-8 block text-sm font-medium text-slate-700">Business idea</label>
          <textarea
            rows={8}
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-950 shadow-inner outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            placeholder="Describe the product, customers, problem, or the core concept..."
          />

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label htmlFor="model" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Ollama model
              </label>
              <select
                id="model"
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value as OllamaModel)}
                disabled={isLoading}
                className="mt-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {OLLAMA_MODELS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isLoading}
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isLoading ? "Analyzing..." : "Analyze"}
            </button>
          </div>
        </div>

        {result ? (
          <section className="space-y-6 pb-12">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-9">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Decision</p>
              <h2 className="mt-3 max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-3xl">
                {result.ideaSummary}
              </h2>
              {analyzedModel ? (
                <p className="mt-3 text-xs text-slate-500">
                  Analyzed with: <span className="font-medium text-slate-600">{analyzedModel}</span>
                </p>
              ) : null}

              <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Recommended decision
                  </p>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${buildDecisionStyles(result.buildDecision)}`}
                  >
                    {buildDecisionLabel(result.buildDecision)}
                  </span>
                </div>
                <p className="mt-4 text-lg font-semibold leading-7 text-slate-900 sm:text-xl">
                  {result.oneSentenceVerdict}
                </p>
                {hasContent(result.corePainOrDesire) ? (
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{result.corePainOrDesire}</p>
                ) : null}
              </div>

              {hasContent(result.smallestViableWedge) ? (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100 sm:p-6">
                  <h3 className="text-base font-semibold text-slate-900">Smallest Viable Wedge</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{result.smallestViableWedge}</p>
                </div>
              ) : null}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {hasContent(result.strongestVersion) ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50">
                  <h3 className="text-base font-semibold text-slate-900">Strongest Version</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{result.strongestVersion}</p>
                </div>
              ) : null}
              {hasContent(result.targetCustomer) ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50">
                  <h3 className="text-base font-semibold text-slate-900">Target Customer</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{result.targetCustomer}</p>
                </div>
              ) : null}
            </div>

            <div>
              <h2 className="mb-4 text-lg font-semibold tracking-tight text-slate-950">Decision Scores</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: "Founder fit", score: result.founderFitScore, reason: result.founderFitReason },
                  { label: "Pain / desire", score: result.painOrDesireScore, reason: result.painOrDesireReason },
                  { label: "MVP testability", score: result.mvpTestabilityScore, reason: result.mvpTestabilityReason },
                  {
                    label: "Commercial potential",
                    score: result.commercialPotentialScore,
                    reason: result.commercialPotentialReason,
                  },
                ].map(({ label, score, reason }) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
                      <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-2 text-sm font-bold text-slate-700">
                        {score}
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-600">{reason}</p>
                  </div>
                ))}
              </div>
              {hasContent(result.scoreCalibration) ? (
                <p className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-500">
                  <span className="font-semibold text-slate-700">Score calibration:</span> {result.scoreCalibration}
                </p>
              ) : null}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {hasContent(result.mostDangerousAssumption) ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50">
                  <h3 className="text-base font-semibold text-slate-900">Most Dangerous Assumption</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{result.mostDangerousAssumption}</p>
                </div>
              ) : null}
              {hasContent(result.whyThisMightFail) ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50">
                  <h3 className="text-base font-semibold text-slate-900">Risks &amp; Assumptions</h3>
                  <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-6 text-slate-600 marker:text-slate-400">
                    {formatList(result.whyThisMightFail).map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {hasContent(result.whatNotToBuildYet) ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50">
                <h3 className="text-base font-semibold text-slate-900">What Not To Build Yet</h3>
                <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-6 text-slate-600 marker:text-slate-400">
                  {formatList(result.whatNotToBuildYet).map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50 sm:p-8">
              <h3 className="text-lg font-semibold tracking-tight text-slate-950">7-Day Validation Test</h3>
              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <div className="space-y-6">
                  {hasContent(result.manualValidationTest.goal) ? (
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Goal</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{result.manualValidationTest.goal}</p>
                    </div>
                  ) : null}
                  {hasContent(result.manualValidationTest.steps) ? (
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Steps</p>
                      <ul className="mt-2 list-disc space-y-2.5 pl-5 text-sm leading-6 text-slate-600 marker:text-slate-400">
                        {formatList(result.manualValidationTest.steps).map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {hasContent(result.manualValidationTest.successCriteria) ? (
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Success criteria</p>
                      <ul className="mt-2 list-disc space-y-2.5 pl-5 text-sm leading-6 text-slate-600 marker:text-slate-400">
                        {formatList(result.manualValidationTest.successCriteria).map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-6">
                  {hasContent(result.manualValidationTest.failureCriteria) ? (
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Failure criteria</p>
                      <ul className="mt-2 list-disc space-y-2.5 pl-5 text-sm leading-6 text-slate-600 marker:text-slate-400">
                        {formatList(result.manualValidationTest.failureCriteria).map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {hasContent(result.manualValidationTest.timeRequired) ? (
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Time required</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{result.manualValidationTest.timeRequired}</p>
                      </div>
                    ) : null}
                    {hasContent(result.manualValidationTest.costEstimate) ? (
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cost estimate</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{result.manualValidationTest.costEstimate}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {hasContent(result.questionsToAskUsers) ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50">
                  <h3 className="text-base font-semibold text-slate-900">User Questions</h3>
                  <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-6 text-slate-600 marker:text-slate-400">
                      {formatList(result.questionsToAskUsers).map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                  </ul>
                </div>
              ) : null}
              {hasContent(result.evidenceNeededBeforeBuilding) ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50">
                  <h3 className="text-base font-semibold text-slate-900">Evidence Needed Before Building</h3>
                  <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-6 text-slate-600 marker:text-slate-400">
                      {formatList(result.evidenceNeededBeforeBuilding).map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {hasContent(result.recommendedNextAction) ? (
              <div className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recommended Next Action</p>
                <p className="mt-3 text-base font-semibold leading-7 text-slate-900">{result.recommendedNextAction}</p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
