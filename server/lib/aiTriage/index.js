// AI triage provider selection.
//
// Phase 6 uses the local simulated provider ONLY. No external AI service,
// SDK, API key or network request is involved, so there is no usage cost.
// A genuine provider could be added in a future version as another module
// exposing the same functions, but none is implemented here.

const simulatedProvider = require('./simulatedProvider');

module.exports = simulatedProvider;
