# Lufthansa-Technik SAC Finder

Restricted SAC planning workspace with a deterministic local workbook pass and a live OpenAI review pass.

## Operating Rules

1. Use only supplied SAC Definition rows, server A320 MPD rows, and client-imported workbook rows as source evidence.
2. Do not release SAC codes from similarity alone.
3. Return `NO_SAC` when evidence is missing.
4. Return `REVIEW` when evidence is conflicting, broad, or ambiguous.
5. Separate core work from access-only work before finalizing.
6. Every recommended SAC code must cite an allowed source reference, such as `Sheet2 row 13`.
7. Keep every live AI response auditable with model, response id, token usage, decision status, confidence, trace, and evidence references.
8. Keep OpenAI keys server-side only. Never expose keys in browser code.

## Excel Workbook Evidence

The site can use the user's local workbook without committing the workbook into the public repository.

1. Open the site and log in.
2. Click `Load Excel data`.
3. Select `All data .xlsx`.
4. The browser reads the workbook locally, extracts SAC definitions from `Sheet1`, extracts examples from `Sheet2`, and stores the parsed data in browser `localStorage`.
5. Run a SAC search. Local matches and live AI responses will cite where the example came from, for example `All data .xlsx / Sheet2 row 13`.

Only the compact matched evidence rows are sent to `/api/agent` for AI review. The full workbook stays in the browser unless the user selects it again on another device/browser.

Use `Repo data` to clear the imported workbook from this browser and return to the repository's bundled source data.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Set `OPENAI_API_KEY` in `.env`.
3. Optional: set `OPENAI_MODEL` to another Responses API model available to your OpenAI project.
4. Run the server:

```bash
npm start
```

Open `http://localhost:3000`.

Current browser-side access gate:

```text
username: luf
password: sofia1
```

## Production Setup

Deploy as a Node web service, not a static-only site. The OpenAI API call must run through `server.js` so the API key stays private.

Required environment variable:

```bash
OPENAI_API_KEY=sk-...
```

Recommended OpenAI settings:

```bash
OPENAI_MODEL=gpt-5-nano
OPENAI_REASONING_EFFORT=minimal
OPENAI_MAX_OUTPUT_TOKENS=4096
```

Optional environment variables:

```bash
OPENAI_BASE_URL=https://api.openai.com/v1
PORT=3000
```

After each change on `main`, redeploy or restart the Node web service so the latest `server.js` and browser files are active.

## Health Checks

- `GET /api/health` checks source counts, rules count, model, reasoning effort, output budget, whether the server has an API key, and whether client workbook evidence is accepted.
- `GET /api/test-openai` sends a small OpenAI ping.
- `POST /api/agent` runs the live SAC copilot and accepts optional `clientEvidence` from the imported workbook.

## Empty Response Troubleshooting

If the UI reports that OpenAI returned no final content, the model likely spent the output budget on reasoning before producing structured JSON. Keep `OPENAI_REASONING_EFFORT=minimal` and increase `OPENAI_MAX_OUTPUT_TOKENS` if needed.

## Security Notes

The current login is only a browser-side access gate. For production with real users, replace it with server-side authentication.
