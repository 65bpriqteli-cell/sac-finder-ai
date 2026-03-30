
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    global.SACEngine = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
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
    'left','right','lh','rh','valid','instead','refer','section','introduction','additional','level','managed',
    'door','doors','structure','internal','external','compartment'
  ]);

  const ACCESS_HINTS = [
    'panel','access panel','cover','hatch','fairing','door panel','trim','lining','liner','open panel','gain access',
    'access door','sidewall','ceiling panel','floor panel','cover panel','remove lining','open trim'
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
    return normalizeText(text).split(' ').filter(Boolean);
  }

  function detectOperation(text) {
    const raw = text || '';
    for (const op of OP_PATTERNS) {
      if (op.regex.test(raw)) return op.name;
    }
    return null;
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

  function signalTokens(text) {
    const op = detectOperation(text);
    return tokenize(text).filter((t) => {
      if (!t || t.length <= 1) return false;
      if (STOP_WORDS.has(t)) return false;
      if (op && OP_PATTERNS.find((p) => p.name === op)?.regex.test(t)) return false;
      return true;
    });
  }

  function allTokensPresent(tokens, sourceText) {
    if (!tokens.length) return false;
    const sourceTokens = new Set(tokenize(sourceText));
    return tokens.every((t) => sourceTokens.has(t));
  }

  function operationAligned(opName, sourceText) {
    if (!opName) return false;
    const pattern = OP_PATTERNS.find((p) => p.name === opName);
    return pattern ? pattern.regex.test(sourceText || '') : false;
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

  function exactRowsForSegment(db, segment) {
    const op = detectOperation(segment);
    const tokens = signalTokens(segment);
    const accessLike = detectAccessLike(segment);

    if (!op || !tokens.length) {
      return {
        segment,
        op: op || 'none',
        accessLike,
        exactMatches: [],
        decision: 'NO_MATCH',
        reason: 'No explicit operation or no searchable signal tokens were found in this segment.'
      };
    }

    const matches = [];

    for (const row of (db.mpd || [])) {
      const text = `${row.description || ''} ${row.access_notes || ''} ${row.access || ''}`;
      if (!operationAligned(op, text)) continue;
      if (!allTokensPresent(tokens, text)) continue;
      for (const code of splitSacCodes(row.sac)) {
        if (!code) continue;
        matches.push({
          code,
          source: 'A320 MPD',
          ref: `Row ${row.row}`,
          text: row.description || text,
          op,
          tokens
        });
      }
    }

    for (const row of (db.sheet1 || [])) {
      const text = `${row.cri || ''} ${row.description || ''} ${row.planning_comments || ''} ${row.access_note || ''}`;
      if (!operationAligned(op, text)) continue;
      if (!allTokensPresent(tokens, text)) continue;
      for (const code of splitSacCodes(row.sac_code)) {
        if (!code) continue;
        matches.push({
          code,
          source: 'Sheet1',
          ref: `Row ${row.row}`,
          text: row.description || text,
          op,
          tokens
        });
      }
    }

    const uniqueCodes = [...new Set(matches.map((m) => m.code))];

    if (!matches.length) {
      return {
        segment,
        op,
        accessLike,
        exactMatches: [],
        decision: 'NO_MATCH',
        reason: 'No exact authoritative row was found for all detected tokens and operation.'
      };
    }

    if (uniqueCodes.length !== 1) {
      return {
        segment,
        op,
        accessLike,
        exactMatches: matches,
        decision: 'MULTIPLE',
        reason: 'More than one exact SAC code matched this segment. No automatic SAC is allowed.'
      };
    }

    return {
      segment,
      op,
      accessLike,
      exactMatches: matches,
      decision: 'EXACT',
      reason: `Exact operation match found for ${uniqueCodes[0]}.`
    };
  }

  function analyzeText(db, text) {
    const segments = splitTaskCard(text).map((segment) => exactRowsForSegment(db, segment));

    const exactCodes = [];
    for (const seg of segments) {
      if (seg.decision === 'EXACT') {
        for (const match of seg.exactMatches) exactCodes.push(match.code);
      }
    }

    const uniqueExactCodes = [...new Set(exactCodes)];
    let decision = 'NO_SAC';
    let best = null;
    let decisionText = 'No exact SAC match was found.';

    if (segments.some((s) => s.decision === 'MULTIPLE')) {
      decision = 'NO_SAC';
      decisionText = 'Multiple exact SAC codes were found in at least one segment. No automatic SAC is allowed.';
    } else if (uniqueExactCodes.length === 1) {
      const code = uniqueExactCodes[0];
      const def = getDefinitionByCode(db, code);
      const relation = getSACDBByCode(db, code);
      const sourceSegment = segments.find((s) => s.decision === 'EXACT' && s.exactMatches.some((m) => m.code === code));
      const sourceMatch = sourceSegment ? sourceSegment.exactMatches.find((m) => m.code === code) : null;
      best = {
        code,
        definition: def ? def.description : '',
        relation,
        sourceMatch
      };
      decision = 'MATCH';
      decisionText = `Exact SAC match found: ${code}`;
    }

    const ranked = uniqueExactCodes.map((code) => {
      const def = getDefinitionByCode(db, code);
      const firstSource = segments.flatMap((s) => s.exactMatches).find((m) => m.code === code) || null;
      return {
        code,
        definition: def ? def.description : '',
        exact: true,
        source: firstSource
      };
    });

    return {
      segments,
      final: {
        decision,
        decisionText,
        best,
        ranked,
        topCoreSegment: best ? segments.find((s) => s.exactMatches.some((m) => m.code === best.code)) || null : null,
        accessText: segments.filter((s) => s.accessLike).map((s, i) => `Access ${i + 1}: ${s.segment}`).join(' | ') || 'No clear access-only wording detected.',
        definitionText: best ? (best.definition || 'No exact definition row found.') : decisionText,
        relationText: best && best.relation ? `Mother: ${best.relation.mother} • Children: ${(best.relation.children || []).slice(0, 6).join(', ')}` : 'No SACDB relation found.',
        coreHours: null,
        accessHours: null,
        combinedText: text
      }
    };
  }

  function confidenceLabel() {
    return 'Exact';
  }

  function confidenceClass() {
    return 'pill-high';
  }

  return {
    normalizeText,
    tokenize,
    splitTaskCard,
    detectOperation,
    detectAccessLike,
    getDefinitionByCode,
    getSACDBByCode,
    analyzeText,
    confidenceLabel,
    confidenceClass
  };
});
