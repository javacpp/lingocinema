# Gemini Context File — LingoCinema

## Project Overview

LingoCinema is a full-stack web app that turns subtitle files (`.srt` / `.vtt`) into vocabulary study sessions using AI. The Express server hosts both the REST API and the React SPA (via Vite dev middleware in development, static files in production).

**All AI calls go through the Express server.** The server dispatches to the active provider based on configuration. Supported providers:
- **Text LLM**: Gemini, OpenAI (or any OpenAI-compatible endpoint), Ollama (local), llama.cpp (local)
- **TTS**: Gemini, OpenAI, Piper (local binary)

Providers are selected via environment variables in `.env.local` and can also be switched at runtime through the Settings UI without restarting the server.

---

## Development Commands

```bash
npm run dev            # Start dev server at http://localhost:3000 (HMR enabled)
npm run build          # Compile React frontend into dist/
npm run lint           # TypeScript type-check (no emit)
npm run preview        # Preview the production build locally
npm run clean          # Delete dist/

# Production server
NODE_ENV=production npx tsx server.ts
```

---

## File Layout & Where New Code Goes

```
lingocinema/
├── src/                          # Frontend (React) code only
│   ├── components/               # One React component per file
│   ├── hooks/                    # Custom hooks — data-fetching and business logic
│   ├── api/                      # Frontend API client (fetch wrappers for /api/* routes)
│   ├── types/                    # TypeScript interfaces shared across frontend files
│   ├── App.tsx                   # Root component — layout and top-level state only
│   ├── main.tsx                  # React DOM entry point — do not add logic here
│   └── index.css                 # Global resets and CSS custom properties only
├── providers/                    # Server-side AI provider implementations
│   ├── text/
│   │   ├── interface.ts          # TextProvider interface
│   │   ├── gemini.ts
│   │   ├── openai.ts             # Also handles Ollama/llama.cpp (OpenAI-compatible)
│   │   └── index.ts              # Factory: reads TEXT_PROVIDER and returns active impl
│   └── tts/
│       ├── interface.ts          # TTSProvider interface
│       ├── gemini.ts
│       ├── openai.ts
│       ├── piper.ts
│       └── index.ts              # Factory: reads TTS_PROVIDER and returns active impl
├── db/                           # Database abstraction layer
│   ├── interface.ts              # IDatabase interface — all query contracts
│   ├── sqlite.ts                 # SQLite implementation (default)
│   └── index.ts                  # Factory: reads DB_PROVIDER and returns active impl
├── server.ts                     # Express server — API routes + Vite middleware
├── vite.config.ts                # Vite config — do not add business logic here
└── docs/                         # Documentation files
    ├── MISTAKES.md               # Required — see Mistakes Log section
    └── CHANGELOG.md              # Required — see Changelog section
```

**Rules for placing new code:**

- New UI element → `src/components/<ComponentName>.tsx`
- Data-fetching or stateful logic → `src/hooks/use<FeatureName>.ts`
- A call to an `/api/*` route → `src/api/<resource>.ts` (e.g. `subtitles.ts`, `items.ts`)
- A new REST endpoint → add to `server.ts`; if `server.ts` exceeds ~300 lines, extract route groups into `src/routes/<resource>.ts`
- A new database query or table → add to `db/interface.ts` first (define the contract), then implement in `db/sqlite.ts`
- A new AI provider implementation → create the file under `providers/text/` or `providers/tts/`, then register it in the relevant `index.ts` factory
- A type used in more than one file → `src/types/index.ts`

---

## TypeScript Rules

- **No `any`.** Use explicit interfaces or `unknown` with a type guard.
- Define a TypeScript interface for every API request body and response shape. Put these in `src/types/`.
- `tsconfig.json` uses `strict: true` — do not relax any compiler flags.
- `server.ts`, all files under `db/`, and all files under `providers/` must be fully typed. Express `Request`/`Response` generics should carry the correct body types.

---

## Linting & Formatting

The project does not yet have ESLint or Prettier configured. Add them before writing significant new code.

### Install

```bash
npm install -D \
  eslint \
  @eslint/js \
  typescript-eslint \
  eslint-plugin-react-hooks \
  eslint-plugin-react-refresh \
  prettier \
  eslint-config-prettier
```

### ESLint config (`eslint.config.js` — flat config format for ESLint 9)

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  prettier, // must be last — disables formatting rules that conflict with Prettier
);
```

### Prettier config (`.prettierrc`)

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

### Add scripts to `package.json`

```json
"lint": "tsc --noEmit && eslint .",
"format": "prettier --write ."
```

The existing `lint` script only runs `tsc --noEmit`. Replace it with the combined command above so a single `npm run lint` catches both type errors and lint violations.

### Rules

- Run `npm run lint` before committing. Do not leave lint errors in the codebase.
- Run `npm run format` to auto-fix formatting. Do not manually reformat code.
- Do not disable ESLint rules with `// eslint-disable` comments unless there is a concrete reason documented inline.
- `@typescript-eslint/no-explicit-any` is set to `error` — this enforces the no-`any` rule from the TypeScript section at the tooling level.

### React
- Functional components with hooks only. No class components.
- Keep state at the lowest component that needs it. Lift only when two sibling components share the same state.
- Components must not contain raw `fetch` calls. Put fetch logic in `src/api/` and call it from a custom hook in `src/hooks/`.
- Use `useCallback` and `useMemo` only when there is a measurable performance reason — do not add them preemptively.

### Tailwind CSS 4
- Use utility classes for all styling. No inline `style` props except for truly dynamic computed values (e.g. `style={{ width: progress + '%' }}`).
- Compose conditional classes with the `cn()` utility (`clsx` + `tailwind-merge`). Never concatenate class strings with template literals.
- Do not write new rules in `index.css` unless it is a global CSS custom property (`--color-*`, etc.) or a base reset.

### Motion (Framer Motion 12)
- Use `motion` components and `AnimatePresence` for all enter/exit transitions.
- Do not use CSS `transition` for component mount/unmount animations — Motion owns that responsibility.
- Keep animation variants defined as constants outside the component body, not inline objects, to avoid re-creation on every render.

### Icons & Libraries
- Use **Lucide React** for all icons. Do not install additional icon libraries.
- Do not install a component library (e.g. shadcn, MUI, Chakra) without explicit approval — the project uses Tailwind and custom components.

---

## Backend Rules (Express 4 + multer)

### API Design
- All routes are prefixed with `/api`.
- Success responses return `{ data: <payload> }`. Error responses return `{ error: "<message>" }`.
- Use correct HTTP status codes: `200` OK, `201` Created, `400` Bad Request, `404` Not Found, `500` Internal Server Error.
- Validate all incoming data (request body fields, query params, route params) before executing any database query. Return `400` with a descriptive `error` string for invalid input.

### File Uploads
- multer is already configured. Accept only `.srt` and `.vtt` files — reject any other MIME type or extension with a `400` response.
- Do not store uploaded files on disk. Use `multer`'s `memoryStorage` so the raw buffer is read directly into SQLite.

### Error Handling in Routes
- Express 4 does **not** catch errors thrown inside `async` route handlers automatically. Every `async` handler must have its own `try/catch` block.
- Never send a raw internal `error.message` (from the database layer, a provider, or Node.js internals) to the client. Log it with `console.error` and respond with a generic `500` message.

---

## Database Layer

### Abstraction Interface

The database layer uses an interface so the storage backend can be swapped without touching application code. Define all query contracts in `db/interface.ts` first:

```ts
// db/interface.ts
export interface IDatabase {
  getSubtitles(): Subtitle[];
  getSubtitleById(id: number): Subtitle | undefined;
  insertSubtitle(filename: string, content: string): number;
  deleteSubtitle(id: number): void;
  getItemsBySubtitleId(subtitleId: number, levels?: string[]): ExtractedItem[];
  bulkInsertItems(subtitleId: number, items: NewExtractedItem[]): void;
}
```

`db/index.ts` exports a factory function that reads `DB_PROVIDER` from the environment and returns the correct implementation. All server code imports `getDatabase()` from `db/index.ts` — never import a specific implementation directly in `server.ts` or route files.

```ts
// Correct — depend on the abstraction
import { getDatabase } from './db/index.js';
const db = getDatabase();

// Wrong — hard-coding the implementation
import { db } from './db/sqlite.js';
```

### SQLite Implementation (`db/sqlite.ts`) — Current Default

- **better-sqlite3 is synchronous.** Do not use `await` on database calls — they are not promises. The `IDatabase` interface methods are therefore synchronous; keep them that way unless a new implementation forces async (in which case the interface must be updated to return `Promise<T>` consistently for all methods).
- Use **prepared statements** for every query. Never interpolate user-supplied values into SQL strings.

  ```ts
  // Correct
  const stmt = db.prepare('SELECT * FROM subtitles WHERE id = ?');
  const row = stmt.get(id);

  // Wrong — never do this
  const row = db.prepare(`SELECT * FROM subtitles WHERE id = ${id}`).get();
  ```

- Schema definitions (`CREATE TABLE IF NOT EXISTS`) run once at startup inside `db/sqlite.ts`.
- Adding a new column requires a migration using `ALTER TABLE <table> ADD COLUMN <col> <type> DEFAULT <value>`. Wrap it in `try/catch` because SQLite has no `IF NOT EXISTS` for `ALTER TABLE`.

### Adding a New Database Backend

1. Create `db/<name>.ts` implementing `IDatabase`.
2. Register it in `db/index.ts` factory under a new `DB_PROVIDER` value.
3. Add the provider name to the `DB_PROVIDER` environment variable docs.
4. Do not add an ORM without explicit approval — keep queries explicit and readable.

---

## AI Provider Layer

All AI calls are made **server-side** through the provider abstraction in `providers/`. The browser calls `/api/*` endpoints; the server dispatches to the configured provider. Never call an AI provider SDK directly from frontend code.

### Provider Interfaces

```ts
// providers/text/interface.ts
export interface TextProvider {
  analyse(prompt: string): Promise<string>; // returns raw text/JSON string
}

// providers/tts/interface.ts
export interface TTSProvider {
  synthesise(text: string, accent: 'american' | 'british'): Promise<Buffer>; // WAV/MP3 bytes
}
```

Each implementation file (`gemini.ts`, `openai.ts`, `piper.ts`, etc.) exports a class or object satisfying the interface. The `index.ts` factory reads the env var and returns the active instance.

### Active Models & Defaults

| Provider | Env var | Default model |
|---|---|---|
| Gemini text | `GEMINI_TEXT_MODEL` | `gemini-3-flash-preview` |
| Gemini TTS | `GEMINI_TTS_MODEL` | `gemini-2.5-flash-preview-tts` |
| OpenAI text | `OPENAI_TEXT_MODEL` | `gpt-4o` |
| OpenAI TTS | `OPENAI_TTS_MODEL` | `tts-1` |
| Ollama text | `OLLAMA_TEXT_MODEL` | `llama3` |
| llama.cpp text | `LLAMACPP_TEXT_MODEL` | `default` |

### Prompt & Response Rules

- Every prompt that expects structured data must specify the **exact JSON schema** inline in the prompt text and instruct the model to return JSON only, with no markdown fences.
- Parse the response with `JSON.parse` inside a `try/catch`. If parsing fails, return a `500` to the client with a message like `"AI returned unparseable response"` — do not swallow the error silently.
- Ollama and llama.cpp models produce less reliable JSON than Gemini or GPT-4o. If structured output fails for a local model, retry once before returning an error.

### Piper TTS Specifics

- Piper is invoked as a **child process** (`child_process.spawn`), not via an HTTP SDK.
- Read `PIPER_BINARY_PATH` and `PIPER_MODEL_PATH` from env. If either is missing and `TTS_PROVIDER=piper`, log a clear error at startup and refuse to start.
- Pipe the text to Piper's `stdin` and collect the WAV bytes from `stdout`. Stream stderr to `console.error` for diagnostics.
- Piper does not support per-request accent switching — the voice is fixed by the model file. Document this limitation in the API response for TTS endpoints.

### Adding a New Provider

1. Create the implementation file under `providers/text/` or `providers/tts/`.
2. Implement the corresponding interface fully — no partial implementations.
3. Register it in the factory `index.ts` under a new provider string.
4. Add the new provider string and its env vars to the Configuration Reference in this file.

---

## Environment Variables & Configuration

The config file is `.env.local` (copy from `.env.example`). **Never commit `.env.local`.**

### Text LLM

| Variable | Default | Description |
|---|---|---|
| `TEXT_PROVIDER` | `gemini` | Active provider: `gemini` / `openai` / `ollama` / `llamacpp` |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `GEMINI_TEXT_MODEL` | `gemini-3-flash-preview` | Gemini text model |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `OPENAI_BASE_URL` | `https://api.openai.com` | OpenAI-compatible endpoint (override for custom hosts) |
| `OPENAI_TEXT_MODEL` | `gpt-4o` | OpenAI text model |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_TEXT_MODEL` | `llama3` | Ollama model name |
| `LLAMACPP_BASE_URL` | `http://localhost:8080` | llama.cpp server URL |
| `LLAMACPP_TEXT_MODEL` | `default` | llama.cpp model name |

### TTS

| Variable | Default | Description |
|---|---|---|
| `TTS_PROVIDER` | `gemini` | Active provider: `gemini` / `openai` / `piper` |
| `GEMINI_TTS_MODEL` | `gemini-2.5-flash-preview-tts` | Gemini TTS model |
| `OPENAI_TTS_MODEL` | `tts-1` | OpenAI TTS model |
| `OPENAI_TTS_VOICE` | `alloy` | OpenAI TTS voice |
| `PIPER_BINARY_PATH` | `piper` | Path to Piper executable |
| `PIPER_MODEL_PATH` | — | Path to Piper `.onnx` model file (required if `TTS_PROVIDER=piper`) |

### Database

| Variable | Default | Description |
|---|---|---|
| `DB_PROVIDER` | `sqlite` | Active database: `sqlite` (others added as implemented) |

### Rules

- All env vars are read **server-side only**. Do not expose any API key or provider config to the browser via `VITE_` prefix.
- At server startup, validate that the required vars for the active `TEXT_PROVIDER` and `TTS_PROVIDER` are present. Log a descriptive error and exit if any are missing — do not start with an undefined key.
- Provider settings can also be changed at runtime via the **Settings UI** in the sidebar. The server must re-read the active provider on each request (or update an in-memory config object) so runtime changes take effect without a restart.

---

## Testing

- Follow **TDD**: write the test first, then write the minimum code to make it pass.
- Use **Vitest** for all tests (it shares the Vite config — no extra setup needed).
- Test files sit next to the source file they test: `db/sqlite.test.ts`, `providers/text/gemini.test.ts`, `src/hooks/useSubtitles.test.ts`.
- Test backend routes with **supertest** against the Express app.
- Every feature must have at minimum:
  1. One test covering the happy path.
  2. One test covering the primary error/edge case.

### Database Tests
- Do not mock the database in backend route tests. Use an in-memory SQLite instance (`new Database(':memory:')`) configured through the `IDatabase` interface.

### Provider Tests
- Unit-test provider implementations by mocking the underlying HTTP client or SDK, not the `TextProvider` / `TTSProvider` interface itself.
- For route tests that involve AI calls, inject a mock `TextProvider` or `TTSProvider` through the factory — do not make real API calls in tests.

---

## Mistakes Log

Any significant bug, wrong assumption, or architectural misstep made during development **must** be recorded in `docs/MISTAKES.md` immediately after it is fixed.

Use this format:

```
## YYYY-MM-DD — <short title>
**What went wrong**: ...
**Fix**: ...
**How to avoid next time**: ...
```

---

## Changelog

Any change that is significant enough to affect how the app is used, deployed, or extended **must** be recorded in `docs/CHANGELOG.md` under the project root. Write the entry at the time the change is merged/completed, not retrospectively.

**What counts as a significant change:**
- Adding or removing a provider (text, TTS, database)
- A new API endpoint or a breaking change to an existing one
- A new environment variable that must be set
- A database schema change (new table, new column, migration)
- A dependency upgrade that changes runtime behaviour
- A new npm script or change to an existing script

**What does not need a changelog entry:** bug fixes that don't change behaviour, internal refactors, test additions, documentation edits.

Use this format (newest at the top):

```
## YYYY-MM-DD — <short title>

**Type**: Feature | Breaking Change | Migration | Config Change | Dependency
**Summary**: One or two sentences describing what changed and why.
**Action required** (if any): What a developer or operator needs to do — e.g. add a new env var, run a migration, reinstall dependencies.
```
