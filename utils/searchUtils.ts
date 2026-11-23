/**
 * Utility functions for accent-insensitive, case-insensitive and phone-formatting-insensitive search.
 */

/**
 * Normalizes text by removing accents/diacritics, special marks, and converting to lowercase.
 * Example: "Júlio César" -> "julio cesar"
 */
export const normalizeSearchText = (text?: string | null): string => {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

/**
 * Extracts only digits from a string (useful for phone numbers, CPFs, contract numbers).
 */
export const cleanDigits = (value?: string | null): string => {
  if (!value) return '';
  return value.replace(/\D/g, '');
};

/**
 * Checks if a target text matches a search query regardless of accents or casing.
 */
export const matchesText = (target?: string | null, query?: string | null): boolean => {
  if (!query) return true;
  const normalizedTarget = normalizeSearchText(target);
  const normalizedQuery = normalizeSearchText(query);
  return normalizedTarget.includes(normalizedQuery);
};

/**
 * Checks if a phone number matches a query digits-wise (ignoring formatting like parentheses, dashes, spaces).
 */
export const matchesPhone = (phone?: string | null, query?: string | null): boolean => {
  if (!query) return true;
  const digitsQuery = cleanDigits(query);
  if (!digitsQuery) return false;
  const digitsPhone = cleanDigits(phone);
  return digitsPhone.includes(digitsQuery);
};

/**
 * Comprehensive client search match:
 * - Matches client name (accent-insensitive)
 * - Matches primary phone (formatting-insensitive)
 * - Matches CPF (if numbers are typed)
 * - Matches additional contacts (phones and descriptions)
 */
export const matchesClientSearch = (client: any, query?: string | null): boolean => {
  if (!query || !query.trim()) return true;
  const trimmed = query.trim();

  // 1. Check Name (accent-insensitive)
  if (matchesText(client?.name, trimmed)) {
    return true;
  }

  // 2. Check Primary Phone
  if (matchesPhone(client?.phone, trimmed)) {
    return true;
  }

  // 3. Check CPF
  if (matchesPhone(client?.cpf, trimmed)) {
    return true;
  }

  // 4. Check Additional Contacts
  if (Array.isArray(client?.additional_contacts)) {
    const hasMatchInContacts = client.additional_contacts.some((contact: any) =>
      matchesPhone(contact?.phone, trimmed) || matchesText(contact?.description, trimmed)
    );
    if (hasMatchInContacts) return true;
  }

  return false;
};
