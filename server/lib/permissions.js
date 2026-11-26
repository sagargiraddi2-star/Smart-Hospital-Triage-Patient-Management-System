// Central role-permission configuration (Phase 7).
//
// This is the ONLY place where roles are mapped to permissions. The backend
// enforces these permissions on every protected endpoint, and /api/auth/me
// sends the current user's list to the frontend, which uses the same names
// to show or hide navigation and actions. To change what a role may do,
// edit this file.

const ROLES = ['doctor', 'nurse', 'management', 'admin'];

const CLINICAL = ['doctor', 'nurse', 'admin'];
const OPERATIONAL = ['doctor', 'nurse', 'management', 'admin'];
const MANAGEMENT = ['management', 'admin'];
const ADMIN = ['admin'];

const PERMISSIONS = {
  // Dashboard and operational overview
  'dashboard.view': OPERATIONAL,

  // Patient registration data (demographics, contact details, visit status).
  // Deliberately separate from clinical information.
  'patients.view': OPERATIONAL,
  'patients.register': OPERATIONAL,

  // Clinical information: chief complaint, symptoms, vital signs, clinical
  // notes, assessment history, AI suggestions, reassessment decision reasons.
  'clinical.view': CLINICAL,
  'clinical.assess': CLINICAL,

  // Queues and Visit History
  'queues.view': OPERATIONAL,
  'queues.manage': CLINICAL, // priority, reordering, start/complete consultation

  // Reassessment alerts and settings
  'reassessments.view': OPERATIONAL,
  'reassessments.decide': CLINICAL, // "Not required" and "Remind later"
  'reassessments.settings.view': OPERATIONAL,
  'reassessments.settings.edit': MANAGEMENT,

  // Departments
  'departments.view': OPERATIONAL,
  'departments.manage': MANAGEMENT,

  // Simulated AI triage demonstration
  'ai.use': CLINICAL,

  // User management (approvals, roles, enable/disable)
  'users.manage': ADMIN,
};

function permissionsForRole(role) {
  return Object.keys(PERMISSIONS).filter((permission) =>
    PERMISSIONS[permission].includes(role)
  );
}

function roleHasPermission(role, permission) {
  const allowed = PERMISSIONS[permission];

  if (!allowed) {
    // A typo in a permission name must fail closed, never open.
    throw new Error(`Unknown permission: ${permission}`);
  }

  return allowed.includes(role);
}

module.exports = {
  PERMISSIONS,
  ROLES,
  permissionsForRole,
  roleHasPermission,
};
