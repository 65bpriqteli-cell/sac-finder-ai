
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    global.SACEngine = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const TOP_SEGMENT_CANDIDATES = 10;
  const TOP_FINAL_CANDIDATES = 14;

  const OP_PATTERNS = [
    { name: 'remove', regex: /\b(remove|removal|rmvl|detach|strip\s*out|take\s*out)\b/i },
    { name: 'open', regex: /\b(open|open\s*up|unfasten)\b/i },
    { name: 'disconnect', regex: /\b(disconnect|isolate|deactivate|de-energize|deenergize)\b/i },
    { name: 'install', regex: /\b(install|installation|inst|fit|reinstall|re-fit|refit)\b/i },
    { name: 'close', regex: /\b(close|reclose|secure|fasten)\b/i },
    { name: 'inspect', regex: /\b(inspect|inspection|check|gvi|dvi|examine|test|verify)\b/i },
    { name: 'repair', regex: /\b(repair|rework|restore|blend|rectify)\b/i },
    { name: 'replace', regex: /\b(replace|repl|renew|change)\b/i },
    { name: 'access', regex: /\b(gain access|get access|for access|access required|access to)\b/i },
    { name: 'safety', regex: /\b(safety|tag|lockout|make safe|make-safe)\b/i },
  ];

  const CONDITIONAL_PATTERNS = [
    /\bif\b/i,
    /\bif applicable\b/i,
    /\bif installed\b/i,
    /\bif necessary\b/i,
    /\bas required\b/i,
    /\bwhen applicable\b/i,
    /\bwhen necessary\b/i,
    /\bas necessary\b/i,
    /\bwhere applicable\b/i,
  ];

  const STOP_WORDS = new Set([
    'the','and','for','with','from','into','that','this','are','was','will','have','has','had','your','task','card',
    'description','planning','comment','full','via','after','before','around','system','only','note',
    'zone','general','detail','detailed','visual','special','internal','external','installed','condition','operation',
    'operator','operators','depending','environment','experience','recommended','guidance','previous','accomplishment',
    'valid','instead','refer','section','introduction','additional','level','managed','aircraft','job','step',
    'procedure','perform','work','done','then','than','there','here','also','should','shall'
  ]);

  const ACCESS_HINTS = [
    'panel','access panel','cover','hatch','fairing','door panel','trim','lining','liner','open panel','gain access',
    'access door','sidewall','ceiling panel','floor panel','cover panel','remove lining','open trim','panel door',
    'floorboard','shroud','cowling','cowl','closeout panel','access cover'
  ];

  const COMPONENT_HINTS = [
    'panel','door','lining','insulation','valve','pump','filter','fan','actuator','duct','pipe','hose','cable','connector',
    'bracket','fairing','trim','liner','cover','hatch','seat','toilet','sidewall','ceiling','floor','frame','rib','stringer'
  ];

  const BROAD_ROW_PATTERNS = [
    /\bfrom all\b/i,
    /\ball toilets\b/i,
    /\ball doors\b/i,
    /\ball panels\b/i,
    /\ball units\b/i,
    /\ball assemblies\b/i,
    /\ball locations\b/i,
    /\ball zones\b/i,
    /\bapplicable aircraft\b/i,
    /\bgeneral information\b/i,
    /\ball\b/i
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

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function detectOperations(text) {
    const raw = text || '';
    return unique(OP_PATTERNS.filter((op) => op.regex.test(raw)).map((op) => op.name));
  }

  function detectOperation(text) {
    return detectOperations(text)[0] || null;
  }

  function isConditionalSegment(text) {
    const raw = text || '';
    return CONDITIONAL_PATTERNS.some((pattern) => pattern.test(raw));
  }

  function detectAccessLike(text) {
    const norm = normalizeText(text);
    return ACCESS_HINTS.some((hint) => norm.includes(hint)) || /\bfor access\b|\bgain access\b|\baccess required\b|\bopen up\b/i.test(text || '');
  }

  function splitTaskCard(text) {
    return (text || '')
      .split(/\n+|[.;]+/g)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .filter((segment) => segment.length > 3);
  }

  function signalTokens(text) {
    const ops = detectOperations(text);
    return tokenize(text).filter((token) => {
      if (!token || token.length <= 1) return false;
      if (STOP_WORDS.has(token)) return false;
      if (ops.some((opName) => {
        const pattern = OP_PATTERNS.find((entry) => entry.name === opName);
        return pattern ? pattern.regex.test(token) : false;
      })) return false;
      return true;
    });
  }

  function operationAligned(opNames, sourceText) {
    if (!Array.isArray(opNames) || !opNames.length) return false;
    return opNames.some((opName) => {
      const pattern = OP_PATTERNS.find((entry) => entry.name === opName);
      return pattern ? pattern.regex.test(sourceText || '') : false;
    });
  }

  function splitSacCodes(raw) {
    return [...new Set(String(raw || '')
      .split(/\r?\n|,|;/g)
      .map((item) => item.trim())
      .filter(Boolean))];
  }

  function getDefinitionByCode(db, code) {
    return (db.definitions || []).find((row) => row.code === code) || null;
  }

  function getSACDBByCode(db, code) {
    for (const row of (db.sacdb || [])) {
      if (row.mother === code || (row.children || []).includes(code)) return row;
    }
    return null;
  }

  function rowSource(row, fallbackSource, fallbackRef) {
    const workbookName = row?.workbook || row?.sourceWorkbook || 'All data .xlsx';
    return {
      source: row?.source || workbookName || fallbackSource,
      ref: row?.source_ref || fallbackRef,
    };
  }

  function collectSearchRows(db) {
    const rows = [];

    for (const row of (db.mpd || [])) {
      const source = rowSource(row, 'A320 MPD', `Row ${row.row}`);
      rows.push({
        kind: 'mpd',
        row,
        text: `${row.description || ''} ${row.access_notes || ''} ${row.access || ''}`.trim(),
        displayText: row.description || `${row.description || ''} ${row.access_notes || ''} ${row.access || ''}`.trim(),
        codes: splitSacCodes(row.sac),
        source: source.source,
        ref: source.ref,
      });
    }

    for (const row of (db.sheet1 || [])) {
      const source = rowSource(row, 'Sheet1', `Row ${row.row}`);
      rows.push({
        kind: 'sheet1',
        row,
        text: `${row.cri || ''} ${row.description || ''} ${row.planning_comments || ''} ${row.access_note || ''}`.trim(),
        displayText: row.description || `${row.cri || ''} ${row.description || ''}`.trim(),
        codes: splitSacCodes(row.sac_code),
        source: source.source,
        ref: source.ref,
      });
    }

    return rows.filter((entry) => entry.text && entry.codes.length);
  }

  function coverage(tokens, sourceTokens) {
    if (!tokens.length) return 0;
    let matched = 0;
    for (const token of tokens) {
      if (sourceTokens.has(token)) matched += 1;
    }
    return matched / tokens.length;
  }

  function countMatchedTokens(tokens, sourceTokens) {
    let count = 0;
    for (const token of tokens) {
      if (sourceTokens.has(token)) count += 1;
    }
    return count;
  }

  function phraseBigrams(tokens) {
    const pairs = [];
    for (let index = 0; index < tokens.length - 1; index += 1) {
      pairs.push(`${tokens[index]} ${tokens[index + 1]}`);
    }
    return pairs;
  }

  function operationPriority(opNames) {
    if (!Array.isArray(opNames) || !opNames.length) return 0;
    if (opNames.some((name) => ['remove', 'open', 'disconnect', 'access'].includes(name))) return 18;
    if (opNames.some((name) => ['install', 'close'].includes(name))) return 12;
    if (opNames.some((name) => ['inspect', 'repair', 'replace', 'safety'].includes(name))) return 8;
    return 0;
  }

  function criticalTokenStats(tokens, sourceTokens) {
    const criticalTokens = tokens.filter((token) => /^(lh|rh|fwd|aft|door|panel)$/i.test(token)
      || /^(fr\d+[a-z0-9-]*)$/i.test(token)
      || /^(fin\d+[a-z0-9-]*)$/i.test(token)
      || /^(rib\d+[a-z0-9-]*)$/i.test(token)
      || /^(\d+[a-z]{1,3})$/i.test(token)
      || /^(\d{2,4}[a-z0-9]{0,3})$/i.test(token));

    const matched = criticalTokens.filter((token) => sourceTokens.has(token));
    return {
      total: criticalTokens.length,
      matched: matched.length,
      coverage: criticalTokens.length ? matched.length / criticalTokens.length : 0
    };
  }

  function componentHits(tokens, sourceTokens) {
    return tokens.filter((token) => COMPONENT_HINTS.includes(token) && sourceTokens.has(token)).length;
  }

  function rowBroadnessPenalty(sourceText, segment, codeCount) {
    const sourceNorm = normalizeText(sourceText);
    const segmentNorm = normalizeText(segment);
    let penalty = 0;

    if (codeCount > 1) penalty += 12;
    if (BROAD_ROW_PATTERNS.some((pattern) => pattern.test(sourceNorm)) && !BROAD_ROW_PATTERNS.some((pattern) => pattern.test(segmentNorm))) {
      penalty += 14;
    }
    if (sourceNorm.includes('all ') && !segmentNorm.includes('all ')) penalty += 8;
    if (sourceNorm.includes('assembly') || sourceNorm.includes('assemblies')) penalty += 5;

    return penalty;
  }

  function scoreRowForSegment(searchRow, segment, ops, tokens, accessLike) {
    const sourceText = searchRow.text || '';
    const sourceNorm = normalizeText(sourceText);
    const sourceTokens = new Set(tokenize(sourceText));
    const matchedTokenCount = countMatchedTokens(tokens, sourceTokens);
    const tokenCoverage = coverage(tokens, sourceTokens);
    const opMatch = operationAligned(ops, sourceText);
    const accessMatch = accessLike && detectAccessLike(sourceText);
    const bigrams = phraseBigrams(tokens);
    const bigramHits = bigrams.filter((pair) => sourceNorm.includes(pair)).length;
    const exactPhrase = normalizeText(segment) && sourceNorm.includes(normalizeText(segment));
    const strongPhrase = tokens.length >= 2 && bigramHits > 0;
    const criticalStats = criticalTokenStats(tokens, sourceTokens);
    const matchedComponents = componentHits(tokens, sourceTokens);
    const broadPenalty = rowBroadnessPenalty(sourceText, segment, searchRow.codes.length);

    let score = matchedTokenCount * 12;
    if (tokenCoverage >= 0.5) score += 12;
    if (tokenCoverage >= 0.7) score += 16;
    if (tokenCoverage >= 0.85) score += 12;
    if (opMatch) score += 20 + operationPriority(ops);
    if (accessMatch) score += 14;
    if (strongPhrase) score += Math.min(20, bigramHits * 6);
    if (criticalStats.matched) score += Math.min(30, criticalStats.matched * 10);
    if (criticalStats.coverage === 1 && criticalStats.total > 0) score += 10;
    if (matchedComponents) score += Math.min(18, matchedComponents * 6);
    if (exactPhrase) score += 28;
    score -= broadPenalty;

    let matchType = 'related';
    if (opMatch && tokenCoverage === 1 && (criticalStats.total === 0 || criticalStats.coverage === 1) && broadPenalty <= 4) {
      matchType = 'exact';
    } else if ((opMatch && tokenCoverage >= 0.7) || exactPhrase || (criticalStats.coverage >= 0.75 && criticalStats.total > 0)) {
      matchType = 'strong';
    } else if (tokenCoverage < 0.34 && criticalStats.matched === 0 && !strongPhrase && matchedComponents < 1) {
      matchType = 'weak';
    }

    return {
      score,
      matchType,
      tokenCoverage,
      matchedTokenCount,
      opMatch,
      accessMatch,
      bigramHits,
      criticalHits: criticalStats.matched,
      criticalCoverage: criticalStats.coverage,
      matchedComponents,
      broadPenalty,
      sourceText
    };
  }

  function expandCandidate(searchRow, segment, ops, tokens, accessLike) {
    const scoring = scoreRowForSegment(searchRow, segment, ops, tokens, accessLike);
    if (scoring.score < 18 || scoring.matchType === 'weak') return [];

    return searchRow.codes.map((code) => ({
      code,
      source: searchRow.source,
      ref: searchRow.ref,
      source_ref: searchRow.ref,
      text: searchRow.displayText || searchRow.text,
      op: ops[0] || 'none',
      ops,
      tokens,
      score: scoring.score,
      matchType: scoring.matchType,
      tokenCoverage: scoring.tokenCoverage,
      matchedTokenCount: scoring.matchedTokenCount,
      accessMatch: scoring.accessMatch,
      opMatch: scoring.opMatch,
      bigramHits: scoring.bigramHits,
      criticalHits: scoring.criticalHits,
      criticalCoverage: scoring.criticalCoverage,
      matchedComponents: scoring.matchedComponents,
      broadPenalty: scoring.broadPenalty
    }));
  }

  function sortCandidates(left, right) {
    const typeWeight = { exact: 3, strong: 2, related: 1, weak: 0 };
    const leftWeight = typeWeight[left.matchType] || 0;
    const rightWeight = typeWeight[right.matchType] || 0;
    if (leftWeight !== rightWeight) return rightWeight - leftWeight;
    if ((right.criticalHits || 0) !== (left.criticalHits || 0)) return (right.criticalHits || 0) - (left.criticalHits || 0);
    if ((right.opMatch ? 1 : 0) !== (left.opMatch ? 1 : 0)) return (right.opMatch ? 1 : 0) - (left.opMatch ? 1 : 0);
    if ((right.accessMatch ? 1 : 0) !== (left.accessMatch ? 1 : 0)) return (right.accessMatch ? 1 : 0) - (left.accessMatch ? 1 : 0);
    if (right.score !== left.score) return right.score - left.score;
    return left.code.localeCompare(right.code);
  }

  function segmentCandidates(db, segment) {
    const ops = detectOperations(segment);
    const primaryOp = ops[0] || null;
    const tokens = signalTokens(segment);
    const accessLike = detectAccessLike(segment);
    const conditional = isConditionalSegment(segment);

    if (conditional) {
      return {
        segment,
        op: primaryOp || 'conditional',
        ops,
        tokens,
        accessLike,
        conditional: true,
        exactMatches: [],
        candidateMatches: [],
        decision: 'IGNORED_CONDITIONAL',
        reason: 'Conditional wording was detected, so this segment was not treated as confirmed work.'
      };
    }

    if (!tokens.length) {
      return {
        segment,
        op: primaryOp || 'none',
        ops,
        tokens,
        accessLike,
        conditional: false,
        exactMatches: [],
        candidateMatches: [],
        decision: 'NO_MATCH',
        reason: 'No searchable signal tokens were found in this segment.'
      };
    }

    const candidates = collectSearchRows(db)
      .flatMap((searchRow) => expandCandidate(searchRow, segment, ops, tokens, accessLike))
      .sort(sortCandidates)
      .slice(0, TOP_SEGMENT_CANDIDATES);

    const exactMatches = candidates.filter((candidate) => candidate.matchType === 'exact');
    const uniqueExactCodes = unique(exactMatches.map((candidate) => candidate.code));

    if (!candidates.length) {
      return {
        segment,
        op: primaryOp || 'none',
        ops,
        tokens,
        accessLike,
        conditional: false,
        exactMatches: [],
        candidateMatches: [],
        decision: 'NO_MATCH',
        reason: 'No workbook candidate row was found for this segment.'
      };
    }

    let decision = 'CANDIDATE';
    let reason = 'Closest workbook rows were found for review.';
    if (uniqueExactCodes.length === 1) {
      decision = 'EXACT';
      reason = `Exact workbook wording supports ${uniqueExactCodes[0]}.`;
    } else if (uniqueExactCodes.length > 1) {
      decision = 'MULTIPLE';
      reason = 'More than one exact SAC code matched this segment, so the segment needs review.';
    }

    return {
      segment,
      op: primaryOp || 'none',
      ops,
      tokens,
      accessLike,
      conditional: false,
      exactMatches,
      candidateMatches: candidates,
      decision,
      reason
    };
  }

  function aggregateRankedCandidates(segments, db) {
    const byCode = new Map();

    for (const segment of segments) {
      for (const candidate of (segment.candidateMatches || [])) {
        const current = byCode.get(candidate.code) || {
          code: candidate.code,
          score: 0,
          exact: false,
          evidenceCount: 0,
          source: null,
          matchType: candidate.matchType,
          criticalHits: 0,
          broadPenalty: 0
        };

        current.score = Math.max(current.score, candidate.score) + 1;
        current.exact = current.exact || candidate.matchType === 'exact';
        current.evidenceCount += 1;
        current.criticalHits = Math.max(current.criticalHits, candidate.criticalHits || 0);
        current.broadPenalty = Math.max(current.broadPenalty, candidate.broadPenalty || 0);

        if (!current.source || sortCandidates(candidate, current.source) < 0) {
          current.source = candidate;
          current.matchType = candidate.matchType;
        }

        byCode.set(candidate.code, current);
      }
    }

    return [...byCode.values()]
      .map((entry) => {
        const definition = getDefinitionByCode(db, entry.code);
        return {
          code: entry.code,
          definition: definition ? definition.description : '',
          exact: entry.exact,
          score: entry.score,
          evidenceCount: entry.evidenceCount,
          matchType: entry.matchType,
          criticalHits: entry.criticalHits,
          broadPenalty: entry.broadPenalty,
          source: entry.source
        };
      })
      .sort((left, right) => {
        if (left.exact !== right.exact) return left.exact ? -1 : 1;
        const typeWeight = { exact: 3, strong: 2, related: 1, weak: 0 };
        if ((typeWeight[left.matchType] || 0) !== (typeWeight[right.matchType] || 0)) {
          return (typeWeight[right.matchType] || 0) - (typeWeight[left.matchType] || 0);
        }
        if ((right.criticalHits || 0) !== (left.criticalHits || 0)) return (right.criticalHits || 0) - (left.criticalHits || 0);
        if (right.score !== left.score) return right.score - left.score;
        if ((left.broadPenalty || 0) !== (right.broadPenalty || 0)) return (left.broadPenalty || 0) - (right.broadPenalty || 0);
        return left.code.localeCompare(right.code);
      })
      .slice(0, TOP_FINAL_CANDIDATES);
  }

  function topCandidateSegment(segments, code) {
    return segments.find((segment) => (segment.candidateMatches || []).some((candidate) => candidate.code === code)) || null;
  }

  function analyzeText(db, text) {
    const segments = splitTaskCard(text).map((segment) => segmentCandidates(db, segment));
    const exactCodes = unique(segments.flatMap((segment) => (segment.exactMatches || []).map((match) => match.code)));
    const ranked = aggregateRankedCandidates(segments, db);

    let decision = 'NO_SAC';
    let best = null;
    let decisionText = 'No exact SAC match was found.';
    const topCandidate = ranked[0] || null;

    if (exactCodes.length > 1) {
      decision = 'REVIEW';
      decisionText = 'Multiple exact SAC codes were found. Manual review is required.';
    } else if (exactCodes.length === 1) {
      const code = exactCodes[0];
      const definition = getDefinitionByCode(db, code);
      const relation = getSACDBByCode(db, code);
      const sourceSegment = topCandidateSegment(segments, code);
      const sourceMatch = sourceSegment ? (sourceSegment.exactMatches.find((match) => match.code === code) || sourceSegment.candidateMatches.find((match) => match.code === code) || null) : null;
      best = {
        code,
        definition: definition ? definition.description : '',
        relation,
        sourceMatch
      };
      decision = 'MATCH';
      decisionText = `Exact SAC match found: ${code}`;
    } else if (topCandidate) {
      decision = 'REVIEW';
      decisionText = 'No exact SAC match was found. Closest workbook candidates are shown for review.';
    }

    const activeBestCode = best?.code || topCandidate?.code || null;
    const activeBestDefinition = best?.definition || (topCandidate?.definition || '');
    const activeBestRelation = best?.relation || (activeBestCode ? getSACDBByCode(db, activeBestCode) : null);

    return {
      sourceWorkbook: db?.sourceWorkbook || null,
      segments,
      final: {
        decision,
        decisionText,
        best,
        topCandidate,
        ranked,
        topCoreSegment: activeBestCode ? topCandidateSegment(segments, activeBestCode) : null,
        accessText: segments
          .filter((segment) => segment.accessLike && !segment.conditional)
          .map((segment, index) => `Access ${index + 1}: ${segment.segment}`)
          .join(' | ') || 'No clear access-only wording detected.',
        definitionText: activeBestDefinition || decisionText,
        relationText: activeBestRelation
          ? `Mother: ${activeBestRelation.mother} • Children: ${(activeBestRelation.children || []).slice(0, 6).join(', ')}`
          : 'No SACDB relation found.',
        coreHours: null,
        accessHours: null,
        combinedText: text
      }
    };
  }

  function confidenceLabel(decision) {
    if (decision === 'MATCH') return 'Exact';
    if (decision === 'REVIEW') return 'Review';
    return 'Low';
  }

  function confidenceClass(decision) {
    if (decision === 'MATCH') return 'pill-high';
    if (decision === 'REVIEW') return 'pill-medium';
    return 'pill-low';
  }

  return {
    normalizeText,
    tokenize,
    splitTaskCard,
    detectOperation,
    detectOperations,
    detectAccessLike,
    isConditionalSegment,
    getDefinitionByCode,
    getSACDBByCode,
    splitSacCodes,
    analyzeText,
    confidenceLabel,
    confidenceClass
  };
});
