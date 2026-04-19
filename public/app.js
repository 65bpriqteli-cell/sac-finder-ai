const state = { db: null, localResult: null, aiResult: null, dbLabel: 'Repository data' };
const AUTH_USER = 'luf';
const AUTH_PASS = 'sofia1';
const AUTH_KEY = 'sac_finder_auth_ok';
const DB_STORAGE_KEY = 'sac_finder_imported_db_v1';
const EMPTY_VALUE = '---';
const SAC_CODE_RE = /^[A-Z]{3}-[A-Z0-9_/-]+-\d$/;
const $ = (id) => document.getElementById(id);
let appInitialized = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function splitSacCodes(raw) {
  return [...new Set(String(raw || '')
    .split(/\r?\n|\s+|,|;/g)
    .map((x) => cleanCell(x))
    .filter((x) => SAC_CODE_RE.test(x)))];
}

function dbCounts(db) {
  return {
    definitions: Array.isArray(db?.definitions) ? db.definitions.length : 0,
    mpd: Array.isArray(db?.mpd) ? db.mpd.length : 0,
  };
}

function dbSummary(db) {
  const counts = dbCounts(db);
  return `${counts.definitions} definitions / ${counts.mpd} example rows`;
}

function updateDataSourceUi(label = state.dbLabel, badgeText = 'Source') {
  const title = $('dataSourceTitle');
  const meta = $('dataSourceMeta');
  const badge = $('dataSourceBadge');
  if (!title || !meta || !badge) return;

  title.textContent = label;
  meta.textContent = state.db ? `${dbSummary(state.db)}. Evidence references use the workbook sheet and row.` : 'No source data loaded.';
  badge.textContent = badgeText;
  badge.className = badgeText.toLowerCase().includes('imported') ? 'pill pill-high' : 'pill';
}

function applyDb(db, label, badgeText, persist = false) {
  state.db = db;
  state.dbLabel = label;
  resetInputState();
  updateDataSourceUi(label, badgeText);

  if (persist) {
    try {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify({ label, db }));
    } catch {
      setMessage('Excel data loaded for this session, but browser storage is full so it was not saved.', 'error');
    }
  }
}

function loadStoredDb() {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.db || !Array.isArray(parsed.db.mpd)) return null;
    return parsed;
  } catch {
    localStorage.removeItem(DB_STORAGE_KEY);
    return null;
  }
}

async function loadDb() {
  const stored = loadStoredDb();
  if (stored) {
    applyDb(stored.db, stored.label || 'Imported Excel data', 'Imported Excel', false);
    return;
  }

  const res = await fetch('/db.json');
  if (!res.ok) throw new Error('Failed to load db.json');
  const db = await res.json();
  applyDb(db, 'Repository workbook data', 'Repo data', false);
}

function sheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
    .map((row, index) => ({
      rowNumber: index + 1,
      values: row.map((cell) => cleanCell(cell)),
    }))
    .filter((row) => row.values.some(Boolean));
}

function findMpdSheet(parsedSheets) {
  return parsedSheets.find((sheet) => sheet.rows.some((row) => {
    const first = cleanCell(row.values[0]).toUpperCase();
    const second = cleanCell(row.values[1]).toUpperCase();
    return first === 'DESCRIPTION' && second === 'SAC CODE';
  })) || parsedSheets.find((sheet) => sheet.name.toLowerCase() === 'sheet2') || parsedSheets[0];
}

function extractDefinitions(parsedSheets, fileName) {
  const definitions = [];
  const seen = new Set();

  for (const sheet of parsedSheets) {
    for (const row of sheet.rows) {
      const code = cleanCell(row.values[0]);
      const description = cleanCell(row.values[1]);
      if (!SAC_CODE_RE.test(code) || !description) continue;
      const key = `${code}|${sheet.name}|${row.rowNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      definitions.push({
        code,
        description,
        row: row.rowNumber,
        source: fileName,
        source_ref: `${sheet.name} row ${row.rowNumber}`,
      });
    }
  }

  return definitions;
}

function extractMpdRows(sheet, fileName) {
  const headerIndex = sheet.rows.findIndex((row) => {
    const first = cleanCell(row.values[0]).toUpperCase();
    const second = cleanCell(row.values[1]).toUpperCase();
    return first === 'DESCRIPTION' && second === 'SAC CODE';
  });
  const startIndex = headerIndex >= 0 ? headerIndex + 1 : 0;
  const rows = [];

  for (const row of sheet.rows.slice(startIndex)) {
    const description = cleanCell(row.values[0]);
    const codes = splitSacCodes(row.values[1]);
    if (!description || !codes.length) continue;
    rows.push({
      row: row.rowNumber,
      description,
      sac: codes.join('\n'),
      source: fileName,
      source_ref: `${sheet.name} row ${row.rowNumber}`,
    });
  }

  return rows;
}

function buildDbFromWorkbook(workbook, fileName) {
  const parsedSheets = workbook.SheetNames.map((name) => ({ name, rows: sheetRows(workbook, name) }));
  const definitions = extractDefinitions(parsedSheets, fileName);
  const mpdSheet = findMpdSheet(parsedSheets);
  const mpd = mpdSheet ? extractMpdRows(mpdSheet, fileName) : [];

  if (!definitions.length) {
    throw new Error('No SAC definition rows were found. Expected codes like CAB-CO_CARPFLO-0 in column A and descriptions in column B.');
  }
  if (!mpd.length) {
    throw new Error('No example rows with DESCRIPTION and SAC CODE were found.');
  }

  return {
    sourceWorkbook: {
      fileName,
      importedAt: new Date().toISOString(),
      rule: 'Every recommendation must cite source_ref such as Sheet2 row 12.',
      definitions: definitions.length,
      examples: mpd.length,
    },
    definitions,
    mpd,
    apl: [],
    sacdb: [],
    sheet1: [],
  };
}

async function importExcelFile(file) {
  if (!window.XLSX) {
    throw new Error('Excel parser did not load. Check the CDN connection and refresh the page.');
  }
  setMessage(`Reading ${file.name}...`);
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const db = buildDbFromWorkbook(workbook, file.name);
  applyDb(db, file.name, 'Imported Excel', true);
  setMessage(`Loaded ${file.name}: ${dbSummary(db)}. Every match now cites the source sheet and row.`);
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
    box.className = 'message';
    return;
  }
  box.hidden = false;
  box.textContent = text;
  box.className = `message message-${type}`;
}

function setApiStatus(text, type = 'neutral', meta = '') {
  const pill = $('apiStatusPill');
  const detail = $('apiMeta');
  if (pill) {
    pill.className = `status-badge ${type}`;
    pill.textContent = text;
  }
  if (detail) {
    detail.textContent = meta;
  }
}

async function readJsonResponse(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw };
  }
}

async function fetchJson(url, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {})
  };
  const response = await fetch(url, { ...options, headers });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const message = payload.error || payload.detail || `Request failed with HTTP ${response.status}`;
    const detail = payload.detail && payload.detail !== message ? ` Detail: ${payload.detail}` : '';
    throw new Error(`${message}${detail}`);
  }

  return payload;
}

function sourceSummary(sources) {
  if (!sources) return '';
  const definitions = Number.isFinite(sources.definitions) ? sources.definitions : 0;
  const mpd = Number.isFinite(sources.mpd) ? sources.mpd : 0;
  return `${definitions} server definitions / ${mpd} server rows`;
}

function modelBudgetSummary(health) {
  const maxTokens = Number.isFinite(health?.maxOutputTokens) ? `max ${health.maxOutputTokens}` : 'max default';
  const effort = health?.reasoningEffort ? `effort ${health.reasoningEffort}` : 'effort default';
  return `${health.model} / ${effort} / ${maxTokens}`;
}

async function refreshApiStatus(throwOnError = false) {
  try {
    const health = await fetchJson('/api/health');
    const localSources = state.db ? dbSummary(state.db) : 'browser source not loaded';
    const rules = Number.isFinite(health.rules) ? `${health.rules} rules` : 'rules loaded';
    const modelBudget = modelBudgetSummary(health);
    if (health.hasKey) {
      setApiStatus('OpenAI ready', 'ready', `${modelBudget} / browser ${localSources} / ${rules}`);
    } else {
      setApiStatus('API key missing', 'warning', `${modelBudget} / browser ${localSources} / add OPENAI_API_KEY on the server`);
    }
    return { ...health, sourceSummary: sourceSummary(health.sources) };
  } catch (error) {
    setApiStatus('Backend offline', 'error', error.message || 'Health check failed');
    if (throwOnError) throw error;
    return null;
  }
}

function usageSummary(usage) {
  if (!usage) return '';
  const parts = [];
  if (typeof usage.input_tokens === 'number') parts.push(`input ${usage.input_tokens}`);
  if (typeof usage.output_tokens === 'number') parts.push(`output ${usage.output_tokens}`);
  if (typeof usage.total_tokens === 'number') parts.push(`total ${usage.total_tokens}`);
  return parts.join(', ');
}

function setAiButtonBusy(isBusy) {
  const button = $('runAiBtn');
  button.disabled = isBusy;
  button.textContent = isBusy ? 'Calling AI...' : 'Run AI copilot';
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
  $('coreHours').textContent = EMPTY_VALUE;
  $('accessHours').textContent = EMPTY_VALUE;
  $('definitionText').textContent = result?.final?.definitionText || EMPTY_VALUE;
  $('bestSource').textContent = best && best.sourceMatch ? `${best.sourceMatch.source} / ${best.sourceMatch.ref}` : EMPTY_VALUE;
  $('bestMatchText').textContent = result?.final?.topCoreSegment?.segment || result?.final?.decisionText || EMPTY_VALUE;
  $('accessText').textContent = result?.final?.accessText || EMPTY_VALUE;

  const status = $('statusPill');
  status.className = meta.pill;
  status.textContent = meta.label;

  const ranked = result?.final?.ranked || [];
  $('candidateList').innerHTML = ranked.map((item) => {
    const source = item.source ? `${item.source.source} / ${item.source.ref}` : EMPTY_VALUE;
    return `
      <article class="candidate-item">
        <div class="candidate-top">
          <div>
            <div class="candidate-code">${escapeHtml(item.code)}</div>
            <div class="candidate-meta">${escapeHtml(source)}</div>
          </div>
          <div class="pill pill-high">Exact row</div>
        </div>
        <div class="small-muted candidate-definition">${escapeHtml(item.definition || 'No definition text found.')}</div>
      </article>
    `;
  }).join('') || '<div class="empty-state">No exact SAC rows found.</div>';

  const segments = result?.segments || [];
  $('operationsList').innerHTML = segments.map((seg) => {
    const match = seg.exactMatches && seg.exactMatches[0] ? seg.exactMatches[0] : null;
    const tagClass = seg.decision === 'EXACT' ? 'pill pill-high' : (seg.decision === 'MULTIPLE' ? 'pill pill-medium' : 'pill pill-low');
    const tagText = seg.decision === 'EXACT' ? 'Exact row found' : (seg.decision === 'MULTIPLE' ? 'Multiple exact rows' : 'No exact row');
    const matchText = match ? `${match.code} from ${match.source} / ${match.ref}` : seg.reason;
    return `
      <article class="operation-item">
        <div class="operation-top">
          <div>
            <strong>${escapeHtml(seg.op ? seg.op.toUpperCase() : 'NO OPERATION')}</strong>
            <div class="small-muted operation-segment">${escapeHtml(seg.segment)}</div>
          </div>
          <div class="${tagClass}">${escapeHtml(tagText)}</div>
        </div>
        <div class="small-muted operation-result">
          <strong>Search result:</strong> ${escapeHtml(matchText)}<br>
          <strong>Mode:</strong> strict exact search
        </div>
      </article>
    `;
  }).join('') || '<div class="empty-state">No operations detected yet.</div>';
}

function updateStep(index, doneBefore = true) {
  const nodes = [...$('agentSteps').querySelectorAll('.agent-step')];
  nodes.forEach((node, idx) => {
    node.classList.remove('active', 'done');
    if (idx < index && doneBefore) node.classList.add('done');
    else if (idx === index) node.classList.add('active');
  });
}

function renderSimpleList(id, items, emptyText) {
  const list = $(id);
  list.innerHTML = '';
  const values = Array.isArray(items) ? items : [];
  if (!values.length) {
    const li = document.createElement('li');
    li.textContent = emptyText;
    list.appendChild(li);
    return;
  }
  values.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = String(item);
    list.appendChild(li);
  });
}

function renderCodeList(codes) {
  const list = $('aiCodes');
  list.innerHTML = '';
  const values = Array.isArray(codes) ? codes : [];
  if (!values.length) {
    const li = document.createElement('li');
    li.textContent = 'No SAC released.';
    list.appendChild(li);
    return;
  }

  values.forEach((item) => {
    const li = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = item?.code || 'UNKNOWN';
    li.appendChild(strong);

    if (item?.role) {
      li.appendChild(document.createTextNode(` - ${item.role}`));
    }

    if (item?.note || item?.evidence_ref) {
      const br = document.createElement('br');
      const span = document.createElement('span');
      span.className = 'small-muted';
      span.textContent = [item.note, item.evidence_ref ? `Evidence: ${item.evidence_ref}` : ''].filter(Boolean).join(' ');
      li.appendChild(br);
      li.appendChild(span);
    }

    list.appendChild(li);
  });
}

function renderAiResult(data) {
  state.aiResult = data;
  const status = data.status ? `AI ${data.status}` : (data.mode === 'live_ai' ? 'Live AI' : 'AI result');
  $('aiModePill').textContent = status;
  $('aiRecommendation').textContent = data.recommendation || data.answer || 'No recommendation.';
  renderSimpleList('aiWhy', data.why, 'No reasoning returned.');
  renderSimpleList('aiChecks', data.checks, 'No checks returned.');
  renderCodeList(data.codes);

  const trace = Array.isArray(data.trace) ? [...data.trace] : [];
  if (data.status) trace.unshift(`Decision: ${data.status}`);
  if (data.confidence) trace.unshift(`Confidence: ${data.confidence}`);
  const usage = usageSummary(data.usage);
  if (usage) trace.push(`Token usage: ${usage}`);
  if (data.model) trace.push(`Model: ${data.model}`);
  if (data.response_id) trace.push(`OpenAI response: ${data.response_id}`);
  $('aiTrace').textContent = trace.join('\n') || 'No trace returned.';
  updateStep(4, true);
}

async function runLocal() {
  const text = combinedInput();
  if (!text) {
    setMessage('Paste text or load a TXT/PDF first.', 'error');
    return;
  }
  if (!state.db) {
    setMessage('Source data is not loaded yet.', 'error');
    return;
  }
  const result = SACEngine.analyzeText(state.db, text);
  renderLocalResult(result);
  setMessage('Strict search finished. SAC is released only on one exact authoritative match with a sheet and row reference.');
}

function clientEvidenceForAi(localResult) {
  const rows = [];
  const seenRows = new Set();

  for (const segment of (localResult?.segments || [])) {
    for (const match of (segment.exactMatches || [])) {
      const evidenceRef = match.source_ref || match.ref || '';
      const key = `${match.code}|${evidenceRef}|${match.text}`;
      if (seenRows.has(key)) continue;
      seenRows.add(key);
      rows.push({
        code: match.code,
        source: match.source || state.dbLabel,
        source_ref: evidenceRef,
        text: match.text || '',
        matched_segment: segment.segment || '',
      });
    }
  }

  const definitions = [];
  const seenDefinitions = new Set();
  for (const item of (localResult?.final?.ranked || [])) {
    if (!item?.code || seenDefinitions.has(item.code)) continue;
    seenDefinitions.add(item.code);
    definitions.push({ code: item.code, description: item.definition || '' });
  }

  return {
    dataSource: state.dbLabel,
    sourceWorkbook: state.db?.sourceWorkbook || null,
    rows,
    definitions,
  };
}

async function runAi() {
  const text = combinedInput();
  if (!text) {
    setMessage('Paste text or load a TXT/PDF first.', 'error');
    return;
  }

  setAiButtonBusy(true);
  $('aiModePill').textContent = 'Checking API';
  updateStep(0, false);
  setMessage('Checking backend and OpenAI configuration...');

  try {
    if (!state.localResult) {
      const result = SACEngine.analyzeText(state.db, text);
      renderLocalResult(result);
    }

    updateStep(1, true);
    const health = await refreshApiStatus(true);
    if (!health?.hasKey) {
      throw new Error('OPENAI_API_KEY is missing on the server. Add it to the hosting environment or local .env file, then restart the server.');
    }

    $('aiModePill').textContent = 'Calling API';
    updateStep(2, true);
    setMessage(`Sending task to OpenAI (${health.model}) with workbook evidence refs...`);

    const data = await fetchJson('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskText: text,
        localResult: state.localResult,
        clientEvidence: clientEvidenceForAi(state.localResult),
      })
    });

    updateStep(3, true);
    renderAiResult(data);
    const usage = usageSummary(data.usage);
    setMessage(`Live AI copilot completed${usage ? ` with token usage: ${usage}.` : '.'}`);
  } catch (error) {
    $('aiModePill').textContent = 'API error';
    updateStep(0, false);
    setMessage(`AI copilot failed: ${error.message || error}`, 'error');
  } finally {
    setAiButtonBusy(false);
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

function resetInputState() {
  state.localResult = null;
  state.aiResult = null;
}

function clearResults() {
  $('candidateList').innerHTML = '';
  $('operationsList').innerHTML = '';
  $('bestSac').textContent = EMPTY_VALUE;
  $('bestConfidence').textContent = EMPTY_VALUE;
  $('definitionText').textContent = EMPTY_VALUE;
  $('bestSource').textContent = EMPTY_VALUE;
  $('bestMatchText').textContent = EMPTY_VALUE;
  $('accessText').textContent = EMPTY_VALUE;
  $('coreHours').textContent = EMPTY_VALUE;
  $('accessHours').textContent = EMPTY_VALUE;
  $('statusPill').className = 'pill';
  $('statusPill').textContent = 'Idle';
  $('aiRecommendation').textContent = 'Run AI copilot to get a live API recommendation.';
  $('aiWhy').innerHTML = '';
  $('aiChecks').innerHTML = '';
  $('aiCodes').innerHTML = '';
  $('aiTrace').textContent = 'No AI activity yet.';
  $('aiModePill').textContent = 'Ready';
  updateStep(0, false);
}

function bindEvents() {
  ['description', 'planning', 'taskCard'].forEach((id) => {
    $(id).addEventListener('input', () => {
      resetInputState();
      combinedInput();
    });
  });

  $('clearBtn').addEventListener('click', () => {
    $('description').value = '';
    $('planning').value = '';
    $('taskCard').value = '';
    clearResults();
    combinedInput();
    setMessage('');
    resetInputState();
  });

  $('resetDataBtn').addEventListener('click', async () => {
    try {
      localStorage.removeItem(DB_STORAGE_KEY);
      const res = await fetch('/db.json');
      if (!res.ok) throw new Error('Failed to load repository data.');
      const db = await res.json();
      applyDb(db, 'Repository workbook data', 'Repo data', false);
      clearResults();
      setMessage('Repository data restored. Load All data .xlsx again when you need the full local workbook.');
      refreshApiStatus();
    } catch (error) {
      setMessage(`Could not reset data: ${error.message || error}`, 'error');
    }
  });

  $('runLocalBtn').addEventListener('click', runLocal);
  $('runAiBtn').addEventListener('click', runAi);

  $('excelInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importExcelFile(file);
      clearResults();
      refreshApiStatus();
    } catch (error) {
      setMessage(`Could not import Excel data: ${error.message || error}`, 'error');
    } finally {
      event.target.value = '';
    }
  });

  $('fileInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      let text = '';
      if (file.name.toLowerCase().endsWith('.pdf')) {
        setMessage('Reading PDF...');
        text = await extractPdfText(file);
      } else {
        text = await file.text();
      }
      $('taskCard').value = text;
      resetInputState();
      combinedInput();
      setMessage(`Loaded ${file.name}`);
    } catch (error) {
      setMessage(`Could not read file: ${error.message || error}`, 'error');
    } finally {
      event.target.value = '';
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
  setApiStatus('Loading data', 'neutral', 'Reading workbook source...');
  await loadDb();
  bindEvents();
  combinedInput();
  updateStep(0, false);
  appInitialized = true;
  refreshApiStatus();
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
