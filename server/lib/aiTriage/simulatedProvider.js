// Simulated AI triage provider (Phase 6).
//
// This is NOT artificial intelligence and does NOT analyse patient data.
// It returns predefined, fictional demonstration responses for a scenario
// chosen explicitly by staff. It never reads clinical values, contains no
// clinical thresholds, and makes no network requests of any kind.

const PROVIDER_NAME = 'simulated';

const DISCLAIMER =
  'Simulated AI demonstration — not genuine AI analysis and not validated ' +
  'for clinical use. Never use its output to make real patient-care decisions.';

const NOT_DERIVED_NOTE =
  'Predefined fictional demonstration response — not derived from this ' +
  "patient's information.";

// Fixed demonstration scenarios. The wording is intentionally general:
// no symptoms, measurements, thresholds, diagnoses or treatments.
const SCENARIOS = [
  {
    key: 'demo_a',
    label: 'Demo A — fictional example shown as Critical',
    canSuggest: true,
    suggestedPriority: 'critical',
    explanation:
      'In fictional demonstration scenario A, the example patient is ' +
      'described as needing immediate attention, so this demonstration ' +
      'displays the Critical category.',
    considered: [
      'Fictional scenario A description (demonstration text only)',
    ],
    missingInformation: [
      'Demonstration example: a genuine system would list here any ' +
        'information it could not find.',
    ],
  },
  {
    key: 'demo_b',
    label: 'Demo B — fictional example shown as High',
    canSuggest: true,
    suggestedPriority: 'high',
    explanation:
      'In fictional demonstration scenario B, the example patient is ' +
      'described as needing prompt attention, so this demonstration ' +
      'displays the High category.',
    considered: [
      'Fictional scenario B description (demonstration text only)',
    ],
    missingInformation: [],
  },
  {
    key: 'demo_c',
    label: 'Demo C — fictional example shown as Medium',
    canSuggest: true,
    suggestedPriority: 'medium',
    explanation:
      'In fictional demonstration scenario C, the example patient is ' +
      'described as stable but needing assessment, so this demonstration ' +
      'displays the Medium category.',
    considered: [
      'Fictional scenario C description (demonstration text only)',
    ],
    missingInformation: [],
  },
  {
    key: 'demo_d',
    label: 'Demo D — fictional example shown as Low',
    canSuggest: true,
    suggestedPriority: 'low',
    explanation:
      'In fictional demonstration scenario D, the example patient is ' +
      'described as having a minor concern, so this demonstration ' +
      'displays the Low category.',
    considered: [
      'Fictional scenario D description (demonstration text only)',
    ],
    missingInformation: [],
  },
  {
    key: 'demo_e',
    label: 'Demo E — fictional example with insufficient information',
    canSuggest: false,
    suggestedPriority: null,
    explanation:
      'In fictional demonstration scenario E, the example information is ' +
      'incomplete, so this demonstration shows how a system should decline ' +
      'to suggest a priority rather than guess.',
    considered: [
      'Fictional scenario E description (demonstration text only)',
    ],
    missingInformation: [
      'Demonstration example: key information is described as unavailable ' +
        'in this fictional scenario.',
    ],
  },
];

// Assessment form fields that may be reported as left blank. Only the
// field NAMES are ever received; clinical values are never sent here.
const FORM_FIELDS = {
  chiefComplaint: 'Chief complaint',
  symptoms: 'Symptoms',
  temperatureC: 'Temperature',
  heartRateBpm: 'Heart rate',
  systolicBp: 'Systolic blood pressure',
  diastolicBp: 'Diastolic blood pressure',
  respiratoryRate: 'Respiratory rate',
  oxygenSaturation: 'Oxygen saturation',
  clinicalNotes: 'Clinical notes',
};

function listScenarios() {
  return SCENARIOS.map(({ key, label }) => ({ key, label }));
}

function isKnownScenario(key) {
  return SCENARIOS.some((scenario) => scenario.key === key);
}

function isKnownFormField(field) {
  return Object.prototype.hasOwnProperty.call(FORM_FIELDS, field);
}

// Return the predefined response for a staff-selected scenario.
// Synchronous and local: no I/O, no network, no randomness.
function getSuggestion({ scenarioKey, blankFields = [] }) {
  const scenario = SCENARIOS.find((item) => item.key === scenarioKey);

  if (!scenario) {
    throw new Error(`Unknown demonstration scenario: ${scenarioKey}`);
  }

  return {
    provider: PROVIDER_NAME,
    simulated: true,
    scenarioKey: scenario.key,
    canSuggest: scenario.canSuggest,
    suggestedPriority: scenario.suggestedPriority,
    explanation: `${NOT_DERIVED_NOTE} ${scenario.explanation}`,
    considered: [...scenario.considered],
    missingInformation: [...scenario.missingInformation],
    // Simple field-completeness check, not clinical reasoning.
    blankFields: blankFields.map((field) => FORM_FIELDS[field]),
  };
}

module.exports = {
  DISCLAIMER,
  PROVIDER_NAME,
  getSuggestion,
  isKnownFormField,
  isKnownScenario,
  listScenarios,
};
