const state = {
  db: null,
  localResult: null,
  aiResult: null,
};

const AUTH_USER = 'luf';
const AUTH_PASS = 'sofia1';
const AUTH_KEY = 'sac_finder_auth_ok';

const $ = (id) => document.getElementById(id);
let appInitialized = false;

async function loadDb() {
  const res = await fetch('/db.json');
  if (!res.ok) throw new Error('Failed to load db.json');
  state.db = await res.json();
  const total = [
    state.db.definitions.length,
    state.db.mpd.length,
    state.db.apl.length,
    state.db.sacdb.length,
    state.db.sheet1.length,
  ].reduce((a, b) => a + b, 0);
  $('dbStats').textContent = `${total.toLocaleString()} rows`;
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

function pillClass(score) {
  return 'pill ' + SACEngine.confidenceClass(score);
}

function renderLocalResult(result) {
  state.localResult = result;
  const best = result?.final?.best;
  $('bestSac').textContent = best ? best.code : '—';
  $('bestConfidence').textContent = best ? `${SACEngine.confidenceLabel(best.score)} • ${Math.min(99, Math.round(best.score))}%` : '—';
  $('coreHours').textContent = result?.final?.coreHours ? `${result.final.coreHours} MH` : '—';
  $('accessHours').textContent = result?.final?.accessHours ? `${result.final.accessHours} MH` : '—';
  $('definitionText').textContent = result?.final?.definitionText || '—';
  $('bestSource').textContent = best && best.pieces[0] && best.pieces[0].source ? `${best.pieces[0].source.source} / ${best.pieces[0].source.ref}` : '—';
  $('bestMatchText').textContent = result?.final?.topCoreSegment?.segment || '—';
  $('accessText').textContent = result?.final?.accessText || '—';

  const status = $('statusPill');
  if (best) {
    status.className = pillClass(best.score);
    status.textContent = 'Local engine ready';
  } else {
    status.className = 'pill';
    status.textContent = 'No result';
  }

  $('candidateList').innerHTML = result.final.ranked.slice(0, 8).map((item) => {
    const score = Math.min(99, Math.round(item.score));
    const source = item.pieces[0]?.source ? `${item.pieces[0].source.source} / ${item.pieces[0].source.ref}` : 'Definition-based';
    return `
      <article class="candidate-item">
        <div class="candidate-top">
          <div>
            <div class="candidate-code">${item.code}</div>
            <div class="candidate-meta">${source}</div>
          </div>
          <div class="score-box ${pillClass(item.score)}">${score}%</div>
        </div>
        <div class="bar"><span style="width:${score}%"></span></div>
        <div class="small-muted" style="margin-top:10px;">${item.definition || 'No definition text found.'}</div>
      </article>
    `;
  }).join('') || '<div class="detail-box"><p>No candidates yet.</p></div>';

  $('operationsList').innerHTML = result.segments.map((seg) => {
    const top = seg.candidates[0];
    const tagClass = seg.type === 'access' ? 'pill pill-medium' : 'pill pill-high';
    const tagText = seg.type === 'access' ? 'Access-like' : 'Core-like';
    return `
      <article class="operation-item">
        <div class="operation-top">
          <div>
            <strong>${seg.op.toUpperCase()}</strong>
            <div class="small-muted" style="margin-top:8px;">${seg.segment}</div>
          </div>
          <div class="${tagClass}">${tagText}</div>
        </div>
        <div class="small-muted" style="margin-top:12px;">
          <strong>Best segment match:</strong> ${top ? `${top.code} — ${top.definition || 'no definition text'}` : 'No strong candidate'}<br>
          <strong>APL access:</strong> ${seg.apl ? `${seg.apl.description} (Row ${seg.apl.row})` : 'No APL row used'}
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
  $('aiModePill').textContent = data.mode === 'live_ai' ? 'Live AI' : 'Offline reasoning';
  $('aiRecommendation').textContent = data.recommendation || 'No recommendation.';
  $('aiWhy').innerHTML = (data.why || []).map((item) => `<li>${item}</li>`).join('') || '<li>No reasoning returned.</li>';
  $('aiChecks').innerHTML = (data.checks || []).map((item) => `<li>${item}</li>`).join('') || '<li>No checks returned.</li>';
  $('aiCodes').innerHTML = (data.codes || []).map((item) => `<li><strong>${item.code}</strong>${item.role ? ` — ${item.role}` : ''}${item.note ? `<br><span class="small-muted">${item.note}</span>` : ''}</li>`).join('') || '<li>No candidate bundle returned.</li>';
  $('aiTrace').textContent = (data.trace || []).join('\n') || 'No trace returned.';
  updateStep(4, true);
}

async function runLocal() {
  const text = combinedInput();
  if (!text) {
    setMessage('Paste text or load a TXT/PDF first.', 'error');
    return;
  }
  const result = SACEngine.analyzeText(state.db, text);
  renderLocalResult(result);
  setMessage('Local engine finished. Now you can also run the AI copilot for flexible reasoning.');
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
  $('aiTrace').textContent = 'Reading task text…';
  $('aiRecommendation').textContent = 'Thinking…';
  $('aiWhy').innerHTML = '';
  $('aiChecks').innerHTML = '';
  $('aiCodes').innerHTML = '';

  updateStep(1, true);
  const payload = {
    taskText: text,
    localResult: state.localResult,
  };

  try {
    updateStep(2, true);
    $('aiTrace').textContent = 'Reading task text…\nRetrieving evidence from local database…\nReasoning over top candidates…';
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'AI endpoint failed.');
    }
    const data = await res.json();
    renderAiResult(data);
    setMessage(data.mode === 'live_ai'
      ? 'AI copilot finished with live model reasoning.'
      : 'AI key not configured, so the site used the built-in offline reasoning fallback.');
  } catch (error) {
    updateStep(0, false);
    $('aiModePill').textContent = 'Error';
    $('aiRecommendation').textContent = 'AI request failed.';
    $('aiTrace').textContent = error.message || String(error);
    setMessage(error.message || 'AI request failed.', 'error');
  }
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
    $('aiRecommendation').textContent = 'Run AI copilot to get a more flexible recommendation.';
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
      sessionStorage.setItem(AUTH_KEY, '1');
      errorBox.hidden = true;
      $('authScreen').hidden = true;
      $('appRoot').hidden = false;
      if (!appInitialized) {
        await initApp();
      }
      return;
    }
    errorBox.hidden = false;
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
      $('authScreen').hidden = true;
      $('appRoot').hidden = false;
      await initApp();
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
