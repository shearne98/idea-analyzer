import { readFile } from "fs/promises";
import path from "path";
import { describe, expect, it } from "vitest";

async function readReadme() {
  return readFile(path.join(process.cwd(), "README.md"), "utf8");
}

describe("Hearne OS file workflow boundary docs", () => {
  it("documents workspace ownership and artifact locations", async () => {
    const readme = await readReadme();

    expect(readme).toMatch(/Hearne OS owns Business idea workspaces/i);
    expect(readme).toMatch(/source\.md[\s\S]*normalized\.md[\s\S]*analysis\.json[\s\S]*analysis\.md/i);
    expect(readme).toMatch(/live in Hearne OS/i);
    expect(readme).toMatch(/not inside Idea Analyzer/i);
  });

  it("documents the Idea Analyzer boundary and preserved website surface", async () => {
    const readme = await readReadme();

    expect(readme).toMatch(/Idea Analyzer owns `normalized\.md -> analysis\.json -> analysis\.md`/i);
    expect(readme).toMatch(/Notion import/i);
    expect(readme).toMatch(/workspace scaffolding/i);
    expect(readme).toMatch(/normalization interviews/i);
    expect(readme).toMatch(/workspace\.md/i);
    expect(readme).toMatch(/future ranking workflows/i);
    expect(readme).toMatch(/website remains a secondary surface/i);
    expect(readme).toMatch(/same analyzer core/i);
  });

  it("uses project glossary terms for the documented boundary", async () => {
    const readme = await readReadme();

    expect(readme).toContain("Idea analysis run");
    expect(readme).toContain("Idea Assessment");
    expect(readme).toContain("Validation Plan");
    expect(readme).toContain("After Validation");
    expect(readme).toContain("Critical Risks & Unknowns");
  });
});
