import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

async function readFounderProfile() {
  const filePath = path.join(process.cwd(), "founder-profile.md");
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.trim();
  } catch {
    return "";
  }
}

function extractJson(raw: string) {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");

  if (first === -1 || last === -1) {
    throw new Error("AI response did not contain valid JSON.");
  }

  const text = raw.slice(first, last + 1);
  return JSON.parse(text);
}

function normalizeAssistantContent(choice: any): string {
  if (!choice) return "";
  if (typeof choice === "string") return choice;
  if (typeof choice.content === "string") return choice.content;
  if (typeof choice.output === "string") return choice.output;
  if (Array.isArray(choice.content)) {
    return choice.content
      .map((item: any) => (typeof item === "string" ? item : item?.text ?? ""))
      .join("");
  }
  if (Array.isArray(choice.output)) {
    return choice.output
      .map((item: any) => (typeof item === "string" ? item : item?.text ?? ""))
      .join("");
  }
  if (choice.message) return normalizeAssistantContent(choice.message);
  return "";
}

export async function POST(req: NextRequest) {
  let body: { idea?: unknown } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const idea = typeof body.idea === "string" ? body.idea.trim() : "";

  if (!idea) {
    return NextResponse.json({ error: "Business idea is required." }, { status: 400 });
  }

  const founderProfile = await readFounderProfile();
  const founderProfileSection = founderProfile
    ? `Founder profile:\n${founderProfile}`
    : "Founder profile is not available. Founder fit cannot be reliably assessed from the idea alone.";

  try {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen3:8b",
        stream: false,
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content:
              "You are a skeptical product strategist. Analyze startup ideas with practical scrutiny, penalizing vague buyers, weak pain, unclear monetization, and over-complex MVPs. Prefer manual validation before building software. Use the founder profile when assessing founder fit. If the founder profile is missing or empty, state clearly that founder fit cannot be reliably assessed. Return only valid JSON. No markdown, no commentary outside the JSON.",
          },
          {
            role: "user",
            content: `Analyze the following business idea and return only valid JSON with exactly these fields: ideaSummary, oneSentenceVerdict, strongestVersion, smallestViableWedge, targetCustomer, corePainOrDesire, founderFitScore, founderFitReason, painOrDesireScore, painOrDesireReason, mvpTestabilityScore, mvpTestabilityReason, commercialPotentialScore, commercialPotentialReason, scoreCalibration, mostDangerousAssumption, whyThisMightFail, whatNotToBuildYet, manualValidationTest, questionsToAskUsers, evidenceNeededBeforeBuilding, recommendedNextAction, buildDecision. Use scores from 1 to 10. Prefer conservative scores. If evidence is missing, say so clearly. Focus on the smallest useful version of the idea and separate future vision from MVP reality. Identify what not to build yet. The manualValidationTest object is mandatory. steps must contain 3 to 7 concrete steps. successCriteria must contain 2 to 4 measurable criteria. failureCriteria must contain 2 to 4 measurable criteria. timeRequired and costEstimate must be realistic and specific. The test must be possible within 7 days using existing tools such as phone camera, Google Drive, WhatsApp, Google Forms, Notion, Stripe payment links, manual editing, spreadsheets, or direct outreach. Do not recommend building software as the first validation test unless there is evidence of demand. Return only valid JSON. No markdown, no commentary outside JSON.

Business idea: "${idea}"

${founderProfileSection}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          error:
            errorText ||
            `Ollama returned an unexpected status: ${response.status}`,
        },
        { status: response.status }
      );
    }

    let rawResponse: unknown;
    try {
      rawResponse = await response.json();
    } catch {
      rawResponse = await response.text();
    }

    let assistantText = "";
    if (typeof rawResponse === "string") {
      assistantText = rawResponse;
    } else if (typeof rawResponse === "object" && rawResponse !== null) {
      const data = rawResponse as any;
      const firstChoice = Array.isArray(data.choices) ? data.choices[0] : data;
      assistantText = normalizeAssistantContent(firstChoice) || normalizeAssistantContent(data);
    }

    if (!assistantText) {
      throw new Error("Ollama returned an empty assistant response.");
    }

    let parsed: any;
    try {
      parsed = extractJson(assistantText);
    } catch (parseError) {
      throw new Error(
        `Unable to parse JSON from Ollama response: ${parseError instanceof Error ? parseError.message : String(parseError)}. Response: ${assistantText.slice(0, 300)}`
      );
    }

    const normalizeArrayField = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.map((item) => String(item));
      if (typeof value === "string") {
        return value
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean);
      }
      return [];
    };

    const normalizeManualTest = (value: unknown) => {
      if (typeof value !== "object" || value === null) {
        return {
          goal: "",
          steps: [],
          successCriteria: [],
          failureCriteria: [],
          timeRequired: "",
          costEstimate: "",
        };
      }

      const test = value as any;
      return {
        goal: String(test.goal ?? ""),
        steps: normalizeArrayField(test.steps),
        successCriteria: normalizeArrayField(test.successCriteria),
        failureCriteria: normalizeArrayField(test.failureCriteria),
        timeRequired: String(test.timeRequired ?? ""),
        costEstimate: String(test.costEstimate ?? ""),
      };
    };

    parsed.whyThisMightFail = normalizeArrayField(parsed.whyThisMightFail);
    parsed.whatNotToBuildYet = normalizeArrayField(parsed.whatNotToBuildYet);
    parsed.questionsToAskUsers = normalizeArrayField(parsed.questionsToAskUsers);
    parsed.evidenceNeededBeforeBuilding = normalizeArrayField(parsed.evidenceNeededBeforeBuilding);
    parsed.manualValidationTest = normalizeManualTest(parsed.manualValidationTest);

    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const isConnectionError = /Failed to fetch|ECONNREFUSED|connect/i.test(message);

    return NextResponse.json(
      {
        error: isConnectionError
          ? "Unable to connect to local Ollama at http://localhost:11434. Please make sure Ollama is running."
          : `Analysis failed: ${message}`,
      },
      { status: isConnectionError ? 502 : 500 }
    );
  }
}
