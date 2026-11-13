import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Building2, CreditCard, User, FileText, Star, Loader2 } from 'lucide-react';
import { PixKeyItem } from '../types';
import {
    BRAZILIAN_BANKS,
    maskCPF,
    maskCNPJ,
    maskPhone,
    maskDocument,
    validatePixKey
} from '../utils/pixValidationUtils';

interface PixKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: PixKeyItem) => Promise<void> | void;
    initialData?: PixKeyItem | null;
    existingKeys: PixKeyItem[];
    defaultHolderName?: string;
}

export const PixKeyModal: React.FC<PixKeyModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialData,
    existingKeys,
    defaultHolderName = ''
}) => {
    const [keyType, setKeyType] = useState<PixKeyItem['key_type']>('cpf');
    const [pixKey, setPixKey] = useState('');
    const [holderName, setHolderName] = useState('');
    const [holderDocument, setHolderDocument] = useState('');
    const [financialInstitution, setFinancialInstitution] = useState('');
    const [accountType, setAccountType] = useState<PixKeyItem['account_type']>('corrente');
    const [isDefault, setIsDefault] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setKeyType(initialData.key_type || (initialData.type as any) || 'cpf');
                setPixKey(initialData.pix_key || initialData.key || '');
                setHolderName(initialData.holder_name || initialData.beneficiary || defaultHolderName);
                setHolderDocument(initialData.holder_document || '');
                setFinancialInstitution(initialData.financial_institution || '');
                setAccountType(initialData.account_type || 'corrente');
                setIsDefault(!!initialData.is_default);
            } else {
                setKeyType('cpf');
                setPixKey('');
                setHolderName(defaultHolderName);
                setHolderDocument('');
                setFinancialInstitution('');
                setAccountType('corrente');
                setIsDefault(existingKeys.length === 0);
            }
            setError(null);
        }
    }, [isOpen, initialData, defaultHolderName, existingKeys.length]);

    if (!isOpen) return null;

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

        // Validation
        const keyValidation = validatePixKey(pixKey, keyType);
        if (!keyValidation.valid) {
            setError(keyValidation.message || 'Chave PIX inválida.');
            return;
        }

        if (!holderName.trim()) {
            setError('O nome do titular/beneficiário é obrigatório.');
            return;
        }

        // Check for duplicate key (excluding self if editing)
        const cleanCurrent = pixKey.replace(/\D/g, '').toLowerCase() || pixKey.trim().toLowerCase();
        const isDuplicate = existingKeys.some(k => {
            if (initialData && k.id === initialData.id) return false;
            const existingVal = (k.pix_key || k.key || '').replace(/\D/g, '').toLowerCase() || (k.pix_key || k.key || '').trim().toLowerCase();
            return existingVal === cleanCurrent;
        });

        if (isDuplicate) {
            setError('Esta chave PIX já foi cadastrada.');
            return;
        }

        setSubmitting(true);
        try {
            const item: PixKeyItem = {
                id: initialData?.id || Date.now().toString(),
                key_type: keyType,
                pix_key: pixKey.trim(),
                holder_name: holderName.trim(),
                holder_document: holderDocument.trim(),
                financial_institution: financialInstitution,
                account_type: accountType,
                is_default: isDefault,
                is_active: true,
                // Backward compatibility aliases
                key: pixKey.trim(),
                type: keyType,
                beneficiary: holderName.trim()
            };

            await onSave(item);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar chave.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative bg-white dark:bg-gray-900 rounded-3xl w-full max-w-lg shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary dark:text-blue-400 flex items-center justify-center">
                            <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-gray-900 dark:text-white">
                                {initialData ? 'Editar Chave PIX' : 'Cadastrar Nova Chave PIX'}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Configure seus dados de recebimento
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 no-scrollbar">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Key Type */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1.5 block">
                            Tipo de Chave *
                        </label>
                        <div className="grid grid-cols-3 gap-2">
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
                                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${keyType === t.id
                                        ? 'bg-primary text-white border-primary shadow-sm'
                                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Key Input */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1.5 block">
                            Chave PIX *
                        </label>
                        <input
                            type={keyType === 'email' ? 'email' : 'text'}
                            value={pixKey}
                            onChange={(e) => handlePixKeyChange(e.target.value)}
                            placeholder={
                                keyType === 'cpf' ? '000.000.000-00' :
                                    keyType === 'cnpj' ? '00.000.000/0000-00' :
                                        keyType === 'phone' ? '(00) 00000-0000' :
                                            keyType === 'email' ? 'usuario@email.com' :
                                                keyType === 'random' ? '123e4567-e89b-12d3-a456-426614174000' :
                                                    'Digite sua chave...'
                            }
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            required
                        />
                    </div>

                    {/* Bank / Financial Institution */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1.5 flex items-center justify-between">
                            <span>Instituição Financeira (Banco)</span>
                            <Building2 className="w-3.5 h-3.5 text-gray-400" />
                        </label>
                        <select
                            value={financialInstitution}
                            onChange={(e) => setFinancialInstitution(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        >
                            <option value="">Selecione o banco (opcional)</option>
                            {BRAZILIAN_BANKS.map((b) => (
                                <option key={b.code} value={b.name}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Holder Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1.5 flex items-center justify-between">
                                <span>Nome do Titular *</span>
                                <User className="w-3.5 h-3.5 text-gray-400" />
                            </label>
                            <input
                                type="text"
                                value={holderName}
                                onChange={(e) => setHolderName(e.target.value)}
                                placeholder="Nome completo ou Razão Social"
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1.5 flex items-center justify-between">
                                <span>CPF/CNPJ do Titular</span>
                                <FileText className="w-3.5 h-3.5 text-gray-400" />
                            </label>
                            <input
                                type="text"
                                value={holderDocument}
                                onChange={(e) => handleDocumentChange(e.target.value)}
                                placeholder="000.000.000-00"
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                        </div>
                    </div>

                    {/* Account Type */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1.5 block">
                            Tipo de Conta
                        </label>
                        <select
                            value={accountType}
                            onChange={(e) => setAccountType(e.target.value as any)}
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        >
                            <option value="corrente">Conta Corrente</option>
                            <option value="poupanca">Conta Poupança</option>
                            <option value="pagamento">Conta de Pagamento</option>
                            <option value="salario">Conta Salário</option>
                        </select>
                    </div>

                    {/* Default Key Checkbox */}
                    <div className="pt-2">
                        <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <input
                                type="checkbox"
                                checked={isDefault}
                                onChange={(e) => setIsDefault(e.target.checked)}
                                className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary/20"
                            />
                            <div className="flex-1">
                                <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                    <Star className={`w-3.5 h-3.5 ${isDefault ? 'text-amber-500 fill-amber-500' : 'text-gray-400'}`} />
                                    Definir como Chave Principal
                                </span>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                    Esta chave será usada por padrão nos QR Codes e cobranças
                                </p>
                            </div>
                        </label>
                    </div>

                    {/* Buttons */}
                    <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary-dark transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Salvando...</span>
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4" />
                                    <span>Salvar Chave PIX</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

