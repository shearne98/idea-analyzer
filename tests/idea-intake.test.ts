import { describe, expect, it } from "vitest";
import { combineIdeaWithClarification } from "@/lib/idea-intake";

describe("idea intake journey", () => {
  it("preserves the original idea when clarification context is added", () => {
    const originalIdea = "AI for sports";
    const addedContext =
      "A phone-based highlight service for amateur basketball players, tested manually at one game.";

    expect(combineIdeaWithClarification(originalIdea, addedContext)).toBe(
      `${originalIdea}\n\nAdditional context:\n${addedContext}`
    );
  });
});
