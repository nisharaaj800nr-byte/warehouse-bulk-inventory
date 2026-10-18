import type { Db } from '../db/index.js';
import { ApiError } from '../lib/errors.js';

function readSettings(db: Db): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as unknown as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export interface WhatsAppConfig {
  token: string;
  phoneId: string;
  to: string;
}

export function whatsappSettings(db: Db): WhatsAppConfig | null {
  const values = readSettings(db);
  const token = values['WHATSAPP_TOKEN'] ?? '';
  const phoneId = values['WHATSAPP_PHONE_ID'] ?? '';
  if (!token || !phoneId) return null;
  return { token, phoneId, to: values['ALERT_WHATSAPP_TO'] ?? '' };
}

/**
 * Sends one WhatsApp text through the Meta Cloud API. Requires outbound
 * internet and a verified business number; when the keys are missing the caller
 * gets an actionable error instead of a silent failure.
 */
export async function sendWhatsAppTest(db: Db, overrideTo?: string): Promise<{ sentTo: string }> {
  const config = whatsappSettings(db);
  if (!config) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'WhatsApp is not configured. Settings me WHATSAPP_TOKEN, WHATSAPP_PHONE_ID aur ALERT_WHATSAPP_TO bharo.'
    );
  }

  const to = (overrideTo ?? config.to).trim();
  if (!to) throw new ApiError(400, 'VALIDATION_ERROR', 'No WhatsApp recipient configured (ALERT_WHATSAPP_TO).');

  const response = await fetch(`https://graph.facebook.com/v20.0/${config.phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: `Bulk Repair test message — ${new Date().toISOString()}` }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(502, 'UPSTREAM_ERROR', `WhatsApp API error ${response.status}: ${detail.slice(0, 200)}`);
  }

  return { sentTo: to };
}
