function getCurrentTaskTextForDecision() {
  return [
    String(($('description')?.value) || '').trim(),
    String(($('planning')?.value) || '').trim(),
    String(($('taskCard')?.value) || '').trim()
  ].filter(Boolean).join('\n').toLowerCase();
}

function isDeterministicElevatorCase(text, code) {
  const raw = String(text || '').toLowerCase();
  const sac = String(code || '').toUpperCase();
  const hasElevator = /\belevator\b|\belevators\b/.test(raw);
  const hasRemoveInstallOrInspect = /\brem\s*\/\s*ins\b|\bremove\b|\binstall\b|\binspect\b|\binspection\b/.test(raw);
  return hasElevator && hasRemoveInstallOrInspect && /ELEVATORS/.test(sac);
}

function buildRecommendationFromCode(item, taskText) {
  if (!item?.code) return null;
  const deterministic = isDeterministicElevatorCase(taskText, item.code);
  const evidence = item.evidence_ref ? `Evidence: ${item.evidence_ref}.` : '';
  if (deterministic) {
    return {
      text: `SAC: ${item.code}\nConfirmed from the strongest workbook candidate for the elevator task. ${evidence}`.trim(),
      status: 'MATCH',
      confidence: 'high'
    };
  }
  return {
    text: `Best supported SAC: ${item.code}\nReview is still recommended. ${evidence}`.trim(),
    status: 'REVIEW',
    confidence: 'medium'
  };
}

const __originalRenderAiResult = typeof renderAiResult === 'function' ? renderAiResult : null;

renderAiResult = function renderAiResultOverride(data) {
  const taskText = getCurrentTaskTextForDecision();
  const firstCode = Array.isArray(data?.codes) && data.codes.length ? data.codes[0] : null;
  const forced = buildRecommendationFromCode(firstCode, taskText);

  if (forced) {
    const patched = {
      ...data,
      status: forced.status,
      confidence: forced.confidence,
      recommendation: forced.text,
      answer: forced.text,
      why: Array.isArray(data?.why) ? [...data.why] : [],
      checks: Array.isArray(data?.checks) ? [...data.checks] : []
    };

    if (forced.status === 'MATCH') {
      patched.why.unshift('The task clearly states elevator work with rem/ins or inspection wording, and the strongest workbook candidate is the elevator SAC.');
      patched.checks.unshift('Deterministic elevator rule promoted the strongest workbook candidate to the displayed SAC result.');
    } else {
      patched.why.unshift('The first candidate bundle SAC is shown directly in Recommendation so the chosen code is visible.');
    }

    return __originalRenderAiResult ? __originalRenderAiResult(patched) : null;
  }

  return __originalRenderAiResult ? __originalRenderAiResult(data) : null;
};
