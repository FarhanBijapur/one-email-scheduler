const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
export const apiBaseUrl = (configuredApiUrl || 'http://localhost:3001').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export type AuthUser = { id: string; name: string | null; email: string; avatarUrl: string | null };
type AuthMeResponse = { user: AuthUser };
export type EmailCounts = { scheduled: number; sent: number };
export type CreateEmailBatchRequest = {
  recipients: string[];
  subject: string;
  body: string;
  scheduledAt: string;
  delayBetweenEmails: number;
  hourlyLimit: number;
};
export type CreateEmailBatchResponse = { data: { id: string }; jobsQueued: number };
export type EmailStatus = 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';
export type EmailListItem = { id: string; recipient: string; subject: string; preview: string; status: EmailStatus; batchId: string; plannedSendAt: string; sentAt: string | null; createdAt: string };
export type EmailListResponse = { data: EmailListItem[]; pagination: { page: number; pageSize: number; total: number } };
export type SearchResult = { emailId: string; batchId: string; recipient: string; sender: string; subject: string; body: string; status: EmailStatus; plannedSendAt: string; sentAt: string | null; sequenceIndex: number };
export type SearchResponse = { results: SearchResult[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
export type EmailDetail = { id: string; recipient: string; sender: string; subject: string; body: string; status: EmailStatus; sequenceIndex: number; plannedSendAt: string; sentAt: string | null; createdAt: string; batch: { id: string; scheduledAt: string; delayBetweenEmails: number; hourlyLimit: number }; attachments: { id: string; filename: string; contentType: string; sizeBytes: number; createdAt: string }[] };
export type SlackStatus = { connected: false } | { connected: true; teamId: string; teamName: string | null; channelName: string | null };

export async function getCurrentUser(): Promise<AuthUser | null> {
  return (await request<AuthMeResponse>('/auth/me'))?.user ?? null;
}

export async function logout(): Promise<void> { await request<void>('/auth/logout', { method: 'POST' }); }
export function googleLoginUrl(): string { return `${apiBaseUrl}/auth/google`; }
export async function getEmailCounts(): Promise<EmailCounts> { return await requiredRequest<EmailCounts>('/api/emails/counts'); }
export async function createEmailBatch(input: CreateEmailBatchRequest): Promise<CreateEmailBatchResponse> {
  return await requiredRequest<CreateEmailBatchResponse>('/api/email-batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
}
export async function getEmails(kind: 'scheduled' | 'sent', page: number, signal?: AbortSignal): Promise<EmailListResponse> {
  return await requiredRequest<EmailListResponse>(`/api/emails/${kind}?page=${page}&pageSize=20`, { signal });
}
export async function searchEmails(query: { q?: string; status?: EmailStatus; page: number }, signal?: AbortSignal): Promise<SearchResponse> {
  const params = new URLSearchParams({ page: String(query.page), limit: '20' });
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  return await requiredRequest<SearchResponse>(`/api/emails/search?${params.toString()}`, { signal });
}
export async function getEmailDetail(id: string, signal?: AbortSignal): Promise<EmailDetail> {
  return (await requiredRequest<{ data: EmailDetail }>(`/api/emails/${id}`, { signal })).data;
}
export async function getSlackStatus(signal?: AbortSignal): Promise<SlackStatus> { return await requiredRequest<SlackStatus>('/api/slack/status', { signal }); }
export async function disconnectSlack(): Promise<void> { await requiredRequest<void>('/api/slack/disconnect', { method: 'POST' }); }
export function slackConnectUrl(): string { return `${apiBaseUrl}/api/slack/connect`; }

async function request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: 'include', headers: { Accept: 'application/json', ...init.headers } });
  } catch {
    throw new ApiError(0, 'Unable to reach the application server. Please try again.');
  }
  if (response.status === 401) return null;
  if (!response.ok) {
    const body = await readJson<{ error?: unknown }>(response);
    throw new ApiError(response.status, typeof body?.error === 'string' ? body.error : 'Request failed.');
  }
  if (response.status === 204) return undefined as T;
  return (await readJson<T>(response)) ?? null;
}

async function readJson<T>(response: Response): Promise<T | undefined> {
  if (!response.headers.get('content-type')?.includes('application/json')) return undefined;
  return (await response.json()) as T;
}

async function requiredRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const result = await request<T>(path, init);
  if (result === null) throw new ApiError(401, 'Your session has expired. Please sign in again.');
  return result;
}
