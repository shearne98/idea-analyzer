import { describe, expect, it } from "vitest";
import { parseIdeaTestCases, readIdeaTestCases } from "@/lib/test-cases";

describe("development test cases", () => {
  it("parses multiple human-readable test cases without application code changes", () => {
    const cases = parseIdeaTestCases(`
Test Case 1.

    Business Idea: Basketball highlights

    Target Customer:
    Amateur players

Test Case 7.

    climate app
`);

    expect(cases).toEqual([
      {
        id: "test-case-1",
        title: "Basketball highlights",
        prompt: "Business Idea: Basketball highlights\n\nTarget Customer:\nAmateur players",
      },
      {
        id: "test-case-7",
        title: "Test Case 7",
        prompt: "climate app",
      },
    ]);
  });

  it("provides basketball, compliance-service, and vague-idea regression cases", async () => {
    const cases = await readIdeaTestCases();

    expect(cases.map((testCase) => testCase.title)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/basketball/i),
        expect.stringMatching(/compliance/i),
        expect.stringMatching(/vague/i),
      ])
    );
  });
});
