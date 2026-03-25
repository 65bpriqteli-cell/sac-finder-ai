const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const INDEX_PATH = path.join(__dirname, 'public', 'index.html');

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), 'application/json; charset=utf-8');
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

function buildFallback(localResult, taskText) {
  const best = localResult?.final?.ranked?.[0];
  const recommendation = best
    ? `Start with ${best.code} as the most likely primary SAC, then confirm whether the surrounding wording is true core work or only access removal.`
    : 'No strong primary SAC was found from the embedded screen logic. Add more exact task-card wording.';
  const checks = [
    'Confirm the exact zone, side, frame, and door location from the task card.',
    'Separate access wording from the real core operation before finalizing the bundle.',
    'Compare the best local SAC wording with your actual workbook examples before approval.'
  ];
  if (/a321/i.test(taskText || '')) checks.push('Verify whether the task is A321-specific before confirming the code.');
  return {
    mode: 'offline_fallback',
    recommendation,
    checks,
    codes: Array.isArray(localResult?.final?.ranked) ? localResult.final.ranked.slice(0, 3).map((item, index) => ({
      code: item.code,
      role: index === 0 ? 'most likely primary candidate' : 'alternative candidate',
      note: item.definition || item.pieces?.[0]?.segment || 'No note available.'
    })) : []
  };
}

async function callOpenAI(taskText, localResult) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

  if (!apiKey) return buildFallback(localResult, taskText);

  const topCandidates = Array.isArray(localResult?.final?.ranked)
    ? localResult.final.ranked.slice(0, 5).map(item => ({
        code: item.code,
        score: Math.min(99, Math.round(item.score || 0)),
        definition: item.definition || '',
        segment: item.pieces?.[0]?.segment || null
      }))
    : [];

  const prompt = [
    'You are an aircraft maintenance planning copilot helping choose SAC codes.',
    'Use the supplied local screen evidence first. Be concise and practical.',
    'Do not invent evidence that is not in the provided context.',
    'Return JSON only with this exact shape:',
    '{',
    '  "recommendation": "string",',
    '  "checks": ["string", "string", "string"],',
    '  "codes": [{"code":"string","role":"string","note":"string"}]',
    '}',
    '',
    'TASK TEXT:',
    taskText,
    '',
    'TOP CANDIDATES:',
    JSON.stringify(topCandidates, null, 2)
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
        { role: 'system', content: 'You are a grounded aircraft maintenance assistant. Return JSON only.' },
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
    checks: Array.isArray(parsed.checks) ? parsed.checks : [],
    codes: Array.isArray(parsed.codes) ? parsed.codes : []
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      hasKey: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini'
    });
  }

  if (req.method === 'POST' && req.url === '/api/agent') {
    try {
      const body = await readBody(req);
      const taskText = String(body?.taskText || '').trim();
      if (!taskText) return sendJson(res, 400, { error: 'taskText is required.' });
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

  if (req.method === 'GET' && req.url === '/') {
    try {
      const html = fs.readFileSync(INDEX_PATH, 'utf-8');
      return send(res, 200, html, 'text/html; charset=utf-8');
    } catch {
      return send(res, 500, 'Missing public/index.html', 'text/plain; charset=utf-8');
    }
  }

  return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
});

server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});