import { useEffect, useState } from 'react';
import { ApiError, getEmailDetail, getEmails, type EmailDetail, type EmailListItem } from '../api/client';

export function EmailList({ kind, onRefreshCounts }: { kind: 'scheduled' | 'sent'; onRefreshCounts: () => void }) {
  const [items, setItems] = useState<EmailListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void getEmails(kind, page, controller.signal).then((response) => {
      setItems(response.data); setTotal(response.pagination.total); onRefreshCounts();
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof ApiError ? reason.message : 'Unable to load emails.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, page, revision, onRefreshCounts]);
  const title = kind === 'scheduled' ? 'Scheduled emails' : 'Sent emails';
  if (selected) return <EmailDetailView id={selected} onClose={() => setSelected(null)} />;
  return <section className="mail-view"><header className="mail-toolbar"><div><h2>{title}</h2><p>{total} total</p></div><button className="outline-button" type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading}>Refresh</button></header>{loading ? <LoadingRows /> : error ? <StateMessage kind="error" message={error} action={() => setRevision((value) => value + 1)} /> : items.length === 0 ? <StateMessage kind="empty" message={`No ${kind} emails yet.`} /> : <><div className="mail-table">{items.map((item) => <button className="mail-row" key={item.id} type="button" onClick={() => setSelected(item.id)}><span className="recipient">To: {item.recipient}</span><StatusBadge status={item.status} time={kind === 'sent' ? item.sentAt : item.plannedSendAt} /><strong>{item.subject}</strong><span className="preview">{item.preview}</span></button>)}</div><Pagination page={page} total={total} onPageChange={setPage} /></>}</section>;
}

export function StatusBadge({ status, time }: { status: string; time: string | null }) {
  const isScheduled = status === 'SCHEDULED' || status === 'PROCESSING';
  return <span className={`status-badge ${isScheduled ? 'scheduled' : 'sent'}`}>{isScheduled ? formatSchedule(time) : status === 'SENT' ? 'Sent' : statusLabel(status)}</span>;
}

export function Pagination({ page, total, onPageChange, pageSize = 20 }: { page: number; total: number; onPageChange: (page: number) => void; pageSize?: number }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return <nav className="pagination" aria-label="Email pages"><button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1}>Previous</button><span>Page {page} of {totalPages}</span><button type="button" onClick={() => onPageChange(page + 1)} disabled={page === totalPages}>Next</button></nav>;
}

export function StateMessage({ kind, message, action }: { kind: 'error' | 'empty'; message: string; action?: () => void }) {
  return <div className={`data-state ${kind}`}><p>{message}</p>{action ? <button className="outline-button" type="button" onClick={action}>Try again</button> : null}</div>;
}

function LoadingRows() { return <div className="loading-rows" role="status"><span /><span /><span /></div>; }

function EmailDetailView({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const controller = new AbortController(); void getEmailDetail(id, controller.signal).then(setDetail).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof ApiError ? reason.message : 'Unable to load email details.'); }); return () => controller.abort(); }, [id]);
  if (error) return <StateMessage kind="error" message={error} action={onClose} />;
  if (!detail) return <LoadingRows />;
  return <article className="email-detail"><button className="back-button" type="button" onClick={onClose}>Back to emails</button><div className="detail-head"><StatusBadge status={detail.status} time={detail.sentAt ?? detail.plannedSendAt} /><h2>{detail.subject}</h2><p>From {detail.sender} to {detail.recipient}</p></div><dl><div><dt>Planned</dt><dd>{formatDate(detail.plannedSendAt)}</dd></div>{detail.sentAt ? <div><dt>Sent</dt><dd>{formatDate(detail.sentAt)}</dd></div> : null}<div><dt>Batch</dt><dd>{detail.batch.id}</dd></div></dl><div className="email-body">{detail.body}</div>{detail.attachments.length ? <div className="detail-attachments"><strong>Attachments</strong>{detail.attachments.map((attachment) => <span key={attachment.id}>{attachment.filename}</span>)}</div> : null}</article>;
}

function formatSchedule(value: string | null): string { return value ? new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : 'Scheduled'; }
function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function statusLabel(status: string): string { return status.charAt(0) + status.slice(1).toLowerCase(); }
