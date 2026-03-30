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

function getOpenAIConfig() {
  return {
    apiKey: String(process.env.OPENAI_API_KEY || '').trim(),
    model: process.env.OPENAI_MODEL || 'gpt-5-nano',
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  };
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }
  if (Array.isArray(data?.output)) {
    const parts = [];
    for (const item of data.output) {
      if (Array.isArray(item?.content)) {
        for (const content of item.content) {
          if (content?.type === 'output_text' && typeof content.text === 'string') {
            parts.push(content.text);
          }
        }
      }
    }
    if (parts.length) return parts.join('\n');
  }
  return '';
}

async function postResponsesApi(payload) {
  const { apiKey, baseUrl } = getOpenAIConfig();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing in the runtime environment.');
  }

  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${txt}`);
  }

  return await response.json();
}

async function callOpenAI(taskText, localResult) {
  const { model } = getOpenAIConfig();
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
    'Return JSON only with this exact shape.',
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

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['recommendation', 'why', 'checks', 'codes', 'trace'],
    properties: {
      recommendation: { type: 'string' },
      why: { type: 'array', items: { type: 'string' } },
      checks: { type: 'array', items: { type: 'string' } },
      codes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'role', 'note'],
          properties: {
            code: { type: 'string' },
            role: { type: 'string' },
            note: { type: 'string' }
          }
        }
      },
      trace: { type: 'array', items: { type: 'string' } }
    }
  };

  const data = await postResponsesApi({
    model,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: 'You are a grounded aircraft maintenance assistant. Return structured JSON only and stay strictly inside the supplied sources.' }]
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'sac_response',
        strict: true,
        schema
      }
    }
  });

  const content = extractResponseText(data);
  if (!content) {
    throw new Error('No model response content');
  }

  const parsed = JSON.parse(content);
  const recommendation = typeof parsed.recommendation === 'string' ? parsed.recommendation : 'No recommendation returned.';

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

async function pingOpenAI() {
  const { model } = getOpenAIConfig();
  const data = await postResponsesApi({
    model,
    input: 'Reply with exactly OK.',
    max_output_tokens: 16
  });
  return {
    ok: true,
    model,
    text: extractResponseText(data),
    usage: data.usage || null,
    response_id: data.id || null
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
    const cfg = getOpenAIConfig();
    return sendJson(res, 200, {
      ok: true,
      hasKey: Boolean(cfg.apiKey),
      model: cfg.model,
      apiStyle: 'responses',
      sources: {
        definitions: definitions.length,
        mpd: mpd.length,
        htmlLength: htmlRaw.length
      }
    });
  }

  if (req.method === 'GET' && urlPath === '/api/test-openai') {
    try {
      const result = await pingOpenAI();
      return sendJson(res, 200, result);
    } catch (error) {
      const msg = String(error?.message || error);
      return sendJson(res, 500, {
        ok: false,
        error: 'OpenAI ping failed.',
        detail: msg
      });
    }
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
      if (msg.includes('429')) {
        return sendJson(res, 429, {
          error: 'OpenAI returned a rate limit or quota error. Check the project billing, model access, or retry later.',
          detail: msg
        });
      }
      if (msg.includes('401') || msg.toLowerCase().includes('invalid api key')) {
        return sendJson(res, 401, {
          error: 'The OpenAI API key was rejected by OpenAI.',
          detail: msg
        });
      }
      return sendJson(res, 500, {
        error: 'OpenAI request failed.',
        detail: msg
      });
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
