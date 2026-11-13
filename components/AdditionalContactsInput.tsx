import React from 'react';
import { Plus, Trash2, Phone, Users } from 'lucide-react';
import { ClientContact } from '../types';
import {
  CONTACT_DESCRIPTION_SUGGESTIONS,
  createEmptyContact,
  maskPhoneValue,
} from '../utils/clientUtils';

interface AdditionalContactsInputProps {
  contacts: ClientContact[];
  onChange: (contacts: ClientContact[]) => void;
  variant?: 'wizard' | 'form';
  darkSupport?: boolean;
}

export const AdditionalContactsInput: React.FC<AdditionalContactsInputProps> = ({
  contacts,
  onChange,
  variant = 'wizard',
  darkSupport = true,
}) => {
  const handleAddContact = () => {
    onChange([...contacts, createEmptyContact()]);
  };

  const handleRemoveContact = (id: string) => {
    onChange(contacts.filter((c) => c.id !== id));
  };

  const handleUpdateContact = (id: string, field: 'phone' | 'description', value: string) => {
    onChange(
      contacts.map((c) =>
        c.id === id
          ? {
              ...c,
              [field]: field === 'phone' ? maskPhoneValue(value) : value,
            }
          : c
      )
    );
  };

  const cardBg =
    variant === 'form'
      ? darkSupport
        ? 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700'
        : 'bg-gray-50 border-gray-200'
      : darkSupport
        ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200/80 dark:border-gray-700/80'
        : 'bg-gray-50 border-gray-200';

  const inputCls =
    variant === 'form'
      ? darkSupport
        ? 'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-primary focus:outline-none h-11 px-3 text-sm font-medium'
        : 'w-full rounded-lg border border-gray-200 bg-white text-gray-900 focus:border-black focus:outline-none h-11 px-3 text-sm font-medium'
      : darkSupport
        ? 'w-full bg-transparent border-b border-gray-200 dark:border-gray-700 py-2 text-base font-bold text-gray-900 dark:text-white focus:outline-none focus:border-black dark:focus:border-white transition-colors'
        : 'w-full bg-transparent border-b border-gray-200 py-2 text-base font-bold text-gray-900 focus:outline-none focus:border-black transition-colors';

  const titleTextCls = darkSupport ? 'text-gray-700 dark:text-gray-300' : 'text-gray-700';
  const mutedTextCls = darkSupport ? 'text-gray-400 dark:text-gray-500' : 'text-gray-400';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className={`w-4 h-4 ${mutedTextCls}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${titleTextCls}`}>
            Contatos Adicionais (Opcional)
          </span>
        </div>
        {contacts.length > 0 && (
          <span className={`text-[11px] font-bold ${mutedTextCls}`}>
            {contacts.length} {contacts.length === 1 ? 'adicionado' : 'adicionados'}
          </span>
        )}
      </div>

      {contacts.map((contact, index) => (
        <div
          key={contact.id}
          className={`p-4 rounded-2xl border space-y-3 transition-all ${cardBg}`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-black uppercase tracking-widest ${mutedTextCls}`}>
              Contato Adicional #{index + 1}
            </span>
            <button
              type="button"
              onClick={() => handleRemoveContact(contact.id)}
              aria-label={`Remover contato adicional ${index + 1}`}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${mutedTextCls}`}>
                Telefone
              </span>
              <div className="relative flex items-center">
                <Phone className={`w-3.5 h-3.5 mr-2 flex-shrink-0 ${mutedTextCls}`} />
                <input
                  type="tel"
                  value={contact.phone}
                  onChange={(e) => handleUpdateContact(contact.id, 'phone', e.target.value)}
                  maxLength={15}
                  placeholder="(00) 00000-0000"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <span className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${mutedTextCls}`}>
                Quem é este contato?
              </span>
              <input
                type="text"
                value={contact.description}
                onChange={(e) => handleUpdateContact(contact.id, 'description', e.target.value)}
                maxLength={40}
                placeholder="Ex: Pai, Mãe, Cônjuge..."
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {CONTACT_DESCRIPTION_SUGGESTIONS.map((suggestion) => {
              const isSelected = contact.description.trim().toLowerCase() === suggestion.toLowerCase();
              return (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleUpdateContact(contact.id, 'description', suggestion)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all border ${
                    isSelected
                      ? darkSupport
                        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                        : 'bg-gray-900 text-white border-gray-900'
                      : darkSupport
                        ? 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {suggestion}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAddContact}
        className={`w-full py-3.5 px-4 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 text-sm font-bold transition-all ${
          darkSupport
            ? 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white'
            : 'border-gray-300 text-gray-600 hover:border-gray-900 hover:text-gray-900'
        }`}
      >
        <Plus className="w-4 h-4" />
        Adicionar outro contato (Pai, Mãe, etc.)
      </button>
    </div>
  );
};

interface AdditionalContactsListProps {
  contacts?: ClientContact[];
  interactiveLinks?: boolean;
  darkSupport?: boolean;
  itemClassName?: string;
}

export const AdditionalContactsList: React.FC<AdditionalContactsListProps> = ({
  contacts,
  interactiveLinks = false,
  darkSupport = true,
  itemClassName = '',
}) => {
  if (!contacts || contacts.length === 0) return null;

  const badgeCls = darkSupport
    ? 'bg-gray-200/80 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
    : 'bg-gray-200 text-gray-700';

  const textCls = darkSupport
    ? 'text-gray-700 dark:text-gray-200'
    : 'text-gray-700';

  return (
    <div className="space-y-1.5">
      {contacts.map((contact, idx) => (
        <div
          key={contact.id || idx}
          className={`flex items-center justify-between gap-2 text-xs ${itemClassName}`}
        >
          {interactiveLinks ? (
            <a
              href={`https://wa.me/55${contact.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              {contact.phone}
            </a>
          ) : (
            <span className={`font-bold ${textCls}`}>{contact.phone}</span>
          )}
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeCls}`}>
            {contact.description}
          </span>
        </div>
      ))}
    </div>
  );
};

