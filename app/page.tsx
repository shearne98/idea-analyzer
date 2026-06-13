"use client";

import { useState } from "react";
import { AnalysisLoader } from "@/components/AnalysisLoader";
import {
  INTAKE_FIELDS,
  type AnalysisResponse,
  type AnalyzeResponse,
  type ClarificationResponse,
} from "@/lib/analysis-types";
import { DEFAULT_OLLAMA_MODEL, OLLAMA_MODELS, type OllamaModel } from "@/lib/ollama-models";

export default function Home() {
  const [idea, setIdea] = useState("");
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [clarification, setClarification] = useState<ClarificationResponse | null>(null);
  const [additionalContext, setAdditionalContext] = useState("");
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

  const buildDecisionLabel = (decision: AnalysisResponse["buildDecision"]) => {
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

  const buildDecisionStyles = (decision: AnalysisResponse["buildDecision"]) => {
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

  async function analyzeIdea(ideaToAnalyze: string) {
    setError("");
    setResult(null);
    setClarification(null);
    setAnalyzedModel(null);
    if (!ideaToAnalyze.trim()) {
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
        body: JSON.stringify({ idea: ideaToAnalyze.trim(), model: requestedModel }),
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

  function handleAnalyzeWithContext() {
    if (!additionalContext.trim()) {
      setError("Add a little more context before analyzing again.");
      return;
    }

    const richerIdea = `${idea.trim()}\n\nAdditional context:\n${additionalContext.trim()}`;
    setIdea(richerIdea);
    setAdditionalContext("");
    void analyzeIdea(richerIdea);
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
          </section>
        ) : null}

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
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-slate-950">Evidence Scores</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Current evidence strength, not idea excitement.</p>
                </div>
                <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold capitalize text-slate-600">
                  {result.confidenceLevel} confidence
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { title: "Founder fit", assessment: result.founderFit },
                  { title: "Pain / desire", assessment: result.painOrDesire },
                  { title: "MVP testability", assessment: result.mvpTestability },
                  { title: "Commercial potential", assessment: result.commercialPotential },
                ].map(({ title, assessment }) => (
                  <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                        <p className="mt-1 text-xs font-medium text-slate-500">{assessment.label}</p>
                      </div>
                      <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-2 text-sm font-bold text-slate-700">
                        {assessment.score}
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-600">{assessment.reason}</p>
                    <details className="mt-4 border-t border-slate-100 pt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-600">Evidence &amp; uncertainty</summary>
                      <div className="mt-3 space-y-3 text-xs leading-5 text-slate-600">
                        <div>
                          <p className="font-semibold text-slate-700">Evidence</p>
                          {assessment.evidence.length > 0 ? (
                            <ul className="mt-1 list-disc space-y-1 pl-4 marker:text-slate-400">
                              {assessment.evidence.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-slate-500">No direct evidence provided.</p>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-700">Uncertainty</p>
                          <p className="mt-1">{assessment.uncertainty}</p>
                        </div>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
              <p className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-500">
                <span className="font-semibold text-slate-700">Score summary:</span> {result.scoreSummary}
              </p>
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
