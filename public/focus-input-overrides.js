function buildFocusedTaskText() {
  const description = String(($('description')?.value) || '').trim();
  const planning = String(($('planning')?.value) || '').trim();
  const taskCardRaw = String(($('taskCard')?.value) || '').trim();

  const descriptionTokens = new Set(
    (description + ' ' + planning)
      .toLowerCase()
      .replace(/[^a-z0-9\s/_-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => token.length > 2)
  );

  const strongKeepPatterns = [
    /\bih-a320fam\b/i,
    /\bl-\d+-a320fam\b/i,
    /\bconf\d+\b/i,
    /\bjic\b/i,
    /\binsp\b/i,
    /\binspection\b/i,
    /\brem\s*\/\s*ins\b/i,
    /\bremove\b/i,
    /\binstall\b/i,
    /\belevator\b/i,
    /\bstabilizer\b/i,
    /\bfitting\b/i,
    /\bfittings\b/i
  ];

  const dropPatterns = [
    /^accomplished by$/i,
    /^form tc-001 rev\./i,
    /^b\.? preparation$/i,
    /^\(?\d+\)?\s*subtask/i,
    /^\(?[a-z]\)?\s*make sure that the aircraft is electrically grounded/i,
    /\bif corrosion findings/i,
    /\bcontact engineering management/i,
    /\brefer to amm task/i,
    /\bamm task\s*\d{2}-\d{2}-\d{2}-\d{3}-\d{3}/i,
    /\bactions:\b/i,
    /\bguidelines\b/i,
    /\bsrm\s*\d{2}-\d{2}-\d{2}/i,
    /\bjob set-up\b/i,
    /\bwarning\b/i,
    /\bcaution\b/i
  ];

  const taskCardLines = taskCardRaw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !dropPatterns.some((pattern) => pattern.test(line)))
    .filter((line) => {
      if (strongKeepPatterns.some((pattern) => pattern.test(line))) return true;
      const lineTokens = line
        .toLowerCase()
        .replace(/[^a-z0-9\s/_-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .filter((token) => token.length > 2);
      const shared = lineTokens.filter((token) => descriptionTokens.has(token));
      return shared.length >= 2;
    });

  const parts = [description, planning, ...taskCardLines].filter(Boolean);
  return parts.join('\n');
}

combinedInput = function combinedInputOverride() {
  const text = buildFocusedTaskText();
  if ($('combinedPreview')) {
    $('combinedPreview').textContent = text || 'No input yet.';
  }
  return text;
};
