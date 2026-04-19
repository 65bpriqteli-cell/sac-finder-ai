# Lufthansa-Technik SAC Finder

Restricted SAC planning workspace with a deterministic local workbook pass and a live OpenAI review pass.

## Operating Rules

1. Use only supplied SAC Definition rows and A320 MPD rows as source evidence.
2. Do not release SAC codes from similarity alone.
3. Return `NO_SAC` when evidence is missing.
4. Return `REVIEW` when evidence is conflicting, broad, or ambiguous.
5. Separate core work from access-only work before finalizing.
6. Keep every live AI response auditable with model, response id, token usage, decision status, confidence, and trace.
7. Keep OpenAI keys server-side only. Never expose keys in browser code.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Set `OPENAI_API_KEY` in `.env`.
3. Optional: set `OPENAI_MODEL` to another Responses API model available to your OpenAI project.
4. Run the server:

```bash
npm start
```

Open `http://localhost:3000`.

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

## Health Checks

- `GET /api/health` checks source counts, rules count, model, reasoning effort, output budget, and whether the server has an API key.
- `GET /api/test-openai` sends a small OpenAI ping.
- `POST /api/agent` runs the live SAC copilot.

## Empty Response Troubleshooting

If the UI reports that OpenAI returned no final content, the model likely spent the output budget on reasoning before producing structured JSON. Keep `OPENAI_REASONING_EFFORT=minimal` and increase `OPENAI_MAX_OUTPUT_TOKENS` if needed.

## Login

Current browser-side access gate:

```text
username: luf
password: sofia1
```

For production with real users, replace this with server-side authentication.
