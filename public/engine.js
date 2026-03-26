
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    global.SACEngine = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const ACCESS_HINTS = [
    'panel','access panel','cover','hatch','fairing','door panel','trim','lining','liner','open panel','gain access',
    'access door','sidewall','ceiling panel','floor panel','cover panel','remove lining','open trim'
  ];
  const OP_PATTERNS = [
    { name: 'remove', keys: [' remove ',' rmvl ','-rmvl','remove','removal','detach','strip out'] },
    { name: 'install', keys: [' install ',' inst ','-inst','install','installation','fit','reinstall'] },
    { name: 'inspect', keys: [' inspect ','inspection','check','gvi','dvi','examine','test','verify'] },
    { name: 'repair', keys: [' repair ','rework','restore','blend','rectify'] },
    { name: 'replace', keys: [' replace ','repl','renew','change'] },
  ];

  function normalizeText(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/[^a-z0-9\s/_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(text) {
    const stop = new Set([
      'the','and','for','with','from','into','that','this','are','was','will','have','has','had','your','task','card',
      'description','planning','comment','full','area','side','fin','via','after','before','around','system'
    ]);
    return [...new Set(normalizeText(text).split(' ').filter(w => w && w.length > 1 && !stop.has(w)))];
  }

  function detectOperation(text) {
    const norm = ` ${normalizeText(text)} `;
    for (const op of OP_PATTERNS) {
      if (op.keys.some(k => norm.includes(k))) return op.name;
    }
    return 'analyze';
  }

  function detectAccessLike(text) {
    const norm = normalizeText(text);
    return ACCESS_HINTS.some(h => norm.includes(h)) || /for access|gain access|access required|open up/i.test(text || '');
  }

  function splitTaskCard(text) {
    return (text || '')
      .split(/\n+|[.;]+/g)
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => s.length > 5);
  }

  function scoreTokens(segmentTokens, candidateText) {
    const candTokens = tokenize(candidateText);
    let overlap = 0;
    for (const t of segmentTokens) if (candTokens.includes(t)) overlap++;
    return overlap;
  }

  function confidenceLabel(score) {
    if (score >= 80) return 'High';
    if (score >= 55) return 'Medium';
    return 'Low';
  }

  function confidenceClass(score) {
    if (score >= 80) return 'pill-high';
    if (score >= 55) return 'pill-medium';
    return 'pill-low';
  }

  function getDefinitionByCode(db, code) {
    return db.definitions.find(d => d.code === code) || null;
  }

  function getSACDBByCode(db, code) {
    for (const row of db.sacdb) {
      if (row.mother === code || (row.children || []).includes(code)) return row;
    }
    return null;
  }

  function searchApl(db, segment) {
    const segTokens = tokenize(segment);
    const scored = db.apl.map(row => {
      const text = `${row.access || ''} ${row.description || ''}`;
      let score = scoreTokens(segTokens, text);
      if (detectAccessLike(segment) && row.description && normalizeText(segment).includes(normalizeText(row.description))) score += 3;
      return { ...row, score };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
    return scored[0] || null;
  }

  function searchCandidatesForSegment(db, segment) {
    const op = detectOperation(segment);
    const segTokens = tokenize(segment);
    const codeScores = new Map();
    const evidence = [];

    for (const def of db.definitions) {
      let score = scoreTokens(segTokens, `${def.code} ${def.description}`) * 6;
      if (score > 0) {
        const prev = codeScores.get(def.code) || { score: 0, evidence: [] };
        prev.score += score;
        prev.evidence.push({ source: 'SAC definition', ref: def.code, text: def.description, score });
        codeScores.set(def.code, prev);
      }
    }

    for (const row of db.mpd) {
      const text = `${row.description || ''} ${row.access_notes || ''} ${row.access || ''}`;
      let score = scoreTokens(segTokens, text) * 5;
      if (row.sac && score > 0) {
        if (op === 'remove' && /rmvl|remove/i.test(row.description || '')) score += 5;
        if (op === 'install' && /inst|install/i.test(row.description || '')) score += 5;
        if (op === 'inspect' && /inspect|check|gvi|dvi/i.test(row.description || '')) score += 4;
        const prev = codeScores.get(row.sac) || { score: 0, evidence: [] };
        prev.score += score;
        prev.evidence.push({ source: 'A320 MPD', ref: `Row ${row.row}`, text: row.description, score });
        codeScores.set(row.sac, prev);
      }
    }

    for (const row of db.sheet1) {
      const text = `${row.cri || ''} ${row.description || ''} ${row.planning_comments || ''} ${row.access_note || ''}`;
      let score = scoreTokens(segTokens, text) * 4;
      if (score > 0) {
        if (op === 'remove' && /rmvl|remove/i.test((row.description || '') + ' ' + (row.cri || ''))) score += 5;
        if (op === 'install' && /inst|install/i.test((row.description || '') + ' ' + (row.cri || ''))) score += 5;
        if (op === 'inspect' && /inspect|check|test/i.test((row.description || '') + ' ' + (row.cri || ''))) score += 4;
        if (row.sac_code) {
          const prev = codeScores.get(row.sac_code) || { score: 0, evidence: [] };
          prev.score += score;
          prev.evidence.push({ source: 'Sheet1', ref: `Row ${row.row}`, text: row.description, score });
          codeScores.set(row.sac_code, prev);
        } else {
          evidence.push({ source: 'Sheet1', ref: `Row ${row.row}`, text: row.description, score });
        }
      }
    }

    const candidates = [...codeScores.entries()].map(([code, obj]) => {
      const def = getDefinitionByCode(db, code);
      return {
        code,
        score: obj.score,
        definition: def ? def.description : '',
        evidence: obj.evidence.sort((a, b) => b.score - a.score).slice(0, 4),
      };
    }).sort((a, b) => b.score - a.score);

    const accessLike = detectAccessLike(segment);
    const apl = accessLike ? searchApl(db, segment) : null;
    const top = candidates[0] || null;
    let type = 'core';
    if (accessLike && top && top.score < 30) type = 'access';
    if (accessLike && apl && top && top.score < 45) type = 'access';

    return {
      segment,
      op,
      accessLike,
      apl,
      type,
      candidates,
      looseEvidence: evidence.sort((a, b) => b.score - a.score).slice(0, 3),
    };
  }

  function buildOverallResult(db, segmentResults, combinedText) {
    const aggregate = new Map();
    for (const seg of segmentResults) {
      for (const cand of seg.candidates.slice(0, 5)) {
        const prev = aggregate.get(cand.code) || { score: 0, pieces: [], definition: cand.definition };
        prev.score += cand.score;
        prev.pieces.push({ segment: seg.segment, op: seg.op, score: cand.score, source: cand.evidence[0] || null });
        aggregate.set(cand.code, prev);
      }
    }

    const ranked = [...aggregate.entries()].map(([code, data]) => {
      const relation = getSACDBByCode(db, code);
      return {
        code,
        score: data.score,
        definition: data.definition,
        relation,
        pieces: data.pieces.sort((a, b) => b.score - a.score),
      };
    }).sort((a, b) => b.score - a.score);

    const best = ranked[0] || null;
    const topCoreSegment =
      segmentResults.find(s => s.type === 'core' && s.candidates[0] && best && s.candidates[0].code === best.code) ||
      segmentResults.find(s => s.type === 'core' && s.candidates[0]) ||
      null;
    const accessSegments = segmentResults.filter(s => s.type === 'access' || (s.accessLike && s.apl));

    let accessText = 'No clear access-only wording detected.';
    let accessHours = 0;
    if (accessSegments.length) {
      const lines = accessSegments.map(s => s.apl ? `${s.apl.description} (Row ${s.apl.row})` : s.segment);
      accessText = lines.map((t, i) => `Access ${i + 1}: ${t}`).join(' | ');
      accessHours = Math.min(4.5, accessSegments.length * 0.7);
    }

    const definitionText = best ? (getDefinitionByCode(db, best.code)?.description || 'No exact definition row found.') : '—';
    const relationText = best && best.relation
      ? `Mother: ${best.relation.mother} • Children: ${(best.relation.children || []).slice(0, 6).join(', ')}`
      : 'No SACDB relation found.';
    const coreHours = best ? (Math.max(1, Math.min(18, best.score / 28)).toFixed(1)) : '—';

    return {
      best,
      ranked,
      topCoreSegment,
      accessText,
      accessHours: accessHours.toFixed(1),
      coreHours,
      definitionText,
      relationText,
      combinedText,
    };
  }

  function analyzeText(db, text) {
    const segments = splitTaskCard(text);
    const segmentResults = segments.map(seg => searchCandidatesForSegment(db, seg));
    const final = buildOverallResult(db, segmentResults, text);
    return { segments: segmentResults, final };
  }

  return {
    normalizeText,
    tokenize,
    splitTaskCard,
    detectOperation,
    detectAccessLike,
    scoreTokens,
    confidenceLabel,
    confidenceClass,
    getDefinitionByCode,
    getSACDBByCode,
    searchCandidatesForSegment,
    buildOverallResult,
    analyzeText,
  };
});
