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

  const amountStr = amount.toFixed(2);

  const merchantAccountInfo = [
    formatField('00', 'BR.GOV.BCB.PIX'),
    formatField('01', key),
  ].join('');

  const payload = [
    formatField('00', '01'), // Payload Format Indicator
    formatField('26', merchantAccountInfo),
    formatField('52', '0000'), // Merchant Category Code
    formatField('53', '986'), // Transaction Currency (BRL)
    formatField('54', amountStr), // Transaction Amount
    formatField('58', 'BR'), // Country Code
    formatField('59', name), // Merchant Name
    formatField('60', city), // Merchant City
    formatField('62', formatField('05', transactionId)), // Additional Data Field Template
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
