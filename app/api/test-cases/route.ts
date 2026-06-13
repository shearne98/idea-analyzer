import { NextResponse } from "next/server";
import { readIdeaTestCases } from "@/lib/test-cases";

export async function GET() {
  try {
    return NextResponse.json(await readIdeaTestCases());
  } catch {
    return NextResponse.json(
      { error: "Unable to read the test-cases file." },
      { status: 500 }
    );
  }
}
