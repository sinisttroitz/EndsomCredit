import { supabase } from '../supabaseClient';
import { PixKeyItem } from '../types';

export interface UserSettingsSavePayload {
  user_id: string;
  pix_key: string;
  pix_beneficiary: string;
  city?: string;
  state?: string;
  pix_keys?: PixKeyItem[];
  updated_at?: string;
}

export const isMissingTableError = (error: any, tableName?: string): boolean => {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || error.details || error.hint || '').toLowerCase();
  if (code === '42P01' || code === 'PGRST205') return true;
  const mentionsTable = tableName ? msg.includes(tableName.toLowerCase()) : true;
  return mentionsTable && (msg.includes('does not exist') || msg.includes('could not find the table'));
};

const isMissingPixKeysColumnError = (error: any): boolean => {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || error.details || error.hint || '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    (msg.includes('pix_keys') &&
      (msg.includes('column') || msg.includes('schema cache') || msg.includes('could not find')))
  );
};

/**
 * Safely persists user_settings using UPDATE when a row exists for user_id
 * (avoiding primary-key vs unique-key conflicts on upsert) and falling back
 * to legacy columns if `pix_keys` has not been added to the table yet.
 */
export const saveUserPixSettings = async (
  payload: UserSettingsSavePayload
): Promise<{ usedLegacyFallback: boolean }> => {
  const { user_id, pix_keys, ...baseFields } = payload;
  const cleanBase = {
    ...baseFields,
    updated_at: payload.updated_at || new Date().toISOString(),
  };

  const { data: existingRow, error: checkErr } = await supabase
    .from('user_settings')
    .select('user_id')
    .eq('user_id', user_id)
    .maybeSingle();

  if (checkErr && checkErr.code !== 'PGRST116') {
    throw checkErr;
  }

  const writeSettings = async (fields: Record<string, any>) => {
    if (existingRow) {
      return await supabase.from('user_settings').update(fields).eq('user_id', user_id);
    }
    return await supabase.from('user_settings').insert({ user_id, ...fields });
  };

  const fullFields = pix_keys !== undefined ? { ...cleanBase, pix_keys } : cleanBase;
  const firstAttempt = await writeSettings(fullFields);

  if (!firstAttempt.error) {
    return { usedLegacyFallback: false };
  }

  if (pix_keys !== undefined && isMissingPixKeysColumnError(firstAttempt.error)) {
    const fallbackAttempt = await writeSettings(cleanBase);
    if (fallbackAttempt.error) {
      throw fallbackAttempt.error;
    }
    return { usedLegacyFallback: true };
  }

  throw firstAttempt.error;
};

/**
 * Normalizes text to ASCII (removing accents and special characters)
 * and truncates to the maximum allowed length by BACEN / EMVCo.
 */
export const sanitizePixText = (str: string, maxLength: number): string => {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics / accents
    .replace(/[^a-zA-Z0-9 ]/g, '') // only alphanumeric and spaces
    .trim()
    .substring(0, maxLength)
    .trim();
};

/**
 * Cleans and standardizes the Pix key according to BACEN standards:
 * - Email: lowercase, trimmed
 * - CPF: 11 digits only (unmasked)
 * - CNPJ: 14 digits only (unmasked)
 * - Phone: +55... with country code
 * - Random key (EVP): lowercase, trimmed
 */
export const sanitizePixKey = (key: string): string => {
  if (!key) return '';
  const trimmed = key.trim();

  // Email
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  // EVP / Random key (UUID format)
  if (/^[0-9a-fA-F-]{32,36}$/.test(trimmed) && trimmed.includes('-')) {
    return trimmed.toLowerCase();
  }

  const digits = trimmed.replace(/\D/g, '');

  // Phone (has international format or parentheses/mask, or standard 10/11 digits when explicit)
  if (trimmed.includes('(') || trimmed.includes(')') || trimmed.startsWith('+') || (digits.length === 11 && digits.startsWith('55'))) {
    return digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
  }

  // CPF (11 digits) or CNPJ (14 digits)
  if (digits.length === 11 || digits.length === 14) {
    return digits;
  }

  return trimmed;
};

/**
 * Sanitizes transaction ID (txid) for static Pix (Tag 62 / Subtag 05).
 * BACEN requires alphanumeric characters only [a-zA-Z0-9], max 25 chars, or '***'.
 */
export const sanitizePixTxId = (txid?: string): string => {
  if (!txid || txid === '***') return '***';
  const clean = txid.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25);
  return clean || '***';
};

export const generatePixPayload = (
  key: string,
  name: string,
  city: string,
  amount: number,
  transactionId: string = '***'
): string => {
  const formatField = (id: string, value: string) => {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
  };

  const cleanKey = sanitizePixKey(key);
  // BACEN Tag 59 (Merchant Name): max 25 characters, alphanumeric & spaces, no accents
  const cleanName = sanitizePixText(name, 25) || 'RECEBEDOR';
  // BACEN Tag 60 (Merchant City): max 15 characters, alphanumeric & spaces, no accents
  const cleanCity = sanitizePixText(city, 15) || 'CIDADE';
  // BACEN Tag 62 Subtag 05 (txid): [a-zA-Z0-9]{1,25} or '***' (no hyphens allowed!)
  const cleanTxId = sanitizePixTxId(transactionId);

  const amountStr = amount.toFixed(2);

  const merchantAccountInfo = [
    formatField('00', 'BR.GOV.BCB.PIX'),
    formatField('01', cleanKey),
  ].join('');

  const payload = [
    formatField('00', '01'), // Payload Format Indicator
    formatField('26', merchantAccountInfo),
    formatField('52', '0000'), // Merchant Category Code
    formatField('53', '986'), // Transaction Currency (BRL)
    formatField('54', amountStr), // Transaction Amount
    formatField('58', 'BR'), // Country Code
    formatField('59', cleanName), // Merchant Name (max 25)
    formatField('60', cleanCity), // Merchant City (max 15)
    formatField('62', formatField('05', cleanTxId)), // Additional Data Field Template
    '6304', // CRC16 placeholder
  ].join('');

  const crc16 = calculateCRC16(payload);
  return `${payload}${crc16}`;
};

const calculateCRC16 = (payload: string): string => {
  const polynomial = 0x1021;
  let crc = 0xFFFF;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ polynomial;
      } else {
        crc = crc << 1;
      }
    }
  }

  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
};
