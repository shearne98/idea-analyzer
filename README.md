# Idea Analyzer

Idea Analyzer provides a reusable business idea analysis engine, a website surface, and a file-based command for Hearne OS workflows.

## Hearne OS file workflow boundary

Hearne OS owns Business idea workspaces. The workspace artifacts `source.md`, `normalized.md`, `analysis.json`, and `analysis.md` live in Hearne OS, not inside Idea Analyzer. Idea Analyzer should not create, scaffold, or take ownership of those workspaces.

Idea Analyzer owns `normalized.md -> analysis.json -> analysis.md`: given an explicit Hearne OS `normalized.md` input path, it runs an Idea analysis run through the shared analyzer core, writes canonical `analysis.json`, and renders `analysis.md` from that same structured output.

Hearne OS owns the surrounding workflow responsibilities: Notion import, Business idea workspace scaffolding, normalization interviews that produce `normalized.md`, `workspace.md`, and future ranking workflows. Do not add Notion import behavior or Hearne OS workspace ownership to this repo.

The website remains a secondary surface over the same analyzer core and canonical response contract. It should continue to support paste-and-analyze, clarification intake, completed Idea Assessment display, Validation Plan, Critical Risks & Unknowns, After Validation, Recommended Strategy, and development output tools.

## Development evaluation tools

The collapsed **Development controls** and **Development output tools** are for comparing Idea analysis run quality while building the analyzer. They are not part of the intended final customer experience.

- Add human-readable regression prompts to the root-level `test-cases` file using `Test Case N.` headings. The app reads them automatically.
- The maintained regression set includes the basketball platform, compliance service, and deliberately vague idea.
- Saved outputs are written as complete JSON files under `saved-analyses/`, so they persist across browser and PC restarts.
- Historical saved outputs using retired response fields are migrated to the canonical response contract when they are listed.
- Saved runs can be reopened, downloaded, or deleted from the development output tools.
- Comparison metadata includes analysis version, code version, model, deep-thinking setting, temperature, seed, timings, and token metrics.
- Existing browser-only saves are migrated to project-local files when the saved-runs panel first loads.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
