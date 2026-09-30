import { AuthProvider, useAuth } from './auth/auth-context';
import { AppShell } from './components/app-shell';
import { LoginScreen } from './components/login-screen';

export function App() {
  return <AuthProvider><AppContent /></AuthProvider>;
}

function AppContent() {
  const { status, error, retry } = useAuth();
  if (status === 'checking') return <LoadingScreen />;
  if (status === 'unauthenticated' || status === 'error') {
    return <LoginScreen error={status === 'error' ? error : undefined} onRetry={retry} />;
  }
  return <AppShell />;
}

function LoadingScreen() {
  return <main className="grid min-h-screen place-items-center bg-white px-6 text-ink"><div className="flex items-center gap-3 text-sm text-muted" role="status"><span className="loading-dot" aria-hidden="true" />Checking your session</div></main>;
}
