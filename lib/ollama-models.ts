export const OLLAMA_MODELS = [
  "qwen3:8b",
  "llama3.1:latest",
  "deepseek-r1:8b",
  "qwen2.5:7b",
] as const;

export type OllamaModel = (typeof OLLAMA_MODELS)[number];

export const DEFAULT_OLLAMA_MODEL: OllamaModel = "qwen3:8b";

export const ANALYSIS_MODES = [
  {
    id: "balanced",
    label: "Balanced",
    description: "Strong general analysis without an extended reasoning trace.",
    model: "qwen3:8b",
    deepThinking: false,
  },
  {
    id: "thorough",
    label: "Thorough",
    description: "Qwen with thinking mode for more deliberate analysis.",
    model: "qwen3:8b",
    deepThinking: true,
  },
  {
    id: "fast_alternative",
    label: "Fast alternative",
    description: "Compare against the smaller Qwen 2.5 model.",
    model: "qwen2.5:7b",
    deepThinking: false,
  },
  {
    id: "reasoning_comparison",
    label: "Reasoning comparison",
    description: "Compare against DeepSeek R1 with thinking mode.",
    model: "deepseek-r1:8b",
    deepThinking: true,
  },
  {
    id: "llama_comparison",
    label: "Llama comparison",
    description: "Compare against Llama 3.1 without thinking mode.",
    model: "llama3.1:latest",
    deepThinking: false,
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  model: OllamaModel;
  deepThinking: boolean;
}[];

export type AnalysisMode = (typeof ANALYSIS_MODES)[number];
export type AnalysisModeId = AnalysisMode["id"];

export const DEFAULT_ANALYSIS_MODE_ID: AnalysisModeId = "balanced";

export function isOllamaModel(value: unknown): value is OllamaModel {
  return typeof value === "string" && OLLAMA_MODELS.some((model) => model === value);
}

export function isAnalysisModeId(value: unknown): value is AnalysisModeId {
  return typeof value === "string" && ANALYSIS_MODES.some((mode) => mode.id === value);
}

export function findAnalysisMode(id: AnalysisModeId) {
  return ANALYSIS_MODES.find((mode) => mode.id === id) ?? ANALYSIS_MODES[0];
}

export function findAnalysisModeByConfiguration(model: string, deepThinking: boolean) {
  return ANALYSIS_MODES.find(
    (mode) => mode.model === model && mode.deepThinking === deepThinking
  );
}

export function isSupportedAnalysisConfiguration(model: unknown, deepThinking: unknown) {
  return (
    typeof model === "string" &&
    typeof deepThinking === "boolean" &&
    findAnalysisModeByConfiguration(model, deepThinking) !== undefined
  );
}
