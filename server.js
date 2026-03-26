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

function getDbCounts() {
  const db = readJsonFileSafe(DB_PATH, {}) || {};
  return {
    definitions: Array.isArray(db.definitions) ? db.definitions.length : 0,
    mpd: Array.isArray(db.mpd) ? db.mpd.length : 0,
    apl: Array.isArray(db.apl) ? db.apl.length : 0,
    sacdb: Array.isArray(db.sacdb) ? db.sacdb.length : 0,
    sheet1: Array.isArray(db.sheet1) ? db.sheet1.length : 0,
  };
}

function buildFallback(taskText, localResult) {
  const decision = localResult?.final?.decision || 'NO_SAC';
  const best = localResult?.final?.best || null;
  if (decision === 'MATCH' && best) {
    return {
      mode: 'offline_fallback',
      recommendation: `Validated SAC match: ${best.code}`,
      why: [
        'The local engine found an authoritative database match.',
        'The result passed the strict deterministic rules.'
      ],
      checks: [
        'Confirm the task text is complete.',
        'Confirm aircraft applicability and side/frame details.',
        'Confirm the restricted database contains the needed record.'
      ],
      codes: [{ code: best.code, role: 'validated SAC', note: best.definition || 'No definition text available.' }],
      trace: [
        `Decision: ${decision}`,
        `Task text length: ${String(taskText || '').length}`
      ]
    };
  }

  return {
    mode: 'offline_fallback',
    recommendation: decision === 'AMBIGUOUS'
      ? 'No SAC released automatically because more than one validated candidate exists.'
      : 'No SAC released because no validated database match was found.',
    why: [
      'The system is in strict mode and does not guess.',
      `Local decision: ${decision}`
    ],
    checks: [
      'Add more exact wording from the task card.',
      'Confirm the component and operation are explicitly stated.',
      'Verify that the database actually contains the matching record.'
    ],
    codes: [],
    trace: [
      `Decision: ${decision}`,
      `Task text length: ${String(taskText || '').length}`
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

  const prompt = [
    'You are a strict SAC verification assistant.',
    'You may use ONLY the supplied LOCAL_RESULT.',
    'Do not invent missing evidence.',
    'If LOCAL_RESULT.final.decision is NO_SAC, return no SAC.',
    'If LOCAL_RESULT.final.decision is AMBIGUOUS, return no SAC and explain ambiguity briefly.',
    'If LOCAL_RESULT.final.decision is MATCH, you may return ONLY the validated best SAC from LOCAL_RESULT.final.best.code.',
    'Never introduce any code that does not appear in LOCAL_RESULT.',
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
    'LOCAL_RESULT:',
    JSON.stringify(localResult || null, null, 2)
  ].join('\n');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return strict grounded JSON only.' },
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
  if (!content) throw new Error('No model response content');
  const parsed = JSON.parse(content);
  return {
    mode: 'live_ai',
    recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : 'No recommendation returned.',
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
    return sendJson(res, 200, {
      ok: true,
      hasKey: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      sources: getDbCounts()
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
