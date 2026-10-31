# What If Studio

A browser-based short-form video studio for branching "what if?" stories, visual explainers, and social-first motion pieces.

## Stack
React + Vite + TypeScript + Tailwind CSS 4 + Motion + Lucide. AI generation uses the Vercel AI SDK with BYOK support for OpenAI, Google Gemini, and Anthropic Claude.

## Features
- Blue-theatre visual identity inspired by a velvet curtain, stage spotlight, oversized condensed titles and fine gold rules.
- 703 creative video prompts from the MIT-licensed awesome-opus5-5-videos collection.
- 13 Instagram workflow skills from the MIT-licensed instagram-agent-skill project, included with their source files.
- AI-assisted concepts, story beats, scene plans, captions, pinned comments and audience polls.
- Select up to three prompt references and one Instagram skill for context.
- Edit the resulting storyboard, preview a generated HTML animation document and export the HTML.
- Record a storyboard-based canvas video as WebM, or MP4 when the browser supports that MIME type.
- Local project saving in this browser. API keys are never persisted.
- Each AI request sends the selected provider key to the server once; server code does not log or store it.

## Run locally
```bash
npm install
npm run dev
```

## Providers
Choose OpenAI, Gemini or Claude in Settings, enter an API key and a model ID. The default model IDs are editable. Provider usage is billed by the provider, not included in the app.

Never place a secret in a `VITE_*` variable, source file, local storage or committed file.

## Video export
The HTML preview is a standalone animated HTML document. Video export records the studio's canvas-rendered storyboard as WebM; MP4 is offered only when the current browser reports support. Browser recording support and output formats vary.

## Third-party sources
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the original license/readme files under `src/vendor`.

## Important limits
The included skills are creator workflows and prompt guidance, not official Instagram APIs. Viral research cannot guarantee reach or predict virality. The app does not publish to Instagram automatically and never claims to read private poll results.
