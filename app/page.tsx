"use client";

import { useEffect, useState } from "react";
import { AnalysisLoader } from "@/components/AnalysisLoader";
import { PerformanceDetails } from "@/components/PerformanceDetails";
import { SavedAnalysisRuns, type SavedAnalysisRun } from "@/components/SavedAnalysisRuns";
import {
  INTAKE_FIELDS,
  type AnalysisResponse,
  type AnalyzeResponse,
  type ClarificationResponse,
} from "@/lib/analysis-types";
import {
  buildAnalysisViewModel,
  formatList,
  hasDisplayContent,
} from "@/lib/analysis-rendering";
import { combineIdeaWithClarification } from "@/lib/idea-intake";
import {
  ANALYSIS_MODES,
  DEFAULT_ANALYSIS_MODE_ID,
  findAnalysisMode,
  findAnalysisModeByConfiguration,
  type AnalysisModeId,
  type OllamaModel,
} from "@/lib/ollama-models";
import type { IdeaTestCase } from "@/lib/test-cases";

export default function Home() {
  const [idea, setIdea] = useState("");
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [clarification, setClarification] = useState<ClarificationResponse | null>(null);
  const [additionalContext, setAdditionalContext] = useState("");
  const [selectedAnalysisModeId, setSelectedAnalysisModeId] =
    useState<AnalysisModeId>(DEFAULT_ANALYSIS_MODE_ID);
  const [analyzedModel, setAnalyzedModel] = useState<OllamaModel | null>(null);
  const [analyzedWithDeepThinking, setAnalyzedWithDeepThinking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [testCases, setTestCases] = useState<IdeaTestCase[]>([]);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadTestCases() {
      try {
        const response = await fetch("/api/test-cases");
        if (!response.ok) return;
        const value: unknown = await response.json();
        if (!cancelled && Array.isArray(value)) {
          const cases = value as IdeaTestCase[];
          setTestCases(cases);
          setSelectedTestCaseId(cases[0]?.id ?? "");
        }
      } catch {
        // The idea input remains fully usable when the optional test-case file is unavailable.
      }
    }

    void loadTestCases();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderListOrParagraph = (value: unknown) => {
    const items = formatList(value);

    if (items.length === 1) {
      return <p className="mt-3 text-sm leading-6 text-slate-600">{items[0]}</p>;
    }

    return (
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600 marker:text-slate-400">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  };

  async function analyzeIdea(ideaToAnalyze: string) {
    setError("");
    setResult(null);
    setClarification(null);
    setAnalyzedModel(null);
    setAnalyzedWithDeepThinking(false);
    if (!ideaToAnalyze.trim()) {
      setError("Please enter a business idea before analyzing.");
      return;
    }

    setIsLoading(true);
    const analysisMode = findAnalysisMode(selectedAnalysisModeId);
    const requestedModel = analysisMode.model;
    const requestedDeepThinking = analysisMode.deepThinking;

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idea: ideaToAnalyze.trim(),
          model: requestedModel,
          deepThinking: requestedDeepThinking,
        }),
      });

      const data: AnalyzeResponse & { error?: string } = await response.json();
      if (!response.ok) {
        setError(data?.error || "Analysis failed. Please try again.");
        return;
      }

      if (data.status === "needs_clarification") {
        setClarification(data);
      } else {
        setResult(data);
        setAnalyzedModel(requestedModel);
        setAnalyzedWithDeepThinking(requestedDeepThinking);
      }
    } catch {
      setError("Unable to connect to the analysis service. Check your network or make sure Ollama is running.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleAnalyze() {
    setAdditionalContext("");
    void analyzeIdea(idea);
  }

  function useSelectedTestCase() {
    const testCase = testCases.find((item) => item.id === selectedTestCaseId);
    if (!testCase) return;

    setIdea(testCase.prompt);
    setError("");
    setResult(null);
    setClarification(null);
    setAdditionalContext("");
  }

  function handleAnalyzeWithContext() {
    if (!additionalContext.trim()) {
      setError("Add a little more context before analyzing again.");
      return;
    }

    const richerIdea = combineIdeaWithClarification(idea, additionalContext);
    setIdea(richerIdea);
    setAdditionalContext("");
    void analyzeIdea(richerIdea);
  }

  function openSavedRun(run: SavedAnalysisRun) {
    setIdea(run.idea);
    setError("");
    setAdditionalContext("");
    const savedMode = findAnalysisModeByConfiguration(
      run.response.runMetadata.model,
      run.response.runMetadata.deepThinking
    );
    setSelectedAnalysisModeId(savedMode?.id ?? DEFAULT_ANALYSIS_MODE_ID);
    setAnalyzedModel(run.response.runMetadata.model as OllamaModel);
    setAnalyzedWithDeepThinking(run.response.runMetadata.deepThinking);
    if (run.response.status === "analysis") {
      setResult(run.response);
      setClarification(null);
    } else {
      setClarification(run.response);
      setResult(null);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const selectedAnalysisMode = findAnalysisMode(selectedAnalysisModeId);
  const analysisViewModel = result ? buildAnalysisViewModel(result) : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" aria-busy={isLoading}>
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
            <div
              role="alert"
              className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {error}
            </div>
          ) : null}

          <div className="mt-6">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isLoading}
              className="inline-flex w-full items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
            >
              {isLoading ? "Analyzing..." : "Analyze"}
            </button>

            <details className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70">
              <summary className="cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Development controls
              </summary>
              <div className="flex flex-col gap-4 border-t border-slate-200 p-4 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="max-w-sm">
                  <label htmlFor="analysis-mode" className="block text-xs font-semibold text-slate-600">
                    Analysis mode
                  </label>
                  <select
                    id="analysis-mode"
                    value={selectedAnalysisModeId}
                    onChange={(event) => setSelectedAnalysisModeId(event.target.value as AnalysisModeId)}
                    disabled={isLoading}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {ANALYSIS_MODES.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {selectedAnalysisMode.description}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {selectedAnalysisMode.model}
                    {selectedAnalysisMode.deepThinking ? " · Thinking mode" : ""}
                  </p>
                </div>
                {testCases.length > 0 ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div>
                      <label htmlFor="test-case" className="block text-xs font-semibold text-slate-600">
                        Test case
                      </label>
                      <select
                        id="test-case"
                        aria-label="Select test case"
                        value={selectedTestCaseId}
                        onChange={(event) => setSelectedTestCaseId(event.target.value)}
                        disabled={isLoading}
                        className="mt-2 max-w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 sm:max-w-80"
                      >
                        {testCases.map((testCase) => (
                          <option key={testCase.id} value={testCase.id}>{testCase.title}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={useSelectedTestCase}
                      disabled={isLoading || !selectedTestCaseId}
                      className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      Use test case
                    </button>
                  </div>
                ) : null}
              </div>
            </details>
          </div>
        </div>

        {isLoading ? <AnalysisLoader /> : null}

        {clarification && !isLoading ? (
          <section className="mb-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Idea intake</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">More context needed</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              This idea is too vague to analyze without inventing assumptions.
            </p>
            <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              {clarification.reason}
            </p>

            {clarification.missingFields.length > 0 ? (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-900">Missing context</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {clarification.missingFields.map((fieldKey) => {
                    const field = INTAKE_FIELDS.find((candidate) => candidate.key === fieldKey);
                    if (!field) return null;

                    return (
                      <div key={field.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-900">{field.label}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{field.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {clarification.clarifyingQuestions.length > 0 ? (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-900">Answer these questions</h3>
                <ol className="mt-3 space-y-3">
                  {clarification.clarifyingQuestions.map((question, index) => (
                    <li key={question} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {index + 1}
                      </span>
                      <span>{question}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {clarification.possibleDirections.length > 0 ? (
              <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
                <h3 className="text-sm font-semibold text-slate-900">Possible directions</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Examples only, not assumptions about your idea.</p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600 marker:text-sky-400">
                  {clarification.possibleDirections.map((direction) => (
                    <li key={direction}>{direction}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <label htmlFor="additional-context" className="mt-6 block text-sm font-semibold text-slate-900">
              Add more detail
            </label>
            <textarea
              id="additional-context"
              rows={6}
              value={additionalContext}
              onChange={(event) => setAdditionalContext(event.target.value)}
              placeholder="Answer the questions above in your own words..."
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <button
              type="button"
              onClick={handleAnalyzeWithContext}
              className="mt-4 inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Analyze with added context
            </button>
            <details className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70">
              <summary className="cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Development output tools
              </summary>
              <div className="space-y-3 border-t border-slate-200 p-4">
                <PerformanceDetails
                  performance={clarification.performance}
                  runMetadata={clarification.runMetadata}
                />
                <SavedAnalysisRuns idea={idea} response={clarification} onOpen={openSavedRun} />
              </div>
            </details>
          </section>
        ) : null}

        {result ? (
          <section className="space-y-6 pb-12">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
              <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-5 sm:px-9">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${analysisViewModel?.strategyStyle}`}
                  >
                    {result.recommendedStrategyLabel}
                  </span>
                  {analyzedModel ? (
                    <p className="text-xs text-slate-500">
                      Analyzed with <span className="font-medium text-slate-600">{analyzedModel}</span>
                      {analyzedWithDeepThinking ? " · Thinking mode" : ""}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="p-6 sm:p-9">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Recommended direction
                </p>
                <h2 className="mt-3 max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-3xl">
                  {result.oneSentenceVerdict}
                </h2>
                {hasDisplayContent(result.strategyReason) ? (
                  <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                    {result.strategyReason}
                  </p>
                ) : null}
                <p className="mt-6 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500">
                  <span className="font-semibold text-slate-700">Idea:</span> {result.ideaSummary}
                </p>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {hasDisplayContent(result.targetCustomer) ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50">
                  <h3 className="text-base font-semibold text-slate-900">Target Customer</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{result.targetCustomer}</p>
                </div>
              ) : null}
              {hasDisplayContent(result.corePainOrDesire) ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50">
                  <h3 className="text-base font-semibold text-slate-900">Core Pain or Desire</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{result.corePainOrDesire}</p>
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50 sm:p-8">
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Product Scope</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Keep the long-term opportunity separate from what should be tested now.
              </p>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {hasDisplayContent(result.firstTestableVersion) ? (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-5 lg:row-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Build or deliver now</p>
                    <h3 className="mt-2 text-base font-semibold text-slate-900">First Testable Version</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{result.firstTestableVersion}</p>
                  </div>
                ) : null}
                {hasDisplayContent(result.strongestVersion) ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-base font-semibold text-slate-900">Strongest Version</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{result.strongestVersion}</p>
                  </div>
                ) : null}
                {hasDisplayContent(result.whatNotToBuildYet) ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-base font-semibold text-slate-900">What Not To Build Yet</h3>
                    {renderListOrParagraph(result.whatNotToBuildYet)}
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-slate-950">Idea Assessment</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    A practical assessment across four key areas.
                  </p>
                </div>
                <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold capitalize text-slate-600">
                  {result.confidenceLevel} confidence
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {analysisViewModel?.scoreCards.map(({ title, assessment }) => (
                  <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                        <p className="mt-1 text-xs font-medium text-slate-500">{assessment.label}</p>
                      </div>
                      <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-2 text-sm font-bold text-slate-700">
                        {assessment.score ?? "—"}
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-600">{assessment.reason}</p>
                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600">
                      <div>
                        <p className="font-semibold text-slate-700">What would change the score</p>
                        <p className="mt-1">{assessment.uncertainty}</p>
                      </div>
                      {assessment.evidence.length > 0 ? (
                        <div>
                          <p className="font-semibold text-slate-700">Evidence observed</p>
                          <ul className="mt-1 list-disc space-y-1 pl-4 marker:text-slate-400">
                            {assessment.evidence.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-500">
                <span className="font-semibold text-slate-700">Assessment summary:</span> {result.scoreSummary}
              </p>
            </div>

            {result.criticalRisksAndUnknowns.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50 sm:p-8">
                <h3 className="text-lg font-semibold tracking-tight text-slate-950">
                  Critical Risks &amp; Unknowns
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  The concerns most likely to change whether, when, or how this idea should progress.
                </p>
                <div className="mt-5 space-y-4">
                  {analysisViewModel?.criticalConcerns.map((item, index) => (
                    <div
                      key={`${item.concern}-${index}`}
                      className={
                        item.priority === "primary"
                          ? "rounded-xl border border-amber-200 bg-amber-50/60 p-5"
                          : "rounded-xl border border-slate-200 bg-slate-50 p-4"
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            item.priority === "primary"
                              ? "rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800"
                              : "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600"
                          }
                        >
                          {item.priority === "primary" ? "Primary concern" : "Secondary concern"}
                        </span>
                        <span className="text-xs font-medium text-slate-500">
                          Address during: {item.stageLabel}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-semibold leading-6 text-slate-900">{item.concern}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.decisionImpact}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-6 shadow-sm shadow-sky-100 sm:p-8">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Immediate next action
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold tracking-tight text-slate-950">Validation Plan</h3>
                <span className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-800">
                  {result.validationPlan.testTypeLabel}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {result.validationPlan.testType === "7_day_payment_validation"
                  ? "Ask for payment or a binding commitment before investing in a full product."
                  : "Use observable behavior to test the most important assumption before making a larger commitment."}
              </p>
              {hasDisplayContent(result.validationPlan.addressesConcern) ? (
                <div className="mt-4 rounded-xl border border-sky-200 bg-white/80 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Addresses</p>
                  <p className="mt-1 text-sm font-medium leading-6 text-slate-800">
                    {result.validationPlan.addressesConcern}
                  </p>
                </div>
              ) : null}
              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <div className="space-y-6">
                  {hasDisplayContent(result.validationPlan.goal) ? (
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Goal</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{result.validationPlan.goal}</p>
                    </div>
                  ) : null}
                  {hasDisplayContent(result.validationPlan.offerOrExperiment) ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {result.validationPlan.testType === "7_day_payment_validation" ? "Paid offer" : "Experiment"}
                      </p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{result.validationPlan.offerOrExperiment}</p>
                    </div>
                  ) : null}
                  {hasDisplayContent(result.validationPlan.steps) ? (
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Steps</p>
                      <ul className="mt-2 list-disc space-y-2.5 pl-5 text-sm leading-6 text-slate-600 marker:text-slate-400">
                        {formatList(result.validationPlan.steps).map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-6">
                  {hasDisplayContent(result.validationPlan.decisionRule) ? (
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Decision rule</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{result.validationPlan.decisionRule}</p>
                    </div>
                  ) : null}
                  {hasDisplayContent(result.validationPlan.constraints) ? (
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Constraints</p>
                      <ul className="mt-2 list-disc space-y-2.5 pl-5 text-sm leading-6 text-slate-600 marker:text-slate-400">
                        {formatList(result.validationPlan.constraints).map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {hasDisplayContent(result.validationPlan.timeRequired) ? (
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Time required</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{result.validationPlan.timeRequired}</p>
                      </div>
                    ) : null}
                    {hasDisplayContent(result.validationPlan.costEstimate) ? (
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cost estimate</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{result.validationPlan.costEstimate}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50 sm:p-8">
              <h3 className="text-lg font-semibold tracking-tight text-slate-950">After Validation</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                If the Validation Plan succeeds, use real delivery and repeated proof to decide what investment comes next.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">Fulfil the validated promise</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    {result.afterValidation.fulfilValidatedPromise}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">Learn during delivery</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-5 text-slate-600 marker:text-slate-400">
                    {result.afterValidation.learnFromDelivery.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4">
                  <p className="text-sm font-semibold text-slate-800">Repeated proof target</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    {result.afterValidation.repeatedProofTarget}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                  <p className="text-sm font-semibold text-slate-800">If proven, invest next in</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    {result.afterValidation.nextInvestmentIfProven}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
                  <p className="text-sm font-semibold text-slate-800">Revise or stop if</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    {result.afterValidation.reviseOrStopIf}
                  </p>
                </div>
              </div>
            </div>

            <details className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70">
              <summary className="cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Development output tools
              </summary>
              <div className="space-y-3 border-t border-slate-200 p-4">
                <PerformanceDetails performance={result.performance} runMetadata={result.runMetadata} />
                <SavedAnalysisRuns idea={idea} response={result} onOpen={openSavedRun} />
              </div>
            </details>
          </section>
        ) : null}
      </div>
    </div>
  );
}
