import { ClientContact } from '../types';

export const CONTACT_DESCRIPTION_SUGGESTIONS = [
  'Pai',
  'Mãe',
  'Cônjuge',
  'Irmão(ã)',
  'Filho(a)',
  'Trabalho',
  'Recado',
];

/**
 * Applies Brazilian phone mask: (00) 0000-0000 or (00) 00000-0000.
 */
export const maskPhoneValue = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

/**
 * Generates a unique local identifier for a contact entry.
 */
export const createEmptyContact = (): ClientContact => ({
  id:
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  phone: '',
  description: '',
});

/**
 * Filters out completely blank contact entries and trims description strings.
 */
export const sanitizeAdditionalContacts = (contacts: ClientContact[]): ClientContact[] =>
  contacts
    .map((contact) => ({
      id: contact.id || createEmptyContact().id,
      phone: maskPhoneValue(contact.phone || ''),
      description: (contact.description || '').trim(),
    }))
    .filter((contact) => contact.phone.replace(/\D/g, '').length > 0 || contact.description.length > 0);

/**
 * Validates non-empty secondary contacts. Returns an error message or null when valid.
 */
export const validateAdditionalContacts = (contacts: ClientContact[]): string | null => {
  const activeContacts = sanitizeAdditionalContacts(contacts);
  for (let i = 0; i < activeContacts.length; i += 1) {
    const contact = activeContacts[i];
    const digits = contact.phone.replace(/\D/g, '');
    if (digits.length < 10) {
      return `Informe um telefone válido para o contato adicional #${i + 1}.`;
    }
    if (!contact.description) {
      return `Informe quem é o contato adicional #${i + 1} (ex: Pai, Mãe, Trabalho).`;
    }
  }
  return null;
};

/**
 * Formats primary street line including number and neighborhood when present.
 */
export const formatAddressSummary = (data: {
  address?: string;
  number?: string;
  neighborhood?: string;
}): string => {
  if (!data.address) return '';
  const street = `${data.address}${data.number ? `, ${data.number}` : ', S/N'}`;
  return data.neighborhood ? `${street} - ${data.neighborhood}` : street;
};

/**
 * Detects Supabase/PostgreSQL errors caused by columns not yet created in the schema.
 */
export const isMissingColumnError = (error: any): boolean => {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || error.details || '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    (message.includes('column') && (message.includes('does not exist') || message.includes('schema cache')))
  );
};

/**
 * Runs a Supabase write and retries without new schema columns (`neighborhood`, `additional_contacts`)
 * when the database table has not run the corresponding ALTER TABLE migration yet.
 */
export const executeWithClientColumnsFallback = async <T extends Record<string, any>>(
  payload: T,
  runner: (cleanPayload: Record<string, any>) => Promise<{ error: any }>
): Promise<{ error: any; usedFallback: boolean }> => {
  const firstResult = await runner(payload);
  if (!firstResult.error || !isMissingColumnError(firstResult.error)) {
    return { error: firstResult.error, usedFallback: false };
  }

  console.warn(
    'Database table missing new client columns (neighborhood / additional_contacts). Retrying without new fields until SQL migration is applied.'
  );
  const { neighborhood: _neighborhood, additional_contacts: _additionalContacts, ...legacyPayload } = payload;
  const fallbackResult = await runner(legacyPayload);
  return { error: fallbackResult.error, usedFallback: !fallbackResult.error };
};

