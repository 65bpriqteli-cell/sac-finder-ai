
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
    { name: 'remove', regex: /\b(remove|removal|rmvl|detach|strip\s*out)\b/i },
    { name: 'install', regex: /\b(install|installation|inst|fit|reinstall)\b/i },
    { name: 'inspect', regex: /\b(inspect|inspection|check|gvi|dvi|examine|test|verify)\b/i },
    { name: 'repair', regex: /\b(repair|rework|restore|blend|rectify)\b/i },
    { name: 'replace', regex: /\b(replace|repl|renew|change)\b/i },
  ];

  const STOP_WORDS = new Set([
    'the','and','for','with','from','into','that','this','are','was','will','have','has','had','your','task','card',
    'description','planning','comment','full','area','side','fin','via','after','before','around','system','only','note',
    'zone','general','detail','detailed','visual','special','internal','external','installed','condition','operation',
    'operator','operators','depending','environment','experience','recommended','guidance','previous','accomplishment',
    'left','right','lh','rh','valid','instead','refer','section','introduction','additional','level','managed','component',
    'door','doors','structure','internal','external','compartment'
  ]);

  const OP_WORDS = new Set(['remove','removal','rmvl','detach','strip','out','install','installation','inst','fit','reinstall','inspect','inspection','check','gvi','dvi','examine','test','verify','repair','rework','restore','blend','rectify','replace','repl','renew','change']);

  function normalizeText(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/[^a-z0-9\s/_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(text) {
    return normalizeText(text).split(' ').filter(Boolean);
  }

  function extractSignalTokens(text) {
    return [...new Set(tokenize(text).filter((w) => w.length > 1 && !STOP_WORDS.has(w) && !OP_WORDS.has(w)))];
  }

  function buildSignalPhrases(text) {
    const tokens = extractSignalTokens(text);
    const phrases = new Set();
    for (let size = 2; size <= 4; size++) {
      for (let i = 0; i <= tokens.length - size; i++) {
        const phrase = tokens.slice(i, i + size).join(' ').trim();
        if (phrase.length >= 5) phrases.add(phrase);
      }
    }
    return [...phrases];
  }

  function detectOperations(text) {
    return OP_PATTERNS.filter((op) => op.regex.test(text || '')).map((op) => op.name);
  }

  function detectOperation(text) {
    return detectOperations(text)[0] || 'analyze';
  }

  function containsOperation(text, opName) {
    const found = OP_PATTERNS.find((op) => op.name === opName);
    return found ? found.regex.test(text || '') : false;
  }

  function detectAccessLike(text) {
    const norm = normalizeText(text);
    return ACCESS_HINTS.some((h) => norm.includes(h)) || /for access|gain access|access required|open up/i.test(text || '');
  }

  function splitTaskCard(text) {
    return (text || '')
      .split(/\n+|[.;]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => s.length > 5);
  }

  function countOverlap(tokens, sourceText) {
    const sourceTokens = new Set(tokenize(sourceText));
    let overlap = 0;
    for (const t of tokens) {
      if (sourceTokens.has(t)) overlap++;
    }
    return overlap;
  }

  function countPhraseHits(phrases, sourceText) {
    const norm = normalizeText(sourceText);
    let hits = 0;
    for (const phrase of phrases) {
      if (norm.includes(phrase)) hits++;
    }
    return hits;
  }

  function minimumOverlapRequired(signalTokens) {
    return signalTokens.length <= 2 ? 1 : 2;
  }

  function splitSacCodes(raw) {
    return [...new Set(String(raw || '')
      .split(/\r?\n|,|;/g)
      .map((x) => x.trim())
      .filter(Boolean))];
  }

  function getDefinitionByCode(db, code) {
    return (db.definitions || []).find((d) => d.code === code) || null;
  }

  function getSACDBByCode(db, code) {
    for (const row of (db.sacdb || [])) {
      if (row.mother === code || (row.children || []).includes(code)) return row;
    }
    return null;
  }

  function searchApl(db, segment) {
    const signalTokens = extractSignalTokens(segment);
    const phrases = buildSignalPhrases(segment);
    const rows = Array.isArray(db.apl) ? db.apl : [];
    const scored = rows.map((row) => {
      const text = `${row.access || ''} ${row.description || ''}`;
      return {
        ...row,
        overlap: countOverlap(signalTokens, text),
        phraseHits: countPhraseHits(phrases, text)
      };
    }).filter((r) => r.overlap > 0 || r.phraseHits > 0)
      .sort((a, b) => (b.phraseHits + b.overlap) - (a.phraseHits + a.overlap));
    return scored[0] || null;
  }

  function createPiece(segment, op, sourceName, ref, overlap, phraseHits, opAligned, authoritative) {
    return {
      segment,
      op,
      overlap,
      phraseHits,
      opAligned,
      authoritative,
      source: { source: sourceName, ref }
    };
  }

  function addCandidate(map, code, definition, piece) {
    const prev = map.get(code) || {
      code,
      definition: definition || '',
      evidence: [],
      authoritativeHits: 0,
      pieces: []
    };
    prev.evidence.push(piece);
    prev.pieces.push(piece);
    if (piece.authoritative) prev.authoritativeHits += 1;
    if (!prev.definition && definition) prev.definition = definition;
    map.set(code, prev);
  }

  function sourceMatch(segment, op, sourceText, requireOperation) {
    const signalTokens = extractSignalTokens(segment);
    const phrases = buildSignalPhrases(segment);
    const overlap = countOverlap(signalTokens, sourceText);
    const phraseHits = countPhraseHits(phrases, sourceText);
    const minOverlap = minimumOverlapRequired(signalTokens);
    const opAligned = requireOperation ? (op === 'analyze' ? true : containsOperation(sourceText, op)) : true;
    const accepted = opAligned && (overlap >= minOverlap || phraseHits > 0);
    return { accepted, overlap, phraseHits, minOverlap, opAligned };
  }

  function searchCandidatesForSegment(db, segment) {
    const op = detectOperation(segment);
    const accessLike = detectAccessLike(segment);
    const candidateMap = new Map();
    const looseEvidence = [];

    for (const def of (db.definitions || [])) {
      const match = sourceMatch(segment, op, `${def.code} ${def.description}`, false);
      if (!match.accepted) continue;
      const piece = createPiece(segment, op, 'SAC definition', def.code, match.overlap, match.phraseHits, true, false);
      addCandidate(candidateMap, def.code, def.description, piece);
    }

    for (const row of (db.mpd || [])) {
      const text = `${row.description || ''} ${row.access_notes || ''} ${row.access || ''}`;
      const match = sourceMatch(segment, op, text, true);
      if (!match.accepted) continue;
      const codes = splitSacCodes(row.sac);
      if (!codes.length) continue;
      for (const code of codes) {
        const def = getDefinitionByCode(db, code);
        const piece = createPiece(segment, op, 'A320 MPD', `Row ${row.row}`, match.overlap, match.phraseHits, match.opAligned, true);
        addCandidate(candidateMap, code, def ? def.description : '', piece);
      }
    }

    for (const row of (db.sheet1 || [])) {
      const text = `${row.cri || ''} ${row.description || ''} ${row.planning_comments || ''} ${row.access_note || ''}`;
      const match = sourceMatch(segment, op, text, true);
      if (!match.accepted) continue;
      const codes = splitSacCodes(row.sac_code);
      if (!codes.length) {
        looseEvidence.push({ source: 'Sheet1', ref: `Row ${row.row}`, text: row.description, overlap: match.overlap, phraseHits: match.phraseHits });
        continue;
      }
      for (const code of codes) {
        const def = getDefinitionByCode(db, code);
        const piece = createPiece(segment, op, 'Sheet1', `Row ${row.row}`, match.overlap, match.phraseHits, match.opAligned, true);
        addCandidate(candidateMap, code, def ? def.description : '', piece);
      }
    }

    const candidates = [...candidateMap.values()].map((item) => {
      const score = item.pieces.reduce((sum, p) => sum + (p.authoritative ? 100 : 25) + (p.overlap * 10) + (p.phraseHits * 20), 0);
      return {
        code: item.code,
        score,
        definition: item.definition,
        authoritativeHits: item.authoritativeHits,
        evidence: item.evidence.slice(0, 4),
        pieces: item.pieces.sort((a, b) => {
          const sa = (a.authoritative ? 100 : 0) + a.overlap + a.phraseHits;
          const sb = (b.authoritative ? 100 : 0) + b.overlap + b.phraseHits;
          return sb - sa;
        })
      };
    }).sort((a, b) => b.score - a.score);

    const apl = accessLike ? searchApl(db, segment) : null;
    const top = candidates[0] || null;
    const type = accessLike && (!top || top.authoritativeHits === 0) ? 'access' : 'core';

    return {
      segment,
      op,
      accessLike,
      apl,
      type,
      candidates,
      looseEvidence: looseEvidence.slice(0, 3)
    };
  }

  function isValidatedCandidate(candidate) {
    if (!candidate || candidate.authoritativeHits <= 0) return false;
    const topPiece = candidate.pieces[0];
    return Boolean(topPiece && topPiece.opAligned === true && (topPiece.overlap >= 1 || topPiece.phraseHits >= 1));
  }

  function buildOverallResult(db, segmentResults, combinedText) {
    const aggregate = new Map();

    for (const seg of segmentResults) {
      for (const cand of seg.candidates.slice(0, 8)) {
        const prev = aggregate.get(cand.code) || {
          code: cand.code,
          score: 0,
          definition: cand.definition,
          relation: getSACDBByCode(db, cand.code),
          pieces: [],
          authoritativeHits: 0
        };
        prev.score += cand.score;
        prev.authoritativeHits += cand.authoritativeHits || 0;
        prev.pieces.push(...cand.pieces.slice(0, 3));
        if (!prev.definition && cand.definition) prev.definition = cand.definition;
        aggregate.set(cand.code, prev);
      }
    }

    const ranked = [...aggregate.values()]
      .map((item) => ({ ...item, pieces: item.pieces.slice(0, 5) }))
      .sort((a, b) => b.score - a.score);

    const validated = ranked.filter(isValidatedCandidate);
    let best = null;
    let decision = 'NO_SAC';
    let decisionText = 'No validated SAC match was found in the restricted data.';

    if (validated.length === 1) {
      best = validated[0];
      decision = 'MATCH';
      decisionText = `Validated SAC match: ${best.code}`;
    } else if (validated.length > 1) {
      const top = validated[0];
      const second = validated[1];
      if (!second || top.score >= second.score + 35) {
        best = top;
        decision = 'MATCH';
        decisionText = `Validated SAC match: ${best.code}`;
      } else {
        decision = 'AMBIGUOUS';
        decisionText = 'More than one validated SAC candidate exists. No SAC is released automatically.';
      }
    }

    const topCoreSegment = best
      ? segmentResults.find((s) => s.type === 'core' && s.candidates[0] && s.candidates[0].code === best.code) || null
      : null;

    const accessSegments = segmentResults.filter((s) => s.type === 'access' || (s.accessLike && s.apl));
    const accessText = accessSegments.length
      ? accessSegments.map((s, i) => `Access ${i + 1}: ${s.apl ? `${s.apl.description} (Row ${s.apl.row})` : s.segment}`).join(' | ')
      : 'No clear access-only wording detected.';

    return {
      best,
      ranked,
      validated,
      decision,
      decisionText,
      topCoreSegment,
      accessText,
      accessHours: null,
      coreHours: null,
      definitionText: best ? (getDefinitionByCode(db, best.code)?.description || best.definition || 'No exact definition row found.') : decisionText,
      relationText: best && best.relation
        ? `Mother: ${best.relation.mother} • Children: ${(best.relation.children || []).slice(0, 6).join(', ')}`
        : 'No SACDB relation found.',
      combinedText,
    };
  }

  function confidenceLabel(score) {
    if (score >= 260) return 'Validated';
    if (score >= 200) return 'Candidate';
    return 'Weak';
  }

  function confidenceClass(score) {
    if (score >= 260) return 'pill-high';
    if (score >= 200) return 'pill-medium';
    return 'pill-low';
  }

  function analyzeText(db, text) {
    const segments = splitTaskCard(text);
    const segmentResults = segments.map((seg) => searchCandidatesForSegment(db, seg));
    const final = buildOverallResult(db, segmentResults, text);
    return { segments: segmentResults, final };
  }

  return {
    normalizeText,
    tokenize,
    extractSignalTokens,
    buildSignalPhrases,
    splitTaskCard,
    detectOperation,
    detectOperations,
    detectAccessLike,
    confidenceLabel,
    confidenceClass,
    getDefinitionByCode,
    getSACDBByCode,
    searchCandidatesForSegment,
    buildOverallResult,
    analyzeText,
  };
});
