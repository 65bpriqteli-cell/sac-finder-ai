const state = { db: null, localResult: null, aiResult: null };
const AUTH_USER = 'luf';
const AUTH_PASS = 'sofia1';
const AUTH_KEY = 'sac_finder_auth_ok';
const $ = (id) => document.getElementById(id);
let appInitialized = false;

async function loadDb() {
  const res = await fetch('/db.json');
  if (!res.ok) throw new Error('Failed to load db.json');
  state.db = await res.json();
}

function combinedInput() {
  const text = [
    $('description').value.trim(),
    $('planning').value.trim(),
    $('taskCard').value.trim(),
  ].filter(Boolean).join('\n');
  $('combinedPreview').textContent = text || 'No input yet.';
  return text;
}

function setMessage(text, type = 'info') {
  const box = $('messageBox');
  if (!text) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  box.hidden = false;
  box.textContent = text;
  box.style.background = type === 'error' ? '#fff1f1' : '#edf3ff';
  box.style.borderColor = type === 'error' ? '#f1baba' : '#cbdaf7';
  box.style.color = type === 'error' ? '#8a2e2e' : '#26427c';
}

function decisionMeta(result) {
  const d = result?.final?.decision || 'NO_SAC';
  if (d === 'MATCH') return { label: 'Exact match', pill: 'pill pill-high', short: 'Exact match found' };
  if (d === 'REVIEW') return { label: 'Manual review', pill: 'pill pill-medium', short: 'More than one exact match' };
  return { label: 'No SAC', pill: 'pill pill-low', short: 'No exact match' };
}

function renderLocalResult(result) {
  state.localResult = result;
  const meta = decisionMeta(result);
  const best = result?.final?.best;

  $('bestSac').textContent = best ? best.code : 'NO SAC';
  $('bestConfidence').textContent = meta.short;
  $('coreHours').textContent = '—';
  $('accessHours').textContent = '—';
  $('definitionText').textContent = result?.final?.definitionText || '—';
  $('bestSource').textContent = best && best.sourceMatch ? `${best.sourceMatch.source} / ${best.sourceMatch.ref}` : '—';
  $('bestMatchText').textContent = result?.final?.topCoreSegment?.segment || result?.final?.decisionText || '—';
  $('accessText').textContent = result?.final?.accessText || '—';

  const status = $('statusPill');
  status.className = meta.pill;
  status.textContent = meta.label;

  $('candidateList').innerHTML = (result.final.ranked || []).map((item) => {
    const source = item.source ? `${item.source.source} / ${item.source.ref}` : '—';
    return `
      <article class="candidate-item">
        <div class="candidate-top">
          <div>
            <div class="candidate-code">${item.code}</div>
            <div class="candidate-meta">${source}</div>
          </div>
          <div class="pill pill-high">Exact row</div>
        </div>
        <div class="small-muted" style="margin-top:10px;">${item.definition || 'No definition text found.'}</div>
      </article>
    `;
  }).join('') || '<div class="detail-box"><p>No exact SAC rows found.</p></div>';

  $('operationsList').innerHTML = result.segments.map((seg) => {
    const match = seg.exactMatches && seg.exactMatches[0] ? seg.exactMatches[0] : null;
    const tagClass = seg.decision === 'EXACT' ? 'pill pill-high' : (seg.decision === 'MULTIPLE' ? 'pill pill-medium' : 'pill pill-low');
    const tagText = seg.decision === 'EXACT' ? 'Exact row found' : (seg.decision === 'MULTIPLE' ? 'Multiple exact rows' : 'No exact row');
    return `
      <article class="operation-item">
        <div class="operation-top">
          <div>
            <strong>${seg.op ? seg.op.toUpperCase() : 'NO OPERATION'}</strong>
            <div class="small-muted" style="margin-top:8px;">${seg.segment}</div>
          </div>
          <div class="${tagClass}">${tagText}</div>
        </div>
        <div class="small-muted" style="margin-top:12px;">
          <strong>Search result:</strong> ${match ? `${match.code} from ${match.source} / ${match.ref}` : seg.reason}<br>
          <strong>Mode:</strong> strict exact search
        </div>
      </article>
    `;
  }).join('') || '<div class="detail-box"><p>No operations detected yet.</p></div>';
}

function updateStep(index, doneBefore = true) {
  const nodes = [...$('agentSteps').querySelectorAll('.agent-step')];
  nodes.forEach((node, idx) => {
    node.classList.remove('active', 'done');
    if (idx < index && doneBefore) node.classList.add('done');
    else if (idx === index) node.classList.add('active');
  });
}

function renderAiResult(data) {
  state.aiResult = data;
  $('aiModePill').textContent = 'Strict search';
  $('aiRecommendation').textContent = data.recommendation || 'No recommendation.';
  $('aiWhy').innerHTML = (data.why || []).map((item) => `<li>${item}</li>`).join('') || '<li>No reasoning returned.</li>';
  $('aiChecks').innerHTML = (data.checks || []).map((item) => `<li>${item}</li>`).join('') || '<li>No checks returned.</li>';
  $('aiCodes').innerHTML = (data.codes || []).map((item) => `<li><strong>${item.code}</strong>${item.role ? ` — ${item.role}` : ''}${item.note ? `<br><span class="small-muted">${item.note}</span>` : ''}</li>`).join('') || '<li>No SAC released.</li>';
  $('aiTrace').textContent = (data.trace || []).join('\n') || 'No trace returned.';
  updateStep(4, true);
}

function buildStrictResult(result) {
  const best = result?.final?.best || null;
  const segments = result?.segments || [];
  if (result?.final?.decision === 'MATCH' && best && best.sourceMatch) {
    return {
      recommendation: `Exact SAC match found: ${best.code}`,
      why: [
        `Detected operation: ${best.sourceMatch.op}`,
        `Exact row found in ${best.sourceMatch.source} / ${best.sourceMatch.ref}`,
        `Matched segment: ${best.sourceMatch.segment}`
      ],
      checks: [
        'The code was released only because one exact authoritative match was found.',
        'No percentages were used in this decision.',
        'No alternative SAC was released.'
      ],
      codes: [{ code: best.code, role: 'exact match', note: best.definition || 'No definition text found.' }],
      trace: segments.map((s, i) => `Segment ${i + 1}: ${s.decision} — ${s.segment}`)
    };
  }

  return {
    recommendation: 'No SAC released because no single exact authoritative match was found.',
    why: [
      'This mode works as a strict search engine, not a suggestion engine.',
      'If the operation is not found exactly, the result stays NO SAC.',
      'If more than one exact code appears, no automatic SAC is allowed.'
    ],
    checks: [
      'Add the exact wording from the task card if needed.',
      'Make sure the operation is explicitly present in the text.',
      'Check whether the database really contains the exact operation row.'
    ],
    codes: [],
    trace: segments.map((s, i) => `Segment ${i + 1}: ${s.decision} — ${s.segment}`)
  };
}

async function runLocal() {
  const text = combinedInput();
  if (!text) {
    setMessage('Paste text or load a TXT/PDF first.', 'error');
    return;
  }
  const result = SACEngine.analyzeText(state.db, text);
  renderLocalResult(result);
  setMessage('Strict search finished. SAC is released only on one exact authoritative match.');
}

async function runAi() {
  const text = combinedInput();
  if (!text) {
    setMessage('Paste text or load a TXT/PDF first.', 'error');
    return;
  }
  if (!state.localResult) {
    const result = SACEngine.analyzeText(state.db, text);
    renderLocalResult(result);
  }
  updateStep(0, false);
  updateStep(1, true);
  updateStep(2, true);
  const strictResult = buildStrictResult(state.localResult);
  renderAiResult(strictResult);
  setMessage('Strict exact search completed. No guessing was used.');
}

async function extractPdfText(file) {
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return pages.join('\n');
}

function bindEvents() {
  ['description', 'planning', 'taskCard'].forEach((id) => {
    $(id).addEventListener('input', combinedInput);
  });

  $('clearBtn').addEventListener('click', () => {
    $('description').value = '';
    $('planning').value = '';
    $('taskCard').value = '';
    $('candidateList').innerHTML = '';
    $('operationsList').innerHTML = '';
    $('bestSac').textContent = '—';
    $('bestConfidence').textContent = '—';
    $('definitionText').textContent = '—';
    $('bestSource').textContent = '—';
    $('bestMatchText').textContent = '—';
    $('accessText').textContent = '—';
    $('coreHours').textContent = '—';
    $('accessHours').textContent = '—';
    $('statusPill').className = 'pill';
    $('statusPill').textContent = 'Idle';
    $('aiRecommendation').textContent = 'Run AI copilot to get a strict exact-search result.';
    $('aiWhy').innerHTML = '';
    $('aiChecks').innerHTML = '';
    $('aiCodes').innerHTML = '';
    $('aiTrace').textContent = 'No AI activity yet.';
    $('aiModePill').textContent = 'Ready';
    updateStep(0, false);
    combinedInput();
    setMessage('');
    state.localResult = null;
    state.aiResult = null;
  });

  $('runLocalBtn').addEventListener('click', runLocal);
  $('runAiBtn').addEventListener('click', runAi);

  $('fileInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      let text = '';
      if (file.name.toLowerCase().endsWith('.pdf')) {
        setMessage('Reading PDF…');
        text = await extractPdfText(file);
      } else {
        text = await file.text();
      }
      $('taskCard').value = text;
      combinedInput();
      setMessage(`Loaded ${file.name}`);
    } catch (error) {
      setMessage(`Could not read file: ${error.message || error}`, 'error');
    }
  });
}

function bindAuth() {
  const form = $('authForm');
  const errorBox = $('authError');
  const userInput = $('authUsername');
  const passInput = $('authPassword');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = userInput.value.trim();
    const password = passInput.value;
    if (username === AUTH_USER && password === AUTH_PASS) {
      try {
        await initApp();
        sessionStorage.setItem(AUTH_KEY, '1');
        errorBox.hidden = true;
        $('authScreen').hidden = true;
        $('appRoot').hidden = false;
      } catch (error) {
        errorBox.hidden = false;
        errorBox.textContent = `Initialization failed: ${error.message || error}`;
        $('appRoot').hidden = true;
        $('authScreen').hidden = false;
      }
      return;
    }
    errorBox.hidden = false;
    errorBox.textContent = 'Wrong username or password.';
    passInput.value = '';
    passInput.focus();
  });
}

async function initApp() {
  if (appInitialized) return;
  await loadDb();
  bindEvents();
  combinedInput();
  updateStep(0, false);
  appInitialized = true;
}

(async function init() {
  try {
    bindAuth();
    const authorized = sessionStorage.getItem(AUTH_KEY) === '1';
    if (authorized) {
      try {
        await initApp();
        $('authScreen').hidden = true;
        $('appRoot').hidden = false;
      } catch (error) {
        sessionStorage.removeItem(AUTH_KEY);
        $('authScreen').hidden = false;
        $('appRoot').hidden = true;
        const errorBox = $('authError');
        errorBox.hidden = false;
        errorBox.textContent = `Initialization failed: ${error.message || error}`;
      }
      return;
    }
    $('authScreen').hidden = false;
    $('appRoot').hidden = true;
    $('authUsername').focus();
  } catch (error) {
    console.error(error);
    const errorBox = $('authError');
    errorBox.hidden = false;
    errorBox.textContent = `Initialization failed: ${error.message || error}`;
  }
})();
