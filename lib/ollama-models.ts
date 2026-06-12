export const OLLAMA_MODELS = [
  "qwen3:8b",
  "llama3.1:latest",
  "deepseek-r1:8b",
  "qwen2.5:7b",
] as const;

export type OllamaModel = (typeof OLLAMA_MODELS)[number];

export const DEFAULT_OLLAMA_MODEL: OllamaModel = "qwen3:8b";

export function isOllamaModel(value: unknown): value is OllamaModel {
  return typeof value === "string" && OLLAMA_MODELS.some((model) => model === value);
}
