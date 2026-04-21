function isSetupSegment(text) {
  const raw = String(text || '');
  const norm = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!norm) return false;

  return [
    /^b\.? preparation$/i,
    /^\(?\d+\)?\s*subtask .*job set-up$/i,
    /\bjob set-up\b/i,
    /\bmake sure that the aircraft is electrically grounded\b/i,
    /\brefer to amm task\b/i,
    /\bamm task\s*\d{2}-\d{2}-\d{2}-\d{3}-\d{3}\b/i,
    /\bwarning\b/i,
    /\bcaution\b/i,
    /\bstandard practices\b/i,
    /\bgeneral information\b/i,
    /\bpreparation\b/i
  ].some((pattern) => pattern.test(norm));
}

if (window.SACEngine && typeof window.SACEngine.analyzeText === 'function') {
  const originalAnalyzeText = window.SACEngine.analyzeText;

  window.SACEngine.analyzeText = function patchedAnalyzeText(db, text) {
    const cleanedText = String(text || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !isSetupSegment(line))
      .join('\n');

    const result = originalAnalyzeText(db, cleanedText);

    if (result && Array.isArray(result.segments)) {
      result.segments = result.segments.filter((segment) => !isSetupSegment(segment.segment));
    }

    return result;
  };
}
