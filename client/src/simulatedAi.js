// Shared helpers for the simulated AI triage demonstration (Phase 6).
// No external AI service is involved anywhere in this feature.

export const SIMULATED_AI_DISCLAIMER =
  'Simulated AI demonstration — not genuine AI analysis and not validated ' +
  'for clinical use. Never use its output to make real patient-care decisions.';

export const EMPTY_AI_STATE = {
  suggestion: null,
  decision: null, // null | 'accepted' | 'overridden'
  overrideReason: '',
};

export function formatPriorityLabel(priority) {
  if (!priority) return 'No suggestion';
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

// The decision recorded on save follows the final staff priority:
// the suggested priority means "accepted", anything else "overridden".
export function getFinalDecision(ai, triagePriority) {
  if (!ai.suggestion || !ai.decision) return null;

  return triagePriority === ai.suggestion.suggested_priority
    ? 'accepted'
    : 'overridden';
}
