import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './authContext.js';

const ME_URL = '/api/auth/me';

// Loads the signed-in user and their permissions once, and again whenever
// refresh() is called (after login) or signOut() clears it (after logout).
function AuthProvider({ children }) {
  const [state, setState] = useState({
    status: 'loading', // 'loading' | 'signed-in' | 'signed-out' | 'error'
    user: null,
    permissions: [],
  });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(ME_URL, { credentials: 'include' });

      if (response.status === 401) {
        setState({ status: 'signed-out', user: null, permissions: [] });
        return null;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Could not check your sign-in.');
      }

      setState({
        status: 'signed-in',
        user: data.user,
        permissions: data.permissions || [],
      });

      return data.user;
    } catch {
      setState({ status: 'error', user: null, permissions: [] });
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch(ME_URL, { credentials: 'include' })
      .then(async (response) => {
        if (cancelled) return;

        if (response.status === 401) {
          setState({ status: 'signed-out', user: null, permissions: [] });
          return;
        }

        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        setState({
          status: 'signed-in',
          user: data.user,
          permissions: data.permissions || [],
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', user: null, permissions: [] });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(() => {
    setState({ status: 'signed-out', user: null, permissions: [] });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      can: (permission) => state.permissions.includes(permission),
      refresh,
      signOut,
    }),
    [state, refresh, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
