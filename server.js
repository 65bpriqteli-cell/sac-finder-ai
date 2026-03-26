const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_PATH = path.join(PUBLIC_DIR, 'index.html');
const DB_PATH = path.join(PUBLIC_DIR, 'db.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), 'application/json; charset=utf-8');
}

function readJsonFileSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function readTextFileSafe(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return fallback;
  }
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 3 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function getRestrictedSources() {
  const db = readJsonFileSafe(DB_PATH, {}) || {};
  const definitions = Array.isArray(db.definitions) ? db.definitions : [];
  const mpd = Array.isArray(db.mpd) ? db.mpd : [];
  const htmlRaw = readTextFileSafe(INDEX_PATH, '');
  return { definitions, mpd, htmlRaw };
}

function buildFallback(taskText, localResult) {
  const ranked = Array.isArray(localResult?.final?.ranked) ? localResult.final.ranked.slice(0, 3) : [];
  const best = ranked[0] || null;
  const sources = getRestrictedSources();

  return {
    mode: 'offline_fallback',
    answer: best
      ? `Most likely SAC from the restricted local result is ${best.code}. Validate it against the exact task wording and A320 MPD examples before approving.`
      : 'Live AI is unavailable because OPENAI_API_KEY is missing. Add the key in Render environment variables.',
    recommendation: best
      ? `Start with ${best.code} as the most likely SAC, then verify side, zone, frame, aircraft applicability, and whether the wording describes core work or access only.`
      : 'OPENAI_API_KEY is missing, so only the restricted offline fallback is available.',
    checks: [
      'Confirm exact side, zone, frame, and door/location from the task card.',
      'Confirm the task is grounded only in SAC Definition and A320 MPD.',
      'Confirm whether the wording is real work or only access/removal.'
    ],
    codes: ranked.map((item, index) => ({
      code: item.code,
      role: index === 0 ? 'most likely candidate' : 'alternative candidate',
      note: item.definition || item.pieces?.[0]?.segment || 'No note available.'
    })),
    why: ranked.map((item, index) => `${index === 0 ? 'Primary' : 'Alternative'} candidate: ${item.code}`),
    trace: [
      `Task text length: ${String(taskText || '').length}`,
      `Definitions loaded: ${sources.definitions.length}`,
      `MPD rows loaded: ${sources.mpd.length}`,
      `HTML length loaded: ${sources.htmlRaw.length}`
    ]
  };
}

async function callOpenAI(taskText, localResult) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

  if (!apiKey) {
    return buildFallback(taskText, localResult);
  }

  const { definitions, mpd, htmlRaw } = getRestrictedSources();

  const prompt = [
    'You are an aircraft maintenance planning copilot helping choose SAC codes.',
    'Use ONLY these sources:',
    '1) SAC Definition from db.json',
    '2) A320 MPD from db.json',
    '3) The FULL RAW HTML from public/index.html',
    'If localResult is present, treat it only as a helper summary, not as a primary source.',
    'Do not invent evidence outside these sources.',
    'Do not omit or truncate source content yourself; work only from what is provided.',
    'Return JSON only with this exact shape:',
    '{',
    '  "recommendation": "string",',
    '  "why": ["string", "string"],',
    '  "checks": ["string", "string", "string"],',
    '  "codes": [{"code":"string","role":"string","note":"string"}],',
    '  "trace": ["string", "string"]',
    '}',
    '',
    'TASK TEXT:',
    taskText,
    '',
    'LOCAL RESULT HELPER (optional):',
    JSON.stringify(localResult || null, null, 2),
    '',
    'SAC DEFINITION SOURCE:',
    JSON.stringify(definitions, null, 2),
    '',
    'A320 MPD SOURCE:',
    JSON.stringify(mpd, null, 2),
    '',
    'FULL RAW HTML SOURCE:',
    htmlRaw
  ].join('\n');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a grounded aircraft maintenance assistant. Return JSON only and stay strictly inside the supplied sources.'
        },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${txt}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No model response content');
  }

  const parsed = JSON.parse(content);
  const recommendation = typeof parsed.recommendation === 'string'
    ? parsed.recommendation
    : 'No recommendation returned.';

  return {
    mode: 'live_ai',
    answer: recommendation,
    recommendation,
    why: Array.isArray(parsed.why) ? parsed.why : [],
    checks: Array.isArray(parsed.checks) ? parsed.checks : [],
    codes: Array.isArray(parsed.codes) ? parsed.codes : [],
    trace: Array.isArray(parsed.trace) ? parsed.trace : []
  };
}

function serveFile(res, filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return send(res, 200, data, MIME[ext] || 'application/octet-stream');
  } catch {
    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (req.method === 'GET' && urlPath === '/api/health') {
    const { definitions, mpd, htmlRaw } = getRestrictedSources();
    return sendJson(res, 200, {
      ok: true,
      hasKey: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      sources: {
        definitions: definitions.length,
        mpd: mpd.length,
        htmlLength: htmlRaw.length
      }
    });
  }

  if (req.method === 'GET' && urlPath === '/db.json') {
    try {
      const db = fs.readFileSync(DB_PATH, 'utf-8');
      return send(res, 200, db, 'application/json; charset=utf-8');
    } catch {
      return sendJson(res, 500, { error: 'Missing db.json' });
    }
  }

  if (req.method === 'POST' && urlPath === '/api/agent') {
    try {
      const body = await readBody(req);
      const taskText = String(body?.taskText || body?.text || '').trim();
      if (!taskText) {
        return sendJson(res, 400, { error: 'taskText is required.' });
      }

      const localResult = body?.localResult || null;
      const result = await callOpenAI(taskText, localResult);
      return sendJson(res, 200, result);
    } catch (error) {
      const msg = String(error?.message || error);
      if (msg.includes('insufficient_quota') || msg.includes('429')) {
        return sendJson(res, 429, {
          error: 'Live AI is connected, but the API project has no available quota right now. Check OpenAI billing or switch to a project/key with available credits.'
        });
      }
      return sendJson(res, 500, { error: msg || 'Unknown server error' });
    }
  }

  if (req.method === 'GET' && urlPath === '/') {
    try {
      const html = fs.readFileSync(INDEX_PATH, 'utf-8');
      return send(res, 200, html, 'text/html; charset=utf-8');
    } catch {
      return send(res, 500, 'Missing public/index.html', 'text/plain; charset=utf-8');
    }
  }

  if (req.method === 'GET') {
    const safePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
    if (safePath.startsWith(PUBLIC_DIR) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
      return serveFile(res, safePath);
    }
  }

  return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
});

server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
