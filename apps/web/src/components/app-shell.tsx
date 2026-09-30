import { useCallback, useEffect, useState } from 'react';
import { ApiError, getEmailCounts, type EmailCounts } from '../api/client';
import { useAuth } from '../auth/auth-context';
import { EmailComposer } from './email-composer';
import { EmailList } from './email-list';
import { SearchView } from './search-view';
import { SlackPanel } from './slack-panel';

type Route = '/' | '/scheduled' | '/sent' | '/search';
export function AppShell() {
  const [path, setPath] = useState<Route>(normalisePath(window.location.pathname));
  const { user, signOut, isSigningOut, error } = useAuth();
  const [counts, setCounts] = useState<EmailCounts | null>(null);
  const [countsError, setCountsError] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  useEffect(() => {
    const onPopState = () => setPath(normalisePath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const refreshCounts = useCallback(() => {
    void getEmailCounts().then((value) => { setCounts(value); setCountsError(null); }).catch((reason: unknown) => setCountsError(reason instanceof ApiError ? reason.message : 'Unable to load email counts.'));
  }, []);
  useEffect(() => { refreshCounts(); }, []);
  const navigate = (nextPath: Route) => { window.history.pushState({}, '', nextPath); setPath(nextPath); };
  const displayName = user?.name || user?.email || 'Account';
  if (isComposerOpen) return <EmailComposer sender={user?.email} onClose={() => setIsComposerOpen(false)} onScheduled={refreshCounts} />;
  return (
    <main className="app-frame">
      <aside className="sidebar">
        <button className="brand-button" type="button" onClick={() => navigate('/')} aria-label="Go to overview">ONE</button>
        <div className="account-panel">
          <Avatar name={displayName} imageUrl={user?.avatarUrl} />
          <div className="account-text"><strong>{displayName}</strong><span>{user?.email}</span></div>
          <button className="icon-button" type="button" onClick={() => void signOut()} disabled={isSigningOut}>{isSigningOut ? 'Signing out...' : 'Log out'}</button>
        </div>
        <button className="sidebar-compose" type="button" onClick={() => setIsComposerOpen(true)}>Compose</button>
        <p className="sidebar-label">CORE</p>
        <nav className="nav-list" aria-label="Main navigation">
          <NavItem active={path === '/scheduled'} label="Scheduled" count={counts?.scheduled} onClick={() => navigate('/scheduled')} />
          <NavItem active={path === '/sent'} label="Sent" count={counts?.sent} onClick={() => navigate('/sent')} />
          <NavItem active={path === '/search'} label="Search" onClick={() => navigate('/search')} />
        </nav>
      </aside>
      <section className="content-area">
        <header className="topbar"><button className="header-search" type="button" onClick={() => navigate('/search')} aria-label="Search emails">Search</button></header>
        {error || countsError ? <p className="shell-error" role="alert">{error || countsError}</p> : null}
        {path === '/scheduled' ? <EmailList kind="scheduled" onRefreshCounts={refreshCounts} /> : path === '/sent' ? <EmailList kind="sent" onRefreshCounts={refreshCounts} /> : path === '/search' ? <SearchView /> : <section className="overview-content"><section className="foundation-panel" aria-label="Page foundation"><p>Compose an email, then track its scheduled or sent status from the sidebar.</p><button className="send-button" type="button" onClick={() => setIsComposerOpen(true)}>Compose email</button></section><SlackPanel /></section>}
      </section>
    </main>
  );
}

function NavItem({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return <button className={`nav-item${active ? ' active' : ''}`} type="button" onClick={onClick}><span>{label}</span>{count === undefined ? null : <small>{count}</small>}</button>;
}

function Avatar({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  if (imageUrl) return <img className="avatar" src={imageUrl} alt="" referrerPolicy="no-referrer" />;
  return <span className="avatar avatar-fallback" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
}

function normalisePath(path: string): Route {
  if (path === '/scheduled' || path === '/sent' || path === '/search') return path;
  return '/';
}
