import { useEffect, useState } from 'react';
import { ApiError, disconnectSlack, getSlackStatus, slackConnectUrl, type SlackStatus } from '../api/client';

export function SlackPanel() {
  const [status, setStatus] = useState<SlackStatus | null>(null); const [error, setError] = useState<string | null>(null); const [disconnecting, setDisconnecting] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => { const controller = new AbortController(); setError(null); void getSlackStatus(controller.signal).then(setStatus).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof ApiError ? reason.message : 'Unable to load Slack status.'); }); return () => controller.abort(); }, [revision]);
  const disconnect = async () => { setDisconnecting(true); setError(null); try { await disconnectSlack(); setRevision((value) => value + 1); } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Unable to disconnect Slack.'); } finally { setDisconnecting(false); } };
  return <section className="slack-panel"><div><p className="eyebrow">INTEGRATIONS</p><h2>Slack</h2><p>{status?.connected ? `Connected to ${status.teamName || status.teamId} · ${status.channelName || 'App Home'}` : 'Connect Slack to receive hourly-limit notifications.'}</p></div>{error ? <p className="slack-error" role="alert">{error}</p> : null}{status === null ? <span className="slack-loading">Checking...</span> : status.connected ? <button className="outline-button" type="button" onClick={() => void disconnect()} disabled={disconnecting}>{disconnecting ? 'Disconnecting...' : 'Disconnect Slack'}</button> : <button className="send-button" type="button" onClick={() => window.location.assign(slackConnectUrl())}>Connect Slack</button>}</section>;
}
