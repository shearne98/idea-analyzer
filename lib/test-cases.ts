import { promises as fs } from "fs";
import path from "path";

export type IdeaTestCase = {
  id: string;
  title: string;
  prompt: string;
};

function normalizeBlock(block: string) {
  const lines = block.replace(/\r\n/g, "\n").split("\n");
  const nonEmpty = lines.filter((line) => line.trim());
  const indentation =
    nonEmpty.length > 0
      ? Math.min(...nonEmpty.map((line) => line.match(/^\s*/)?.[0].length ?? 0))
      : 0;

  return lines
    .map((line) => line.slice(indentation).trimEnd())
    .join("\n")
    .trim();
}

export function parseIdeaTestCases(content: string): IdeaTestCase[] {
  const matches = [...content.matchAll(/^Test Case\s+(\d+)\.\s*$/gim)];

  return matches
    .map((match, index) => {
      const prompt = normalizeBlock(
        content.slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index ?? content.length)
      );
      const title = prompt.match(/^Business Idea:\s*(.+)$/im)?.[1]?.trim();

      return {
        id: `test-case-${match[1]}`,
        title: title || `Test Case ${match[1]}`,
        prompt,
      };
    })
    .filter((testCase) => testCase.prompt);
}

export async function readIdeaTestCases(): Promise<IdeaTestCase[]> {
  const content = await fs.readFile(path.join(process.cwd(), "test-cases"), "utf8");
  return parseIdeaTestCases(content);
}
