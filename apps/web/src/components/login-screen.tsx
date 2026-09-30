import { googleLoginUrl } from '../api/client';

export function LoginScreen({ error, onRetry }: { error?: string | null; onRetry: () => void }) {
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="wordmark" aria-label="ONE">ONE</div><p className="eyebrow">EMAIL, ON YOUR TIME</p>
        <h1 id="login-title">Welcome back</h1><p className="login-copy">Sign in to manage your scheduled email delivery.</p>
        {error ? <div className="auth-error" role="alert"><span>{error}</span><button className="text-action" type="button" onClick={onRetry}>Retry</button></div> : null}
        <button className="google-button" type="button" onClick={() => window.location.assign(googleLoginUrl())}><span className="google-mark" aria-hidden="true">G</span>Continue with Google</button>
        <p className="login-note">Google is the only available sign-in method.</p>
      </section>
    </main>
  );
}
