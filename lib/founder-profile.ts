import { promises as fs } from "fs";

export class FounderProfileError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "not_found" | "empty" | "unreadable"
  ) {
    super(message);
    this.name = "FounderProfileError";
  }
}

export async function readFounderProfileMarkdown(filePath: string | undefined) {
  if (!filePath?.trim()) {
    throw new FounderProfileError(
      "Founder Profile is not configured.",
      "not_configured"
    );
  }

  try {
    const content = await fs.readFile(filePath, "utf8");
    if (!content.trim()) {
      throw new FounderProfileError("Founder Profile is empty.", "empty");
    }
    return content;
  } catch (error) {
    if (error instanceof FounderProfileError) throw error;
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new FounderProfileError(
        "Founder Profile could not be read.",
        "not_found"
      );
    }
    throw new FounderProfileError(
      "Founder Profile could not be read.",
      "unreadable"
    );
  }
}
