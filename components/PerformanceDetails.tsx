import type { PerformanceMetrics } from "@/lib/analysis-types";

function formatDuration(milliseconds: number) {
  return milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(2)} s`
    : `${milliseconds.toFixed(milliseconds < 10 ? 2 : 1)} ms`;
}

function formatRate(rate: number) {
  return `${rate.toFixed(2)} tokens/s`;
}

export function PerformanceDetails({ performance }: { performance: PerformanceMetrics }) {
  const metrics = [
    { label: "Model", value: performance.model },
    { label: "Total request time", value: formatDuration(performance.totalRequestMs) },
    { label: "Ollama request time", value: formatDuration(performance.ollamaRequestMs) },
    {
      label: "Ollama total time",
      value: performance.ollamaTotalMs === null ? null : formatDuration(performance.ollamaTotalMs),
    },
    {
      label: "Ollama generation time",
      value: performance.ollamaGenerationMs === null ? null : formatDuration(performance.ollamaGenerationMs),
    },
    {
      label: "Model load time",
      value: performance.modelLoadMs === null ? null : formatDuration(performance.modelLoadMs),
    },
    { label: "Input tokens", value: performance.promptTokens?.toLocaleString() ?? null },
    { label: "Output tokens", value: performance.outputTokens?.toLocaleString() ?? null },
    {
      label: "Input tokens/sec",
      value: performance.promptTokensPerSecond === null ? null : formatRate(performance.promptTokensPerSecond),
    },
    {
      label: "Output tokens/sec",
      value: performance.outputTokensPerSecond === null ? null : formatRate(performance.outputTokensPerSecond),
    },
    {
      label: "JSON parsing time",
      value: performance.jsonParseMs === null ? null : formatDuration(performance.jsonParseMs),
    },
  ].filter((metric) => metric.value !== null);

  return (
    <details className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
      <summary className="cursor-pointer px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Performance
      </summary>
      <dl className="grid gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-2">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between gap-4 bg-white px-5 py-3 text-xs">
            <dt className="text-slate-500">{metric.label}</dt>
            <dd className="font-medium text-slate-700">{metric.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
