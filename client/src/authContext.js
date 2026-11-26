// Shared authentication state for the frontend (Phase 7).
//
// Permission names come from the backend (server/lib/permissions.js) via
// /api/auth/me. The frontend only uses them to show or hide navigation and
// actions; the backend enforces every permission independently.

import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }

  return value;
}

export const ROLE_LABELS = {
  doctor: 'Doctor',
  nurse: 'Nurse',
  management: 'Hospital management',
  admin: 'System administrator',
};
