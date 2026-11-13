import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, CreditCard, Building2, User, FileText, Star, AlertCircle, Check, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { PixKeyItem } from '../types';
import {
    BRAZILIAN_BANKS,
    maskCPF,
    maskCNPJ,
    maskPhone,
    maskDocument,
    validatePixKey
} from '../utils/pixValidationUtils';
import { isMissingTableError, saveUserPixSettings } from '../utils/pixUtils';

interface PixKeyFormProps {
    initialData?: PixKeyItem | null;
    onBack: () => void;
    onSuccess: () => void;
}

const isUuid = (val: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

const generateUuid = (): string =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
          });

export const PixKeyForm: React.FC<PixKeyFormProps> = ({
    initialData,
    onBack,
    onSuccess
}) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const errorRef = useRef<HTMLDivElement>(null);

    const [keyType, setKeyType] = useState<PixKeyItem['key_type']>('cpf');
    const [pixKey, setPixKey] = useState('');
    const [holderName, setHolderName] = useState('');
    const [holderDocument, setHolderDocument] = useState('');
    const [financialInstitution, setFinancialInstitution] = useState('');
    const [accountType, setAccountType] = useState<PixKeyItem['account_type']>('corrente');
    const [isDefault, setIsDefault] = useState(false);

    const [existingKeys, setExistingKeys] = useState<PixKeyItem[]>([]);
    const [city, setCity] = useState('');
    const [state, setState] = useState('');

    useEffect(() => {
        loadData();
    }, [initialData]);

    const showError = (msg: string) => {
        setError(msg);
        setTimeout(() => {
            errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            let dbPixKeys: PixKeyItem[] = [];
            try {
                const { data: keysData } = await supabase
                    .from('pix_keys')
                    .select('*')
                    .eq('user_id', user.id);
                if (keysData && keysData.length > 0) {
                    dbPixKeys = keysData;
                }
            } catch (e) { /* ignore */ }

            const { data: settingsData } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (settingsData) {
                setCity(settingsData.city || '');
                setState(settingsData.state || '');
                if (dbPixKeys.length === 0 && settingsData.pix_keys) {
                    dbPixKeys = settingsData.pix_keys;
                }
            }

            setExistingKeys(dbPixKeys);

            const defaultName = user.user_metadata?.full_name || '';

            if (initialData) {
                setKeyType(initialData.key_type || (initialData.type as any) || 'cpf');
                setPixKey(initialData.pix_key || initialData.key || '');
                setHolderName(initialData.holder_name || initialData.beneficiary || defaultName);
                setHolderDocument(initialData.holder_document || '');
                setFinancialInstitution(initialData.financial_institution || '');
                setAccountType(initialData.account_type || 'corrente');
                setIsDefault(!!initialData.is_default);
            } else {
                setKeyType('cpf');
                setPixKey('');
                setHolderName(defaultName);
                setHolderDocument('');
                setFinancialInstitution('');
                setAccountType('corrente');
                setIsDefault(dbPixKeys.length === 0);
            }
        } catch (err) {
            console.error('Error loading data for PixKeyForm:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyTypeChange = (newType: PixKeyItem['key_type']) => {
        setKeyType(newType);
        setPixKey('');
        setError(null);
    };

    const handlePixKeyChange = (val: string) => {
        setError(null);
        if (keyType === 'cpf') {
            setPixKey(maskCPF(val));
        } else if (keyType === 'cnpj') {
            setPixKey(maskCNPJ(val));
        } else if (keyType === 'phone') {
            setPixKey(maskPhone(val));
        } else {
            setPixKey(val);
        }
    };

    const handleDocumentChange = (val: string) => {
        setHolderDocument(maskDocument(val));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const keyValidation = validatePixKey(pixKey, keyType);
        if (!keyValidation.valid) {
            showError(keyValidation.message || 'Chave PIX inválida.');
            return;
        }

        if (!holderName.trim()) {
            showError('O nome do titular/beneficiário é obrigatório.');
            return;
        }

        const normalizeForCompare = (val: string, t?: string) => {
            if (t === 'cpf' || t === 'cnpj' || t === 'phone') {
                return val.replace(/\D/g, '');
            }
            return val.trim().toLowerCase();
        };

        const cleanCurrent = normalizeForCompare(pixKey, keyType);
        const isDuplicate = existingKeys.some((k) => {
            if (initialData && k.id === initialData.id) return false;
            const existingType = k.key_type || k.type;
            const existingVal = normalizeForCompare(k.pix_key || k.key || '', existingType);
            return existingVal !== '' && existingVal === cleanCurrent;
        });

        if (isDuplicate) {
            showError('Esta chave PIX já foi cadastrada.');
            return;
        }

        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado.');

            let keyId = initialData?.id || generateUuid();
            const effectiveIsDefault =
                isDefault ||
                existingKeys.length === 0 ||
                (existingKeys.length === 1 && existingKeys[0].id === initialData?.id);

            // 1. Tentar salvar na tabela pix_keys (se existir)
            let pixKeysTableMissing = false;
            try {
                if (effectiveIsDefault) {
                    const { error: resetDefErr } = await supabase
                        .from('pix_keys')
                        .update({ is_default: false })
                        .eq('user_id', user.id);

                    if (resetDefErr && isMissingTableError(resetDefErr, 'pix_keys')) {
                        pixKeysTableMissing = true;
                    } else if (resetDefErr) {
                        throw resetDefErr;
                    }
                }

                if (!pixKeysTableMissing) {
                    const tableId = isUuid(keyId) ? keyId : generateUuid();
                    const rowPayload = {
                        user_id: user.id,
                        key_type: keyType,
                        pix_key: pixKey.trim(),
                        holder_name: holderName.trim(),
                        holder_document: holderDocument.trim(),
                        financial_institution: financialInstitution,
                        account_type: accountType,
                        is_default: effectiveIsDefault,
                        is_active: true,
                        updated_at: new Date().toISOString()
                    };

                    const { error: tableErr } = initialData && isUuid(initialData.id)
                        ? await supabase
                              .from('pix_keys')
                              .update(rowPayload)
                              .eq('id', initialData.id)
                              .eq('user_id', user.id)
                        : await supabase
                              .from('pix_keys')
                              .upsert({ id: tableId, ...rowPayload });

                    if (tableErr) {
                        if (isMissingTableError(tableErr, 'pix_keys')) {
                            pixKeysTableMissing = true;
                        } else {
                            throw tableErr;
                        }
                    } else {
                        keyId = tableId;
                    }
                }
            } catch (dbErr: any) {
                if (!isMissingTableError(dbErr, 'pix_keys')) {
                    throw dbErr;
                }
            }

            const itemToSave: PixKeyItem = {
                id: keyId,
                user_id: user.id,
                key_type: keyType,
                pix_key: pixKey.trim(),
                holder_name: holderName.trim(),
                holder_document: holderDocument.trim(),
                financial_institution: financialInstitution,
                account_type: accountType,
                is_default: effectiveIsDefault,
                is_active: true,
                key: pixKey.trim(),
                type: keyType,
                beneficiary: holderName.trim()
            };

            // 2. Atualizar user_settings de forma segura (sem ignorar erros silenciosamente)
            let updatedList = [...existingKeys];
            if (effectiveIsDefault) {
                updatedList = updatedList.map((k) => ({ ...k, is_default: false }));
            }

            const idx = updatedList.findIndex((k) =>
                initialData ? k.id === initialData.id || k.id === keyId : k.id === keyId
            );
            if (idx >= 0) {
                updatedList[idx] = itemToSave;
            } else {
                updatedList.push(itemToSave);
            }

            if (!updatedList.some((k) => k.is_default) && updatedList.length > 0) {
                updatedList[0].is_default = true;
            }

            const defaultKeyItem = updatedList.find((k) => k.is_default) || itemToSave;

            const { usedLegacyFallback } = await saveUserPixSettings({
                user_id: user.id,
                pix_key: defaultKeyItem.pix_key || defaultKeyItem.key || pixKey.trim(),
                pix_beneficiary:
                    defaultKeyItem.holder_name || defaultKeyItem.beneficiary || holderName.trim(),
                city: city,
                state: state,
                pix_keys: updatedList
            });

            if (usedLegacyFallback && pixKeysTableMissing && updatedList.length > 1) {
                throw new Error(
                    'A coluna pix_keys ainda não existe em user_settings no Supabase para salvar múltiplas chaves. Rode: ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pix_keys JSONB DEFAULT \'[]\'::jsonb;'
                );
            }

            onSuccess();
        } catch (err: any) {
            console.error('Error saving PIX key:', err);
            showError(err.message || 'Erro ao salvar chave PIX.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-background-light dark:bg-background-dark">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-full flex flex-col bg-background-light dark:bg-background-dark pb-24">
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 sm:px-6 py-4">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onBack}
                            className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
                            title="Voltar"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white">
                                {initialData ? 'Editar Chave PIX' : 'Nova Chave PIX'}
                            </h1>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {initialData ? 'Altere as informações da sua chave' : 'Adicione uma conta de recebimento'}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={saving}
                        className="px-5 py-2.5 rounded-2xl text-xs font-bold text-white bg-primary hover:bg-primary-dark transition-all shadow-md shadow-primary/20 flex items-center gap-2 active:scale-95 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>Salvar</span>
                    </button>
                </div>
            </header>

            {/* Form Content */}
            <main className="flex-1 px-4 sm:px-6 pt-6">
                <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
                    {error && (
                        <div ref={errorRef} className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl flex items-center gap-3 text-xs font-semibold text-red-600 dark:text-red-400 animate-in fade-in">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Section 1: Tipo de Chave e Valor */}
                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
                        <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-gray-700/60">
                            <div className="w-2 h-6 bg-primary rounded-full"></div>
                            <h2 className="text-base font-black text-gray-900 dark:text-white">
                                Identificação da Chave
                            </h2>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">
                                Tipo de Chave PIX *
                            </label>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                {[
                                    { id: 'cpf', label: 'CPF' },
                                    { id: 'cnpj', label: 'CNPJ' },
                                    { id: 'phone', label: 'Celular' },
                                    { id: 'email', label: 'E-mail' },
                                    { id: 'random', label: 'Aleatória' },
                                    { id: 'outro', label: 'Outro' }
                                ].map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => handleKeyTypeChange(t.id as any)}
                                        className={`py-3 px-2 rounded-2xl text-xs font-bold transition-all border text-center ${keyType === t.id
                                            ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20 scale-[1.02]'
                                            : 'bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
                                            }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center justify-between">
                                <span>Chave PIX *</span>
                                <CreditCard className="w-4 h-4 text-gray-400" />
                            </label>
                            <input
                                type={keyType === 'email' ? 'email' : 'text'}
                                value={pixKey}
                                onChange={(e) => handlePixKeyChange(e.target.value)}
                                placeholder={
                                    keyType === 'cpf' ? '000.000.000-00' :
                                        keyType === 'cnpj' ? '00.000.000/0000-00' :
                                            keyType === 'phone' ? '(00) 00000-0000' :
                                                keyType === 'email' ? 'seuemail@exemplo.com' :
                                                    keyType === 'random' ? 'ex: 123e4567-e89b-12d3-a456-426614174000' :
                                                        'Informe a chave PIX...'
                                }
                                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center justify-between">
                                <span>Instituição Financeira (Banco)</span>
                                <Building2 className="w-4 h-4 text-gray-400" />
                            </label>
                            <select
                                value={financialInstitution}
                                onChange={(e) => setFinancialInstitution(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            >
                                <option value="">Selecione o banco (opcional)</option>
                                {BRAZILIAN_BANKS.map((b) => (
                                    <option key={b.code} value={b.name}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Section 2: Dados do Titular e Conta */}
                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
                        <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-gray-700/60">
                            <div className="w-2 h-6 bg-blue-500 rounded-full"></div>
                            <h2 className="text-base font-black text-gray-900 dark:text-white">
                                Titular da Conta
                            </h2>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center justify-between">
                                    <span>Nome do Titular *</span>
                                    <User className="w-4 h-4 text-gray-400" />
                                </label>
                                <input
                                    type="text"
                                    value={holderName}
                                    onChange={(e) => setHolderName(e.target.value)}
                                    placeholder="Nome completo ou Razão Social"
                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center justify-between">
                                    <span>CPF / CNPJ do Titular</span>
                                    <FileText className="w-4 h-4 text-gray-400" />
                                </label>
                                <input
                                    type="text"
                                    value={holderDocument}
                                    onChange={(e) => handleDocumentChange(e.target.value)}
                                    placeholder="000.000.000-00"
                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">
                                Tipo de Conta
                            </label>
                            <select
                                value={accountType}
                                onChange={(e) => setAccountType(e.target.value as any)}
                                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            >
                                <option value="corrente">Conta Corrente</option>
                                <option value="poupanca">Conta Poupança</option>
                                <option value="pagamento">Conta de Pagamento</option>
                                <option value="salario">Conta Salário</option>
                            </select>
                        </div>
                    </div>

                    {/* Section 3: Definição como Principal */}
                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <label className="flex items-center gap-4 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={isDefault}
                                onChange={(e) => setIsDefault(e.target.checked)}
                                className="w-5 h-5 text-primary rounded-lg border-gray-300 dark:border-gray-600 focus:ring-primary/20"
                            />
                            <div className="flex-1">
                                <span className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                                    <Star className={`w-4 h-4 ${isDefault ? 'text-amber-500 fill-amber-500' : 'text-gray-400'}`} />
                                    Definir como Chave Principal
                                </span>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Esta chave será selecionada por padrão para geração de QR Codes e cobranças aos clientes.
                                </p>
                            </div>
                        </label>
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onBack}
                            className="px-6 py-3 rounded-2xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-8 py-3 rounded-2xl text-xs font-bold text-white bg-primary hover:bg-primary-dark transition-all shadow-lg shadow-primary/25 flex items-center gap-2 active:scale-95 disabled:opacity-50"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Salvando...</span>
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4" />
                                    <span>{initialData ? 'Atualizar Chave' : 'Cadastrar Chave PIX'}</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </main>
        </div>
    );
};

