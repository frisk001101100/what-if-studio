# What If Studio

A local-first studio for creating short-form interactive stories where audience choices meaningfully change what happens next.

## Current MVP

- Responsive dark workspace with dashboard and project library.
- Create and edit story projects, premises, formats, platforms, tone and duration.
- Episode list, script editor, scene breakdown and production notes.
- Character sheets with role, motivation, appearance and voice.
- Universe setting, rules and visual direction.
- Audience polls with multiple options, manual vote counting and narrative consequences.
- Continuity log for established facts, audience decisions, secrets and consequences.
- Export project as JSON, Markdown, TXT or SRT.
- Automatic local saving in the current browser.
- Optional Supabase magic-link login and cloud sync.
- Optional server-side OpenAI generation through a Vercel Function.

The app works locally without OpenAI or Supabase. Those services are optional integrations and need your own accounts and configuration.

## Run locally

Requirements: Node.js 20+ and the Vercel CLI.

    npm install
    npx vercel dev

Open the local URL printed by Vercel. The static app can also be previewed with any static server, but the /api/generate endpoint requires the Vercel development server.

## Deploy to Vercel

1. Import frisk001101100/what-if-studio from GitHub into Vercel.
2. Choose Other as the framework preset. No build command is required; the app is served from the repository root.
3. Add these Environment Variables in the Vercel project:
   - OPENAI_API_KEY — secret API key, server-side only.
   - OPENAI_MODEL — optional model override; defaults to gpt-5.5.
   - SUPABASE_URL — the Supabase project URL.
   - SUPABASE_ANON_KEY — the public anon/publishable key (never use service_role).
4. Deploy. The generation endpoint is available at /api/generate.

Never add an API key to app.js, index.html, a VITE_ variable, or any committed file. ChatGPT subscriptions and API billing are separate.

## Configure Supabase cloud sync

1. Create a Supabase project.
2. In the Supabase SQL Editor, run supabase/schema.sql.
3. In Supabase Authentication settings, enable email OTP / magic links.
4. Add your deployed Vercel URL to the allowed redirect URLs.
5. Open What If Studio → Configurações and enter the Supabase Project URL and public anon/publishable key.
6. Enter your email and use the link sent to your inbox. Your projects will then sync to your account.
7. The AI endpoint also requires this Supabase login and the three server environment variables above. The database enforces a limit of 20 AI generations per user per UTC day.

The client uses only the public anon/publishable key. Row Level Security ensures users can access only rows whose user_id matches their authenticated account. Do not use or expose the Supabase service_role key.

## Architecture

- index.html, styles.css, app.js: static browser application.
- api/generate.js: server-side OpenAI Responses API proxy. The API key is read only from server environment variables.
- supabase/schema.sql: projects table and row-level security policies.
- vercel.json: Vercel function and security-header configuration.

## Limitations in this MVP

- Poll votes are entered manually. The app does not scrape social platforms or claim to read Instagram/TikTok poll results.
- Cloud sync is optional and requires Supabase configuration.
- AI generation is optional and requires OpenAI API billing and a Vercel environment variable.
- There is no automatic publishing to social platforms yet.
- Local data is stored in the current browser until cloud sync is configured. Export backups regularly.

## Safety and privacy

Keep API secrets in the hosting provider's environment-variable settings. Do not commit .env files, service-role keys, private access tokens or personal data. Use platform-approved integrations for publishing and audience data.
