/**
 * Utility functions for PIX key formatting, validation, and sanitization.
 */

export const BRAZILIAN_BANKS = [
    { code: '260', name: 'Nubank (Nu Pagamentos)' },
    { code: '077', name: 'Banco Inter' },
    { code: '341', name: 'Itaú Unibanco' },
    { code: '237', name: 'Bradesco' },
    { code: '001', name: 'Banco do Brasil' },
    { code: '104', name: 'Caixa Econômica Federal' },
    { code: '033', name: 'Santander' },
    { code: '336', name: 'C6 Bank' },
    { code: '290', name: 'PagBank (PagSeguro)' },
    { code: '380', name: 'PicPay' },
    { code: '323', name: 'Mercado Pago' },
    { code: '208', name: 'BTG Pactual' },
    { code: '655', name: 'Banco Neon' },
    { code: '748', name: 'Sicredi' },
    { code: '756', name: 'Sicoob' },
    { code: '197', name: 'Stone Pagamentos' },
    { code: '999', name: 'Outro Banco' }
];

export const maskCPF = (val: string): string => {
    return val
        .replace(/\D/g, '')
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

export const maskCNPJ = (val: string): string => {
    return val
        .replace(/\D/g, '')
        .slice(0, 14)
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
};

export const maskPhone = (val: string): string => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
        return digits
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return digits
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2');
};

export const maskDocument = (val: string): string => {
    const digits = val.replace(/\D/g, '');
    if (digits.length <= 11) {
        return maskCPF(digits);
    }
    return maskCNPJ(digits);
};

export const maskSensitiveKey = (key: string, type: string): string => {
    if (!key) return '';
    if (type === 'cpf') {
        const digits = key.replace(/\D/g, '');
        if (digits.length === 11) {
            return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
        }
    } else if (type === 'cnpj') {
        const digits = key.replace(/\D/g, '');
        if (digits.length === 14) {
            return `${digits.slice(0, 2)}.***.***/${digits.slice(8, 12)}-${digits.slice(12)}`;
        }
    } else if (type === 'email') {
        const parts = key.split('@');
        if (parts.length === 2 && parts[0].length > 2) {
            return `${parts[0].slice(0, 3)}***@${parts[1]}`;
        }
    } else if (type === 'phone') {
        const digits = key.replace(/\D/g, '');
        if (digits.length >= 10) {
            return `(${digits.slice(0, 2)}) *****-${digits.slice(-4)}`;
        }
    }
    return key;
};

export const validateCPF = (cpf: string): boolean => {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(clean)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(clean.charAt(i)) * (10 - i);
    }
    let rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(clean.charAt(9))) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(clean.charAt(i)) * (11 - i);
    }
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    return rest === parseInt(clean.charAt(10));
};

export const validateCNPJ = (cnpj: string): boolean => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(clean)) return false;

    let size = clean.length - 2;
    let numbers = clean.substring(0, size);
    const digits = clean.substring(size);
    let sum = 0;
    let pos = size - 7;

    for (let i = size; i >= 1; i--) {
        sum += parseInt(numbers.charAt(size - i)) * pos--;
        if (pos < 2) pos = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0))) return false;

    size = size + 1;
    numbers = clean.substring(0, size);
    sum = 0;
    pos = size - 7;

    for (let i = size; i >= 1; i--) {
        sum += parseInt(numbers.charAt(size - i)) * pos--;
        if (pos < 2) pos = 9;
    }

    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return result === parseInt(digits.charAt(1));
};

export const validateEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim());
};

export const validatePhone = (phone: string): boolean => {
    const clean = phone.replace(/\D/g, '');
    return clean.length === 10 || clean.length === 11;
};

export const validateEVP = (evp: string): boolean => {
    const clean = evp.trim();
    // UUID regex format (8-4-4-4-12 hex)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(clean);
};

export const validatePixKey = (key: string, type: string): { valid: boolean; message?: string } => {
    if (!key || !key.trim()) {
        return { valid: false, message: 'A chave PIX é obrigatória.' };
    }

    switch (type) {
        case 'cpf':
            if (!validateCPF(key)) return { valid: false, message: 'CPF informado é inválido.' };
            break;
        case 'cnpj':
            if (!validateCNPJ(key)) return { valid: false, message: 'CNPJ informado é inválido.' };
            break;
        case 'email':
            if (!validateEmail(key)) return { valid: false, message: 'E-mail informado é inválido.' };
            break;
        case 'phone':
            if (!validatePhone(key)) return { valid: false, message: 'Telefone deve conter DDD e 8 ou 9 dígitos.' };
            break;
        case 'random':
            if (!validateEVP(key)) return { valid: false, message: 'Chave Aleatória deve ser no padrão UUID (ex: 123e4567-e89b-12d3-a456-426614174000).' };
            break;
        default:
            if (key.trim().length < 3) return { valid: false, message: 'Chave muito curta.' };
    }

    return { valid: true };
};

export const sanitizePixKeyForPayload = (key: string, type: string): string => {
    const clean = key.trim();
    if (type === 'cpf' || type === 'cnpj') {
        return clean.replace(/\D/g, '');
    }
    if (type === 'phone') {
        const digits = clean.replace(/\D/g, '');
        if (digits.startsWith('55') && digits.length >= 12) {
            return `+${digits}`;
        }
        return `+55${digits}`;
    }
    return clean;
};

