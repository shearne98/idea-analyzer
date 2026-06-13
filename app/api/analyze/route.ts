import { NextRequest, NextResponse } from "next/server";
import { IdeaAnalysisRunError, runIdeaAnalysis } from "@/lib/idea-analysis-run";
import { isOllamaModel, OLLAMA_MODELS } from "@/lib/ollama-models";

export async function POST(req: NextRequest) {
  let body: { idea?: unknown; model?: unknown } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const idea = typeof body.idea === "string" ? body.idea.trim() : "";

  if (!idea) {
    return NextResponse.json({ error: "Business idea is required." }, { status: 400 });
  }

  if (!isOllamaModel(body.model)) {
    return NextResponse.json(
      { error: `Invalid model. Choose one of: ${OLLAMA_MODELS.join(", ")}.` },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await runIdeaAnalysis({ idea, model: body.model }));
  } catch (error) {
    const runError =
      error instanceof IdeaAnalysisRunError
        ? error
        : new IdeaAnalysisRunError("Analysis failed: Unexpected server error.", "analysis_failed");

    return NextResponse.json(
      { error: runError.message },
      { status: runError.kind === "ollama_unavailable" ? 502 : 500 }
    );
  }
}
