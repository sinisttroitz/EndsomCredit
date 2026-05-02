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

/**
 * Fetches a portal link data by its token.
 * Used by the public client portal page.
 */
export const fetchPortalData = async (token: string) => {
    try {
        // 1. Fetch the portal link
        const { data: link, error: linkError } = await supabase
            .from('client_portal_links')
            .select('*')
            .eq('token', token)
            .eq('is_active', true)
            .single();

        if (linkError || !link) return null;

        // 2. Fetch the loan data with client info
        const { data: loan, error: loanError } = await supabase
            .from('loans')
            .select('*, client:clients(name, phone, credit_balance)')
            .eq('id', link.loan_id)
            .single();

        if (loanError || !loan) return null;

        // 3. Fetch lender settings (PIX key, name, city)
        const { data: lenderSettings } = await supabase
            .from('user_settings')
            .select('pix_key, pix_beneficiary, city')
            .eq('user_id', link.lender_id)
            .single();

        // 4. Fetch lender name from auth metadata
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
            lenderSettings: lenderSettings || { pix_key: '', pix_beneficiary: '', city: '' },
            lenderName: lenderProfile?.full_name || 'Credor',
            fines: fines || [],
            paymentRequests: paymentRequests || [],
        };
    } catch (error) {
        console.error('Error fetching portal data:', error);
        return null;
    }
};

/**
 * Creates a payment request from the client portal.
 * This marks the installment as "pending verification".
 */
export const createPaymentRequest = async (
    loanId: string,
    lenderId: string,
    installmentNumber: number,
    amount: number,
    clientName: string,
    portalToken: string
): Promise<boolean> => {
    try {
        // Check if there's already a pending request for this installment
        const { data: existing } = await supabase
            .from('client_payment_requests')
            .select('id')
            .eq('loan_id', loanId)
            .eq('installment_number', installmentNumber)
            .eq('status', 'pending')
            .single();

        if (existing) return false; // Already has a pending request

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
        return true;
    } catch (error) {
        console.error('Error creating payment request:', error);
        return false;
    }
};
