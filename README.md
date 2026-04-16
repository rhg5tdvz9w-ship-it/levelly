# Levelly

AI-powered creative intelligence platform for Mob Control UA. Analyzes ad videos, extracts creative DNA, generates data-backed briefs for producers.

Internal tool — not a product for external users.

## What it does

1. **Analyse creative** — Upload a MOC ad video → extracts frames → Gemini identifies hook timing, gate patterns, emotional beats, cannon evolution chain, biome, camera angle
2. **Creative library** — Tagged collection of analyzed ads with spend data, velocity scoring, iteration lineage, and network performance
3. **Generate brief** — Select library DNA + describe your idea → Claude generates 4 network-adapted concepts with production scripts, scene renders, and 9-step emotional curves
4. **Refine** — Select a concept → type refinement instructions → surgical field-group updates without regenerating the full brief

## Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Netlify serverless functions (background functions for long-running brief generation)
- **AI:** Gemini (video/image analysis + scene renders), Claude (brief generation + enhance)
- **Storage:** IndexedDB (filmstrip frames), Netlify Blobs (cloud library + brief jobs), localStorage (metadata only)

## Setup

```bash
# Install dependencies
npm install

# Set environment variables in Netlify dashboard:
#   ANTHROPIC_API_KEY — Claude API key (no VITE_ prefix, server-side only)
#   GEMINI_API_KEY — set in frontend via VITE_GEMINI_API_KEY

# Run locally (frontend + serverless functions)
npx netlify dev

# Or frontend only (no serverless functions)
npm run dev
```

## Deploy

All deploys go through git → Netlify auto-deploy from `main` branch.

```bash
# 1. Create a branch
git checkout -b fix/your-change-name

# 2. Make changes (always full file replacement, never partial patches)
# 3. Verify
git diff

# 4. Commit and push
git add <files>
git commit -m "description of changes"
git push origin fix/your-change-name

# 5. Merge to main
git checkout main
git merge fix/your-change-name
git push origin main

# 6. Watch Netlify dashboard for deploy status
# 7. Smoke test: library loads, briefs generate, concepts display
```

**Deploy credits are limited (~199 remaining, 15 per deploy).** Batch changes. Test locally. Never deploy to test.

## File structure

### Frontend (`src/`)
| File | Role |
|------|------|
| `App.tsx` | UI shell — React components, layout, state, event handlers. Under 500 lines of logic. |
| `types.ts` | All TypeScript interfaces (DNAEntry, Concept, etc). No logic. |
| `prompts.ts` | All AI system prompts. Most-edited file — prompt changes never break UI or data. |
| `analysis.ts` | Video analysis pipeline — frame extraction, Gemini calls, timestamp clamping. |
| `briefing.ts` | Claude brief enhance calls. Brief generation itself runs server-side. |
| `rendering.ts` | Scene renders, image-to-image editing, reference image selection. |
| `storage.ts` | IndexedDB + localStorage + Blobs helpers. |
| `library.ts` | Spend tagging, velocity calc, lineage chains, sorting. |
| `refImages.ts` | Base64 reference images for Gemini render calls. |

### Serverless functions (`netlify/functions/`)
| File | Role |
|------|------|
| `generate-brief-background.ts` | Background function — generates 4 concepts sequentially via Claude. Writes progressive results to Blobs. Includes retry logic + dedup guard. |
| `brief-result.ts` | Polling endpoint — reads brief job status from Blobs. Frontend polls every 2s. |
| `enhance.ts` | Sync function — single Claude call for text enhancement. |
| `load-library.ts` | GET — reads library from Blobs. |
| `save-library.ts` | POST — writes library to Blobs. |
| `patch-spend.ts` | POST — bulk-patches spend data onto library entries. |
| `generate.ts` | Legacy stub — returns 200/410 to prevent cached request errors. |

## Architecture rules

See `levelly.md` for the full list. Key ones:

- **Full file replacement only.** Never partial patches. Violations cost deploy credits.
- **Gemini for video/image, Claude for reasoning.** Never swap.
- **connectLambda must match between writer and reader.** Background function pairs (generate-brief-background + brief-result) both use connectLambda. Sync pairs (save-library + load-library) both skip it.
- **All functions need CORS headers.**

## Documentation

The full project context, architecture decisions, hallucination fixes, and roadmap live in `levelly.md` — that's the single source of truth.
