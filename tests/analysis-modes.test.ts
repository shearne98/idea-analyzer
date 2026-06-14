import { describe, expect, it } from "vitest";
import {
  ANALYSIS_MODES,
  DEFAULT_ANALYSIS_MODE_ID,
  findAnalysisMode,
  isAnalysisModeId,
  isSupportedAnalysisConfiguration,
} from "@/lib/ollama-models";

describe("analysis modes", () => {
  it("provides a balanced Qwen mode as the default", () => {
    expect(findAnalysisMode(DEFAULT_ANALYSIS_MODE_ID)).toMatchObject({
      label: "Balanced",
      model: "qwen3:8b",
      deepThinking: false,
    });
  });

  it("offers only supported model and thinking combinations", () => {
    expect(ANALYSIS_MODES).toHaveLength(5);
    expect(isSupportedAnalysisConfiguration("qwen3:8b", true)).toBe(true);
    expect(isSupportedAnalysisConfiguration("qwen3:8b", false)).toBe(true);
    expect(isSupportedAnalysisConfiguration("deepseek-r1:8b", true)).toBe(true);
    expect(isSupportedAnalysisConfiguration("llama3.1:latest", true)).toBe(false);
    expect(isSupportedAnalysisConfiguration("qwen2.5:7b", true)).toBe(false);
    expect(isSupportedAnalysisConfiguration("deepseek-r1:8b", false)).toBe(false);
  });

  it("validates analysis mode identifiers", () => {
    expect(isAnalysisModeId("thorough")).toBe(true);
    expect(isAnalysisModeId("unsupported")).toBe(false);
  });
});
