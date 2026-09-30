import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, getCurrentUser, logout, type AuthUser } from '../api/client';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'error';
type AuthContextValue = { status: AuthStatus; user: AuthUser | null; error: string | null; retry: () => void; signOut: () => Promise<void>; isSigningOut: boolean };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isSigningOut, setIsSigningOut] = useState(false);
  useEffect(() => {
    let active = true;
    setStatus('checking'); setError(null);
    void getCurrentUser().then((currentUser) => {
      if (!active) return;
      setUser(currentUser); setStatus(currentUser ? 'authenticated' : 'unauthenticated');
    }).catch((reason: unknown) => {
      if (!active) return;
      setUser(null); setStatus('error'); setError(reason instanceof ApiError ? reason.message : 'Unable to check your session.');
    });
    return () => { active = false; };
  }, [refreshVersion]);
  const retry = useCallback(() => setRefreshVersion((version) => version + 1), []);
  const signOut = useCallback(async () => {
    setIsSigningOut(true);
    try { await logout(); setUser(null); setStatus('unauthenticated'); window.history.replaceState({}, '', '/login'); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Unable to sign out.'); }
    finally { setIsSigningOut(false); }
  }, []);
  const value = useMemo(() => ({ status, user, error, retry, signOut, isSigningOut }), [status, user, error, retry, signOut, isSigningOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
