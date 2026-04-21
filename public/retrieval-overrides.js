function decisionMeta(result) {
  const d = result?.final?.decision || 'NO_SAC';
  if (d === 'MATCH') return { label: 'Exact match', pill: 'pill pill-high', short: 'Exact workbook match' };
  if (d === 'REVIEW') return { label: 'Review candidates', pill: 'pill pill-medium', short: 'Closest workbook candidates' };
  return { label: 'No supported match', pill: 'pill pill-low', short: 'No exact workbook support' };
}

function candidateTag(item) {
  if (item?.exact || item?.matchType === 'exact') return { text: 'Exact row', className: 'pill pill-high' };
  if (item?.matchType === 'strong') return { text: 'Strong candidate', className: 'pill pill-medium' };
  return { text: 'Closest candidate', className: 'pill pill-low' };
}

function renderLocalResult(result) {
  state.localResult = result;
  const meta = decisionMeta(result);
  const best = result?.final?.best || null;
  const topCandidate = result?.final?.topCandidate || null;
  const displayItem = best
    ? { code: best.code, definition: best.definition, source: best.sourceMatch }
    : topCandidate;

  $('bestSac').textContent = displayItem ? displayItem.code : 'NO SAC';
  $('bestConfidence').textContent = meta.short;
  $('coreHours').textContent = EMPTY_VALUE;
  $('accessHours').textContent = EMPTY_VALUE;
  $('definitionText').textContent = result?.final?.definitionText || EMPTY_VALUE;
  $('bestSource').textContent = displayItem && displayItem.source ? `${displayItem.source.source} / ${displayItem.source.ref}` : EMPTY_VALUE;
  $('bestMatchText').textContent = result?.final?.topCoreSegment?.segment || result?.final?.decisionText || EMPTY_VALUE;
  $('accessText').textContent = result?.final?.accessText || EMPTY_VALUE;

  const status = $('statusPill');
  status.className = meta.pill;
  status.textContent = meta.label;

  const ranked = result?.final?.ranked || [];
  $('candidateList').innerHTML = ranked.map((item) => {
    const source = item.source ? `${item.source.source} / ${item.source.ref}` : EMPTY_VALUE;
    const tag = candidateTag(item);
    const scoreBits = [];
    if (item.score) scoreBits.push(`Score ${Math.round(item.score)}`);
    if (item.evidenceCount) scoreBits.push(`${item.evidenceCount} row(s)`);
    if (item.criticalHits) scoreBits.push(`${item.criticalHits} critical hit(s)`);
    const scoreText = scoreBits.join(' • ') || 'No score';
    return `
      <article class="candidate-item">
        <div class="candidate-top">
          <div>
            <div class="candidate-code">${escapeHtml(item.code)}</div>
            <div class="candidate-meta">${escapeHtml(source)}</div>
          </div>
          <div class="${tag.className}">${escapeHtml(tag.text)}</div>
        </div>
        <div class="small-muted candidate-definition">${escapeHtml(item.definition || 'No definition text found.')}</div>
        <div class="small-muted candidate-meta">${escapeHtml(scoreText)}</div>
      </article>
    `;
  }).join('') || '<div class="empty-state">No workbook candidates found.</div>';

  const segments = result?.segments || [];
  $('operationsList').innerHTML = segments.map((seg) => {
    const match = (seg.exactMatches && seg.exactMatches[0]) || (seg.candidateMatches && seg.candidateMatches[0]) || null;

    let tagClass = 'pill pill-low';
    let tagText = 'No candidate row';
    if (seg.decision === 'IGNORED_CONDITIONAL') {
      tagClass = 'pill pill-low';
      tagText = 'Conditional';
    } else if (seg.decision === 'EXACT') {
      tagClass = 'pill pill-high';
      tagText = 'Exact row found';
    } else if (seg.decision === 'MULTIPLE') {
      tagClass = 'pill pill-medium';
      tagText = 'Multiple exact rows';
    } else if (seg.decision === 'CANDIDATE') {
      tagClass = 'pill pill-medium';
      tagText = 'Candidate rows found';
    }

    const matchText = match
      ? `${match.code} from ${match.source} / ${match.ref}${match.matchType ? ` (${match.matchType}` : ''}${match.score ? `, score ${Math.round(match.score)}` : ''}${match.matchType ? ')' : ''}`
      : seg.reason;

    const modeText = seg.decision === 'IGNORED_CONDITIONAL'
      ? 'conditional line ignored by default'
      : (seg.decision === 'EXACT' ? 'exact workbook support' : 'retrieval search');

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
          <strong>Mode:</strong> ${escapeHtml(modeText)}
        </div>
      </article>
    `;
  }).join('') || '<div class="empty-state">No operations detected yet.</div>';
}

function runLocal() {
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
  setMessage('Workbook retrieval finished. Exact matches can be released, and closest workbook rows are shown for review.');
}

function clientEvidenceForAi(localResult) {
  const rows = [];
  const seenRows = new Set();

  for (const segment of (localResult?.segments || [])) {
    for (const match of (segment.candidateMatches || [])) {
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
        match_type: match.matchType || 'related',
        score: Number.isFinite(Number(match.score)) ? Number(match.score) : null,
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
