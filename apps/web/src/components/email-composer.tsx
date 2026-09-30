import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ApiError, createEmailBatch } from '../api/client';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_DELAY = 0;
const DEFAULT_LIMIT = 50;

type ComposerProps = { sender?: string | null; onClose: () => void; onScheduled: () => void };

export function EmailComposer({ sender, onClose, onScheduled }: ComposerProps) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientDraft, setRecipientDraft] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delay, setDelay] = useState(String(DEFAULT_DELAY));
  const [hourlyLimit, setHourlyLimit] = useState(String(DEFAULT_LIMIT));
  const [scheduledAt, setScheduledAt] = useState('');
  const [isSendLaterOpen, setIsSendLaterOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recipientInputRef = useRef<HTMLInputElement>(null);

  const addRecipients = (value: string) => {
    const candidates = value.split(/[\s,;]+/).map((candidate) => candidate.trim().toLowerCase()).filter(Boolean);
    const invalid = candidates.find((candidate) => !emailPattern.test(candidate));
    if (invalid) { setError(`“${invalid}” is not a valid email address.`); return; }
    setRecipients((current) => [...new Set([...current, ...candidates])]);
    setRecipientDraft(''); setError(null);
  };
  const onRecipientKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); if (recipientDraft.trim()) addRecipients(recipientDraft); }
    if (event.key === 'Backspace' && !recipientDraft && recipients.length) setRecipients((current) => current.slice(0, -1));
  };
  const selectFiles = (selected: FileList | null) => {
    if (!selected) return;
    setFiles((current) => [...current, ...Array.from(selected).filter((file) => !current.some((item) => item.name === file.name && item.size === file.size))]);
  };
  const submit = async (mode: 'now' | 'later') => {
    setError(null); setSuccess(null);
    const draftRecipients = recipientDraft.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);
    const invalidRecipient = draftRecipients.find((candidate) => !emailPattern.test(candidate));
    if (invalidRecipient) { setError(`“${invalidRecipient}” is not a valid email address.`); return; }
    const finalRecipients = [...new Set([...recipients, ...draftRecipients])];
    if (!finalRecipients.length) { setError('Add at least one recipient.'); return; }
    if (!subject.trim()) { setError('Add a subject before scheduling.'); return; }
    if (!body.trim()) { setError('Write an email message before scheduling.'); return; }
    const delayValue = Number(delay);
    const limitValue = Number(hourlyLimit);
    if (!Number.isInteger(delayValue) || delayValue < 0) { setError('Delay must be a non-negative whole number of milliseconds.'); return; }
    if (!Number.isInteger(limitValue) || limitValue < 1) { setError('Hourly limit must be a positive whole number.'); return; }
    const scheduledDate = mode === 'now' ? new Date(Date.now() + 60_000) : new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) { setError('Choose a future date and time.'); return; }
    setIsSubmitting(true);
    try {
      const result = await createEmailBatch({ recipients: finalRecipients, subject: subject.trim(), body, scheduledAt: scheduledDate.toISOString(), delayBetweenEmails: delayValue, hourlyLimit: limitValue });
      setRecipients([]); setRecipientDraft(''); setSubject(''); setBody(''); setFiles([]); setScheduledAt(''); setIsSendLaterOpen(false);
      setSuccess(`${result.jobsQueued} email${result.jobsQueued === 1 ? '' : 's'} queued for delivery.`);
      onScheduled();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Unable to schedule this email.');
    } finally { setIsSubmitting(false); }
  };
  const onSubmit = (event: FormEvent) => { event.preventDefault(); void submit(scheduledAt ? 'later' : 'now'); };
  const setPreset = (hour?: number) => { const date = new Date(); date.setDate(date.getDate() + 1); if (hour === undefined) date.setHours(9, 0, 0, 0); else date.setHours(hour, 0, 0, 0); setScheduledAt(toLocalInputValue(date)); setIsSendLaterOpen(false); };

  return (
    <section className="composer-page" aria-labelledby="composer-title">
      <header className="composer-header"><button className="back-button" type="button" onClick={onClose}>Back</button><h1 id="composer-title">Compose New Email</h1><div className="composer-actions"><label className="attach-trigger">Attach files<input ref={fileInputRef} type="file" multiple onChange={(event) => selectFiles(event.target.files)} /></label><button className="outline-button" type="button" onClick={() => setIsSendLaterOpen((open) => !open)}>Send later</button><button className="send-button" type="submit" form="email-composer" disabled={isSubmitting}>{isSubmitting ? 'Scheduling...' : scheduledAt ? 'Schedule' : 'Send now'}</button></div></header>
      <form id="email-composer" className="composer-form" onSubmit={onSubmit}>
        {error ? <p className="form-message error" role="alert">{error}</p> : null}{success ? <p className="form-message success" role="status">{success}</p> : null}
        <div className="form-row"><span className="form-label">From</span><span className="sender-address">{sender || 'Your signed-in email'}</span></div>
        <div className="form-row"><label htmlFor="recipient-draft">To</label><div className="recipient-box" onClick={() => recipientInputRef.current?.focus()}>{recipients.map((recipient) => <span className="recipient-chip" key={recipient}>{recipient}<button type="button" onClick={() => setRecipients((current) => current.filter((value) => value !== recipient))} aria-label={`Remove ${recipient}`}>x</button></span>)}<input ref={recipientInputRef} id="recipient-draft" value={recipientDraft} onChange={(event) => setRecipientDraft(event.target.value)} onBlur={() => recipientDraft.trim() && addRecipients(recipientDraft)} onKeyDown={onRecipientKeyDown} placeholder={recipients.length ? '' : 'recipient@example.com'} /></div></div>
        <div className="form-row"><label htmlFor="subject">Subject</label><input id="subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" /></div>
        <div className="compose-settings"><label>Delay between 2 emails<input type="number" min="0" step="1" value={delay} onChange={(event) => setDelay(event.target.value)} /><span>ms</span></label><label>Hourly limit<input type="number" min="1" step="1" value={hourlyLimit} onChange={(event) => setHourlyLimit(event.target.value)} /></label></div>
        {files.length ? <div className="attachment-list"><strong>Selected attachments</strong>{files.map((file) => <div className="attachment-item" key={`${file.name}-${file.size}`}><span>{file.name} ({formatBytes(file.size)})</span><button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))}>Remove</button></div>)}<p>Attachments are not sent yet because this API has no upload contract.</p></div> : null}
        <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Type your reply..." aria-label="Email body" />
        <footer className="composer-footer"><span>Attachments are kept in this browser until removed; they are not included in the API request.</span><button className="send-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Scheduling...' : scheduledAt ? 'Schedule email' : 'Send now'}</button></footer>
      </form>
      {isSendLaterOpen ? <aside className="send-later-panel"><h2>Send Later</h2><label>Pick date & time<input type="datetime-local" value={scheduledAt} min={toLocalInputValue(new Date(Date.now() + 60_000))} onChange={(event) => setScheduledAt(event.target.value)} /></label><button type="button" onClick={() => setPreset()}>Tomorrow</button><button type="button" onClick={() => setPreset(10)}>Tomorrow, 10:00 AM</button><button type="button" onClick={() => setPreset(15)}>Tomorrow, 3:00 PM</button><div><button type="button" className="plain-button" onClick={() => setIsSendLaterOpen(false)}>Cancel</button><button type="button" className="outline-button" onClick={() => setIsSendLaterOpen(false)} disabled={!scheduledAt}>Done</button></div></aside> : null}
    </section>
  );
}

function toLocalInputValue(date: Date): string { const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function formatBytes(bytes: number): string { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
