import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  FounderProfileError,
  readFounderProfileMarkdown,
} from "@/lib/founder-profile";

async function withTempDir(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "founder-profile-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("Founder Profile reader", () => {
  it("rejects missing configuration", async () => {
    await expect(readFounderProfileMarkdown(undefined)).rejects.toMatchObject({
      kind: "not_configured",
    } satisfies Partial<FounderProfileError>);
  });

  it("rejects a missing file without exposing its path", async () => {
    const missingPath = path.join(os.tmpdir(), "private-founder-profile.md");

    await expect(readFounderProfileMarkdown(missingPath)).rejects.toMatchObject({
      kind: "not_found",
      message: "Founder Profile could not be read.",
    } satisfies Partial<FounderProfileError>);
  });

  it("rejects empty content", async () => {
    await withTempDir(async (directory) => {
      const profilePath = path.join(directory, "founder-profile.md");
      await writeFile(profilePath, "  \n", "utf8");

      await expect(readFounderProfileMarkdown(profilePath)).rejects.toMatchObject({
        kind: "empty",
      } satisfies Partial<FounderProfileError>);
    });
  });

  it("rejects unreadable paths", async () => {
    await withTempDir(async (directory) => {
      await expect(readFounderProfileMarkdown(directory)).rejects.toMatchObject({
        kind: "unreadable",
      } satisfies Partial<FounderProfileError>);
    });
  });

  it("reads the file fresh for each Idea analysis run", async () => {
    await withTempDir(async (directory) => {
      const profilePath = path.join(directory, "founder-profile.md");
      await writeFile(profilePath, "First profile version", "utf8");
      await expect(readFounderProfileMarkdown(profilePath)).resolves.toBe(
        "First profile version"
      );

      await writeFile(profilePath, "Second profile version", "utf8");
      await expect(readFounderProfileMarkdown(profilePath)).resolves.toBe(
        "Second profile version"
      );
    });
  });
});
