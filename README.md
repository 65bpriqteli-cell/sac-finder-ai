# SAC Finder AI Copilot

Working web app for SAC lookup with two layers:

1. **Local retrieval engine** using the embedded `db.json` data extracted from your original site.
2. **AI copilot** that reasons over the task card more flexibly, using the retrieved evidence first.

## What changed from the original single-file demo

- Split the huge one-file `index.html` into a real project structure.
- Added a backend endpoint: `POST /api/agent`
- Added AI reasoning mode with safe fallback when no API key is configured.
- Kept the local deterministic search logic so the site still works offline.
- Added TXT / PDF import, evidence trace, candidate ranking, and operation classification.

## Project structure

```text
sac-finder-ai-copilot/
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── engine.js
│   └── db.json
├── server.js
├── package.json
├── .env.example
└── README.md
```

## Run locally

```bash
npm install
cp .env.example .env   # optional
npm run dev
```

Then open:

```text
http://localhost:3000
```

## AI configuration

If you set `OPENAI_API_KEY`, the app will call the model from the server. The included server also reads a local `.env` file automatically, so you do not need an extra package for that.

Environment variables:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `OPENAI_BASE_URL` (default: `https://api.openai.com/v1`)
- `PORT` (default: `3000`)

Without an API key, the AI button still works, but it uses the built-in fallback planner logic instead of a live model.

## Suggested next deployment steps

### Option 1: Render / Railway
Good because this project has both frontend and backend in one Node app.

### Option 2: Vercel
Possible, but you would usually convert the backend into serverless functions.

### Option 3: GitHub + Render
1. Create a GitHub repo
2. Push this folder
3. Connect the repo to Render
4. Add the environment variables there

## Notes

- I could not push directly to GitHub here because no accessible GitHub repositories were available in the connected account.
- The app is designed so your API key stays on the server, not inside browser JavaScript.
