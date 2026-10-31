# AGENTS.md — What If Studio

## Project mission
What If Studio is a Portuguese (Brazil) creator workspace for planning short-form vertical interactive stories for TikTok, Instagram Reels and YouTube Shorts. The audience's choices should have meaningful consequences in later episodes.

## Read first
Before editing, inspect:
- `README.md` for setup, deployment, integrations and known limitations.
- `index.html`, `styles.css` and `app.js` for the current UI and application behavior.
- `api/generate.js` for the authenticated server-side provider generation flow.
- `supabase/schema.sql` for authentication, project storage, RLS and AI quota.
- `vercel.json` and `package.json` for deployment/runtime configuration.

Do not assume this is a blank project. It already contains an MVP. Preserve working features unless the task explicitly asks to change them.

## Current architecture
- Vanilla HTML, CSS and JavaScript; no frontend framework or build step.
- `index.html`: app shell and entry point.
- `styles.css`: responsive dark interface.
- `app.js`: dashboard, project editor, episodes/scenes, characters, universe, polls, continuity, references, import/export, snapshots, local persistence and optional Supabase sync.
- `api/generate.js`: Vercel serverless endpoint for OpenAI, Gemini and Claude. It validates a Supabase bearer session and enforces a daily generation quota. Provider keys are supplied per request and are never logged or stored.
- `supabase/schema.sql`: projects table with row-level security and a per-user daily AI-generation quota.
- `vercel.json`: Vercel function and security headers.

## Existing product capabilities
- Dashboard and project library.
- Story projects with premise, format, platform, language, duration, tone, audience and pacing.
- Episode/script editor and scene breakdown with visual, image/video prompt and audio/production direction fields.
- Publishing copy: caption, pinned comment and Stories poll.
- Character sheets and universe rules/visual direction.
- Audience polls with options and narrative consequences.
- Continuity log and source/reference tracker.
- JSON/Markdown/TXT/SRT export; JSON import as a separate project.
- Manual snapshots and restore.
- Browser local autosave.
- Optional Supabase magic-link login and cloud sync.
- Optional server-side AI generation for story packs and next episodes with a provider key held in browser memory for the current tab.

## Visual direction
Keep the existing visual identity coherent:
- Dark creator-studio workspace.
- Purple/lavender as the primary accent, with restrained cyan/green/amber status accents.
- DM Sans, Space Grotesk and DM Mono typography (already loaded in `index.html`).
- Clear hierarchy, generous spacing, responsive layouts and polished creator-oriented UI.
- Inspiration may come from common short-form video creator workflows, but do not copy another account's branding or interface verbatim.

## Engineering rules
1. Make focused, incremental changes and preserve existing user data formats where possible.
2. Keep the app usable locally without OpenAI or Supabase. Integrations are optional.
3. Never put provider API keys, Supabase service-role keys, access tokens or other secrets in committed files, logs or client-visible responses. User-provided provider keys may exist in browser memory only for the current tab and must be sent to `api/generate.js` for one authenticated request.
4. All OpenAI, Gemini and Claude calls must remain server-side in `api/generate.js`; never call a provider API directly from browser code with a key.
5. Preserve Supabase Row Level Security and user isolation. Do not weaken policies to make a feature work.
6. Validate and safely render user/model-generated content. Continue escaping untrusted values before inserting HTML.
7. Keep generated story content appropriate for a general/teen audience: no explicit sexual content, graphic violence or self-harm descriptions.
8. Do not claim social-platform publishing, analytics or poll ingestion exists unless it is actually implemented through supported APIs.
9. Update `README.md` when setup, environment variables, features or limitations change.
10. Before finishing, run the checks available in the repo. If no automated test suite exists, perform relevant manual checks and clearly state what was and was not tested.

## Setup and deployment
Follow `README.md`. The documented local development command is `npm install` followed by `npx vercel dev`. Vercel environment variables are documented there. Supabase setup requires running `supabase/schema.sql`.

## Working style for Codex
- Start by summarizing the current repository structure and identifying the requested task.
- Inspect existing implementation before proposing replacements.
- Ask before major architecture changes, deleting features, changing the product's core purpose or introducing paid third-party dependencies.
- When implementing, explain the files changed, important decisions, how to run/test, and any remaining setup the owner must do.
