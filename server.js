
const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');
const engine = require('./public/engine.js');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || /^\s*#/.test(line) || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'db.json'), 'utf-8'));

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
};

function sendJson(res, status, payload) {
  const data = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
  });
  res.end(data);
}

function sendFile(res, filepath) {
  fs.readFile(filepath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    const ext = path.extname(filepath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 4 * 1024 * 1024) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function buildFallback(localResult, taskText) {
  const best = localResult?.final?.best;
  const ranked = (localResult?.final?.ranked || []).slice(0, 3);
  const recommendation = best
    ? `Best offline recommendation: start with ${best.code}. Treat it as the most likely core SAC, then validate whether the surrounding wording only describes access removals or actually separate work.`
    : 'No strong SAC candidate was found locally. Refine the task text or provide more task-card detail.';

  const why = [];
  if (best) {
    why.push(`Top local match is ${best.code} based on embedded workbook evidence and SAC definition overlap.`);
    if (localResult.final.topCoreSegment?.segment) why.push(`Core-like wording: ${localResult.final.topCoreSegment.segment}`);
    if (localResult.final.accessText) why.push(`Access split: ${localResult.final.accessText}`);
  }
  ranked.forEach((item, index) => {
    why.push(`Alternative ${index + 1}: ${item.code} (${Math.min(99, Math.round(item.score))}% local score).`);
  });

  const checks = [
    'Confirm whether the description includes only access removal or a real structural/interior operation.',
    'Check side / zone / frame / door location against the exact task card wording.',
    'Compare access MH separately from operation MH before final SAC bundle selection.',
  ];
  if (/a321/i.test(taskText || '')) checks.push('Verify whether the task applies to A321-specific door / exit areas.');

  const codes = ranked.map((item, index) => ({
    code: item.code,
    role: index === 0 ? 'most likely core SAC' : 'alternative candidate',
    note: item.definition || 'No definition text found.',
  }));

  return {
    mode: 'offline_fallback',
    recommendation,
    why,
    checks,
    codes,
    trace: [
      'No OPENAI_API_KEY found, so the server used offline planner logic.',
      `Parsed ${localResult?.segments?.length || 0} operation segment(s).`,
      `Ranked ${localResult?.final?.ranked?.length || 0} SAC candidates from local data.`,
    ],
  };
}

function buildPrompt(taskText, localResult) {
  const topCandidates = (localResult?.final?.ranked || []).slice(0, 5).map((item) => ({
    code: item.code,
    score: Math.min(99, Math.round(item.score)),
    definition: item.definition,
    evidence: item.pieces.slice(0, 2).map((piece) => ({
      op: piece.op,
      segment: piece.segment,
      source: piece.source,
    })),
  }));

  const segments = (localResult?.segments || []).map((seg) => ({
    segment: seg.segment,
    operation: seg.op,
    type: seg.type,
    apl: seg.apl ? { row: seg.apl.row, description: seg.apl.description } : null,
    topCandidate: seg.candidates[0] ? {
      code: seg.candidates[0].code,
      score: Math.min(99, Math.round(seg.candidates[0].score)),
      definition: seg.candidates[0].definition,
    } : null,
  }));

  return [
    'You are an aircraft maintenance planning copilot helping to choose SAC codes from retrieved workbook evidence.',
    'Be practical and flexible, but never invent evidence that is not in the supplied retrieval context.',
    'Important rules:',
    '- Separate access wording from the real core task when possible.',
    '- Prefer a candidate bundle only when the wording supports it.',
    '- Mention ambiguity clearly if location / side / frame / aircraft variant is missing.',
    '- Use the retrieved evidence as primary grounding.',
    '- Do not claim certainty if evidence is weak.',
    '- Return JSON only.',
    '',
    'Return exactly this JSON shape:',
    '{',
    '  "recommendation": "string",',
    '  "why": ["string", "string"],',
    '  "checks": ["string", "string"],',
    '  "codes": [{"code":"string","role":"string","note":"string"}],',
    '  "trace": ["string", "string"]',
    '}',
    '',
    'TASK TEXT:',
    taskText,
    '',
    'RETRIEVED SEGMENTS:',
    JSON.stringify(segments, null, 2),
    '',
    'TOP CANDIDATES:',
    JSON.stringify(topCandidates, null, 2),
    '',
    'LOCAL SUMMARY:',
    JSON.stringify({
      best: localResult?.final?.best ? {
        code: localResult.final.best.code,
        score: Math.min(99, Math.round(localResult.final.best.score)),
      } : null,
      definitionText: localResult?.final?.definitionText,
      accessText: localResult?.final?.accessText,
      relationText: localResult?.final?.relationText,
      coreHours: localResult?.final?.coreHours,
      accessHours: localResult?.final?.accessHours,
    }, null, 2),
  ].join('\n');
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You return grounded JSON only.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Model request failed: ${response.status} ${text}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Model returned no content.');
  return JSON.parse(content);
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, model: process.env.OPENAI_MODEL || null, hasKey: Boolean(process.env.OPENAI_API_KEY) });
  }

  if (req.method === 'POST' && pathname === '/api/agent') {
    try {
      const body = await readBody(req);
      const taskText = String(body?.taskText || '').trim();
      if (!taskText) return sendJson(res, 400, { error: 'taskText is required.' });
      const localResult = body?.localResult || engine.analyzeText(DB, taskText);

      if (!process.env.OPENAI_API_KEY) {
        return sendJson(res, 200, buildFallback(localResult, taskText));
      }

      const prompt = buildPrompt(taskText, localResult);
      const ai = await callOpenAI(prompt);
      const safe = {
        mode: 'live_ai',
        recommendation: typeof ai.recommendation === 'string' ? ai.recommendation : 'No recommendation returned.',
        why: Array.isArray(ai.why) ? ai.why.slice(0, 8) : [],
        checks: Array.isArray(ai.checks) ? ai.checks.slice(0, 8) : [],
        codes: Array.isArray(ai.codes) ? ai.codes.slice(0, 8) : [],
        trace: Array.isArray(ai.trace) ? ai.trace.slice(0, 12) : ['AI completed reasoning.'],
      };
      return sendJson(res, 200, safe);
    } catch (error) {
      console.error(error);
      return sendJson(res, 500, { error: error.message || 'Unknown server error' });
    }
  }

  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return sendFile(res, filePath);
  }

  return sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`SAC Finder AI Copilot is running on http://localhost:${PORT}`);
});
