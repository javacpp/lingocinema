# AGENTS.md — Autonomous Agent Execution Protocol (LingoCinema)

## 1. Mandatory Context Reading Order
Before writing any code in a task, read:
1. `GEMINI.md` (Project rules: strict TypeScript, zero `any`, TDD with Vitest, `IDatabase` abstraction, `docs/MISTAKES.md` logging).
2. `PROGRESS.md` (Current stage, completed tasks, active task, known issues).
3. `docs/listening-difficulties/design.md` (Authoritative architecture, SQL schemas, TS interfaces, API contracts).
4. `docs/listening-difficulties/plan.md` (Step-by-step task instructions and acceptance criteria).

## 2. Non-Negotiable Invariants
- **Part 1 Regression Guard:** Never break Part 1 (`extracted_items` table, `POST /api/analyze`, `GET /api/items/:subtitleId`, or Part 1 Vocabulary UI in `src/App.tsx`).
- **Backwards-Compatible TTS:** `POST /api/tts` with `{ text: "hello", voice: "British" }` or `{ text: "hello", voice: "american" }` must always return `200 audio/wav`.
- **Zero `any` & `strict: true`:** Both `tsc --noEmit` and `eslint .` must pass with 0 errors and 0 warnings.
- **No Real API Calls in Tests:** All Vitest unit and `supertest` route tests must use `FakeTextProvider` and `FakeTTSProvider` (`src/test/fakes.ts`) and in-memory SQLite (`new SQLiteDatabase(':memory:')`).

## 3. Per-Task Completion Checklist
At the end of EVERY task (`T0.1` .. `T6.1`):
1. Run `npx vitest run` (all tests must pass).
2. Run `npm run lint` (`tsc --noEmit && eslint .` must exit 0).
3. Run `npm run build` (`vite build` must succeed).
4. Update `PROGRESS.md` (mark task `[x]`, record commit hash/notes, set next task).
5. If a bug or wrong assumption occurred and was fixed, append an entry to `docs/MISTAKES.md`.
6. Create one atomic git commit: `git commit -m "feat(listening): <TaskID> <short summary>"`.
