import nodemailer from 'nodemailer';
import type { SentMessageInfo, Transporter } from 'nodemailer';

const RESEND_API_URL = 'https://api.resend.com/emails';

export function createResendTransport(apiKey: string, resendFrom?: string): Transporter<SentMessageInfo> {
  const transport = {
    name: 'resend',
    version: '1.0.0',
    send(
      mail: { data: Record<string, unknown> },
      callback: (err: Error | null, info?: { messageId: string; envelope: unknown }) => void,
    ): void {
      const { from, to, subject, html, text } = mail.data as {
        from?: string | { address: string };
        to?: string | string[] | { address: string } | { address: string }[];
        subject?: string;
        html?: string;
        text?: string;
      };

      const fallbackFrom = typeof from === 'string' ? from : from?.address ?? '';
      const fromAddress = resendFrom || fallbackFrom;
      const recipients = normalizeRecipients(to);

      const body = JSON.stringify({
        from: fromAddress,
        to: recipients,
        subject: subject ?? '',
        ...(html !== undefined ? { html } : {}),
        ...(text !== undefined ? { text } : {}),
      });

      fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorBody = await response.text().catch(() => 'Unknown error');
            const error = new Error(`Resend API ${response.status}: ${errorBody}`);
            (error as Error & { responseCode?: number }).responseCode = response.status;
            callback(error);
            return;
          }
          const result = (await response.json()) as { id?: string };
          callback(null, {
            messageId: result.id ?? '',
            envelope: { from: fromAddress, to: recipients },
          });
        })
        .catch((error: unknown) => {
          callback(error instanceof Error ? error : new Error(String(error)));
        });
    },
  };

  return nodemailer.createTransport(transport);
}

function normalizeRecipients(
  to: string | string[] | { address: string } | { address: string }[] | undefined,
): string[] {
  if (!to) {
    return [];
  }
  if (typeof to === 'string') {
    return [to];
  }
  if (Array.isArray(to)) {
    return to.map((r) => (typeof r === 'string' ? r : r.address));
  }
  return [to.address];
}
