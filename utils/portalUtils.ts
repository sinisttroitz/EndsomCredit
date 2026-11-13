import { supabase } from '../supabaseClient';

/**
 * Generates a cryptographically random token for portal links.
 * Uses 24 alphanumeric characters for security.
 */
export const generatePortalToken = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(24);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => chars[byte % chars.length]).join('');
};

/**
 * Creates a portal link for a given loan.
 * Returns the token if created, or the existing token if one already exists.
 */
export const createPortalLink = async (loanId: string, lenderId: string): Promise<string | null> => {
    try {
        // Check if a link already exists for this loan
        const { data: existing } = await supabase
            .from('client_portal_links')
            .select('token, is_active')
            .eq('loan_id', loanId)
            .single();

        if (existing) {
            // Reactivate if disabled
            if (!existing.is_active) {
                await supabase
                    .from('client_portal_links')
                    .update({ is_active: true })
                    .eq('loan_id', loanId);
            }
            return existing.token;
        }

        // Generate a new token
        const token = generatePortalToken();

        const { error } = await supabase
            .from('client_portal_links')
            .insert({
                token,
                loan_id: loanId,
                lender_id: lenderId,
            });

        if (error) throw error;
        return token;
    } catch (error) {
        console.error('Error creating portal link:', error);
        return null;
    }
};

/**
 * Deactivates a portal link for a given loan.
 */
export const deactivatePortalLink = async (loanId: string): Promise<boolean> => {
    try {
        const { error } = await supabase
            .from('client_portal_links')
            .update({ is_active: false })
            .eq('loan_id', loanId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error deactivating portal link:', error);
        return false;
    }
};

const isMissingRpcError = (error: any): boolean => {
    if (!error) return false;
    const code = String(error.code || '');
    const msg = String(error.message || error.details || error.hint || '').toLowerCase();
    return (
        code === 'PGRST202' ||
        code === '42883' ||
        (msg.includes('function') && (msg.includes('not find') || msg.includes('does not exist')))
    );
};

const fetchPortalDataDirect = async (token: string) => {
    // 1. Fetch the portal link
    const { data: link, error: linkError } = await supabase
        .from('client_portal_links')
        .select('*')
        .eq('token', token)
        .eq('is_active', true)
        .single();

    if (linkError || !link) return null;

    // 2. Fetch the loan data with minimal client info
    const { data: loan, error: loanError } = await supabase
        .from('loans')
        .select('*, client:clients(name, credit_balance)')
        .eq('id', link.loan_id)
        .single();

    if (loanError || !loan) return null;

    // 3. Fetch lender settings (PIX key, name, city)
    const { data: lenderSettingsRaw } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', link.lender_id)
        .single();

    let resolvedPixKey = lenderSettingsRaw?.pix_key || '';
    let resolvedBeneficiary = lenderSettingsRaw?.pix_beneficiary || '';
    if (!resolvedPixKey && Array.isArray(lenderSettingsRaw?.pix_keys) && lenderSettingsRaw.pix_keys.length > 0) {
        const defKey =
            lenderSettingsRaw.pix_keys.find((k: any) => k.is_default && k.is_active !== false) ||
            lenderSettingsRaw.pix_keys[0];
        resolvedPixKey = defKey?.pix_key || defKey?.key || '';
        resolvedBeneficiary = resolvedBeneficiary || defKey?.holder_name || defKey?.beneficiary || '';
    }

    // 4. Fetch lender name from profiles
    const { data: lenderProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', link.lender_id)
        .single();

    // 5. Fetch fines for this loan
    const { data: fines } = await supabase
        .from('installment_fines')
        .select('*')
        .eq('loan_id', link.loan_id);

    // 6. Fetch pending payment requests
    const { data: paymentRequests } = await supabase
        .from('client_payment_requests')
        .select('*')
        .eq('loan_id', link.loan_id)
        .eq('status', 'pending');

    return {
        link,
        loan,
        lenderSettings: {
            pix_key: resolvedPixKey,
            pix_beneficiary: resolvedBeneficiary,
            city: lenderSettingsRaw?.city || '',
        },
        lenderName: lenderProfile?.full_name || 'Credor',
        fines: fines || [],
        paymentRequests: paymentRequests || [],
    };
};

/**
 * Fetches a portal link data by its token.
 * Uses the SECURITY DEFINER RPC `get_public_loan_portal` so unauthenticated clients
 * can track their loan without requiring RLS read access to private tables.
 */
export const fetchPortalData = async (token: string) => {
    try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_public_loan_portal', {
            p_token: token,
        });

        if (!rpcError) {
            if (!rpcData) return null;
            return {
                link: rpcData.link,
                loan: rpcData.loan,
                lenderSettings: rpcData.lenderSettings || { pix_key: '', pix_beneficiary: '', city: '' },
                lenderName: rpcData.lenderName || 'Credor',
                fines: Array.isArray(rpcData.fines) ? rpcData.fines : [],
                paymentRequests: Array.isArray(rpcData.paymentRequests) ? rpcData.paymentRequests : [],
            };
        }

        if (isMissingRpcError(rpcError)) {
            console.warn('RPC get_public_loan_portal not found yet; falling back to direct queries.');
            return await fetchPortalDataDirect(token);
        }

        console.error('Error in get_public_loan_portal RPC:', rpcError);
        return null;
    } catch (error) {
        console.error('Error fetching portal data:', error);
        return null;
    }
};

/**
 * Creates a payment request from the client portal.
 * Marks the installment as "pending verification".
 */
export const createPaymentRequest = async (
    loanId: string,
    lenderId: string,
    installmentNumber: number,
    amount: number,
    clientName: string,
    portalToken: string
): Promise<{ success: boolean; error?: string; alreadyPending?: boolean }> => {
    try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_public_payment_request', {
            p_token: portalToken,
            p_installment_number: installmentNumber,
            p_amount: amount,
            p_client_name: clientName,
        });

        if (!rpcError) {
            if (rpcData?.ok) {
                return { success: true };
            }
            if (rpcData?.reason === 'already_pending') {
                return { success: true, alreadyPending: true };
            }
            return {
                success: false,
                error: rpcData?.error || 'Não foi possível registrar o pagamento.',
            };
        }

        if (!isMissingRpcError(rpcError)) {
            throw rpcError;
        }

        // Fallback if RPC has not been applied in Supabase yet
        const { data: existing } = await supabase
            .from('client_payment_requests')
            .select('id')
            .eq('loan_id', loanId)
            .eq('installment_number', installmentNumber)
            .eq('status', 'pending')
            .single();

        if (existing) return { success: true, alreadyPending: true };

        const { error } = await supabase
            .from('client_payment_requests')
            .insert({
                loan_id: loanId,
                lender_id: lenderId,
                installment_number: installmentNumber,
                amount,
                client_name: clientName,
                portal_token: portalToken,
                status: 'pending',
            });

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error('Error creating payment request:', error);
        return {
            success: false,
            error: 'Não foi possível enviar a confirmação de pagamento. Tente novamente.',
        };
    }
};
