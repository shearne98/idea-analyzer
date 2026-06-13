import { NextRequest, NextResponse } from "next/server";
import {
  deleteAnalysisRun,
  isSavedAnalysisRun,
  listSavedAnalysisRuns,
  saveAnalysisRun,
} from "@/lib/saved-analysis-runs";

export async function GET() {
  return NextResponse.json(await listSavedAnalysisRuns());
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isSavedAnalysisRun(body)) {
    return NextResponse.json({ error: "Invalid saved analysis run." }, { status: 400 });
  }

  await saveAnalysisRun(body);
  return NextResponse.json(body, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "Saved analysis ID is required." }, { status: 400 });
  }

  const deleted = await deleteAnalysisRun(id);
  return deleted
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "Saved analysis not found." }, { status: 404 });
}
