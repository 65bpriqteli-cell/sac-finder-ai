const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_PATH = path.join(PUBLIC_DIR, 'index.html');
const DB_PATH = path.join(PUBLIC_DIR, 'db.json');
const ENV_PATH = path.join(__dirname, '.env');
const MAX_BODY_BYTES = 3 * 1024 * 1024;

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

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin'
};

const SAC_SYSTEM_RULES = [
  'Use only the supplied SAC Definition rows and A320 MPD rows as evidence.',
  'Never invent SAC codes, labor hours, rows, references, or maintenance facts.',
  'Release a SAC code only when the task text and supplied rows support it explicitly.',
  'When evidence is missing, conflicting, or too broad, return status NO_SAC or REVIEW instead of guessing.',
  'Separate core work from access-only work before recommending a bundle.',
  'Treat localResult as a retrieval helper only; verify every released code against supplied source rows.',
  'Prefer exact row evidence over semantic similarity. Similar wording is not enough by itself.',
  'Do not use percentages as confidence. Use high, medium, or low with a short reason.',
  'Every recommended code must include an evidence reference and a note explaining why it is included.',
  'Return JSON only. No markdown, no prose outside the JSON object.'
];

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type });
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

function loadDotEnv(filePath) {
  const raw = readTextFileSafe(filePath, '');
  if (!raw) return;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    let value = trimmed.slice(eqIndex + 1).trim();
    const quoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);

    process.env[key] = value;
  }
}

loadDotEnv(ENV_PATH);

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
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
  return { definitions, mpd };
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
          if (content?.type === 'refusal' && typeof content.refusal === 'string') {
            throw new Error(`OpenAI refusal: ${content.refusal}`);
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
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${txt}`);
  }

  return await response.json();
}

function buildSacSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'confidence', 'recommendation', 'why', 'checks', 'codes', 'trace'],
    properties: {
      status: { type: 'string', enum: ['MATCH', 'REVIEW', 'NO_SAC'] },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      recommendation: { type: 'string' },
      why: { type: 'array', items: { type: 'string' } },
      checks: { type: 'array', items: { type: 'string' } },
      codes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'role', 'note', 'evidence_ref'],
          properties: {
            code: { type: 'string' },
            role: { type: 'string' },
            note: { type: 'string' },
            evidence_ref: { type: 'string' }
          }
        }
      },
      trace: { type: 'array', items: { type: 'string' } }
    }
  };
}

function buildPlannerPrompt(taskText, localResult, sources) {
  return [
    'MISSION',
    'Choose SAC code guidance for the supplied aircraft maintenance task.',
    '',
    'HARD OPERATING RULES',
    ...SAC_SYSTEM_RULES.map((rule, index) => `${index + 1}. ${rule}`),
    '',
    'DECISION CONTRACT',
    '- MATCH: one or more SAC codes are explicitly supported by supplied source rows.',
    '- REVIEW: evidence exists, but a planner must resolve ambiguity before release.',
    '- NO_SAC: supplied sources do not support a code release.',
    '',
    'TASK TEXT',
    taskText,
    '',
    'LOCAL RETRIEVAL HELPER',
    JSON.stringify(localResult || null, null, 2),
    '',
    'SAC DEFINITIONS SOURCE',
    JSON.stringify(sources.definitions, null, 2),
    '',
    'A320 MPD SOURCE',
    JSON.stringify(sources.mpd, null, 2)
  ].join('\n');
}

function normalizeAiResult(parsed, rawData, model) {
  const status = ['MATCH', 'REVIEW', 'NO_SAC'].includes(parsed?.status) ? parsed.status : 'REVIEW';
  const confidence = ['high', 'medium', 'low'].includes(parsed?.confidence) ? parsed.confidence : 'low';
  const recommendation = typeof parsed?.recommendation === 'string' ? parsed.recommendation : 'No recommendation returned.';

  return {
    mode: 'live_ai',
    model,
    status,
    confidence,
    answer: recommendation,
    recommendation,
    why: Array.isArray(parsed?.why) ? parsed.why.map(String) : [],
    checks: Array.isArray(parsed?.checks) ? parsed.checks.map(String) : [],
    codes: Array.isArray(parsed?.codes) ? parsed.codes.map((item) => ({
      code: String(item?.code || ''),
      role: String(item?.role || ''),
      note: String(item?.note || ''),
      evidence_ref: String(item?.evidence_ref || '')
    })).filter((item) => item.code) : [],
    trace: Array.isArray(parsed?.trace) ? parsed.trace.map(String) : [],
    usage: rawData.usage || null,
    response_id: rawData.id || null
  };
}

async function callOpenAI(taskText, localResult) {
  const { model } = getOpenAIConfig();
  const sources = getRestrictedSources();
  const prompt = buildPlannerPrompt(taskText, localResult, sources);

  const data = await postResponsesApi({
    model,
    input: [
      {
        role: 'system',
        content: [{
          type: 'input_text',
          text: 'You are a strict Lufthansa-Technik SAC planning assistant. Follow the hard operating rules exactly and return only valid JSON.'
        }]
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
        schema: buildSacSchema()
      }
    },
    max_output_tokens: 1500
  });

  const content = extractResponseText(data);
  if (!content) {
    throw new Error('No model response content');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI returned invalid JSON content.');
  }

  return normalizeAiResult(parsed, data, model);
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

function handleOpenAIError(res, error) {
  const msg = String(error?.message || error);
  if (msg.includes('429')) {
    return sendJson(res, 429, {
      error: 'OpenAI returned a rate limit or quota error. Check project billing, model access, or retry later.',
      detail: msg
    });
  }
  if (msg.includes('401') || msg.toLowerCase().includes('invalid api key')) {
    return sendJson(res, 401, {
      error: 'The OpenAI API key was rejected by OpenAI.',
      detail: msg
    });
  }
  if (msg.includes('404') && msg.toLowerCase().includes('model')) {
    return sendJson(res, 502, {
      error: 'The configured OpenAI model was not found or is not available to this project.',
      detail: msg
    });
  }
  return sendJson(res, 500, {
    error: 'OpenAI request failed.',
    detail: msg
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (req.method === 'GET' && urlPath === '/api/health') {
    const { definitions, mpd } = getRestrictedSources();
    const cfg = getOpenAIConfig();
    const htmlRaw = readTextFileSafe(INDEX_PATH, '');
    return sendJson(res, 200, {
      ok: true,
      hasKey: Boolean(cfg.apiKey),
      model: cfg.model,
      apiStyle: 'responses',
      rules: SAC_SYSTEM_RULES.length,
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
      return handleOpenAIError(res, error);
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
