import { supabase } from '../supabaseClient';

/**
 * Generates a cryptographically random token for registration links.
 */
const generateToken = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(20);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => chars[byte % chars.length]).join('');
};

/**
 * Creates or retrieves the registration link for a lender.
 * Each lender has only ONE reusable link.
 */
export const getOrCreateRegistrationLink = async (lenderId: string): Promise<string | null> => {
    try {
        // Check if a link already exists
        const { data: existing } = await supabase
            .from('client_registration_links')
            .select('token, is_active')
            .eq('lender_id', lenderId)
            .single();

        if (existing) {
            if (!existing.is_active) {
                await supabase
                    .from('client_registration_links')
                    .update({ is_active: true })
                    .eq('lender_id', lenderId);
            }
            return existing.token;
        }

        // Generate a new link
        const token = generateToken();
        const { error } = await supabase
            .from('client_registration_links')
            .insert({ token, lender_id: lenderId });

        if (error) throw error;
        return token;
    } catch (error) {
        console.error('Error creating registration link:', error);
        return null;
    }
};

/**
 * Fetches registration link data by token (public access).
 * Returns lender info for the registration page header.
 */
export const fetchRegistrationData = async (token: string) => {
    try {
        const { data: link, error: linkError } = await supabase
            .from('client_registration_links')
            .select('*')
            .eq('token', token)
            .eq('is_active', true)
            .single();

        if (linkError || !link) return null;

        // Fetch lender profile for display
        const { data: lenderProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', link.lender_id)
            .single();

        // Count pending registrations
        const { count } = await supabase
            .from('client_registrations')
            .select('*', { count: 'exact', head: true })
            .eq('lender_id', link.lender_id)
            .eq('status', 'pending');

        return {
            link,
            lenderName: lenderProfile?.full_name || 'Credor',
            pendingCount: count || 0,
            maxPending: link.max_pending || 50,
        };
    } catch (error) {
        console.error('Error fetching registration data:', error);
        return null;
    }
};

/**
 * Submits a client pre-registration (public access).
 */
export const submitRegistration = async (
    lenderId: string,
    registrationToken: string,
    clientData: {
        name: string;
        cpf?: string;
        phone?: string;
        email?: string;
        birthdate?: string;
        cep?: string;
        city?: string;
        state?: string;
        address?: string;
        number?: string;
        complement?: string;
        avatar_url?: string;
        documents?: string[];
    }
): Promise<{ success: boolean; error?: string }> => {
    try {
        // Check for duplicate CPF for this lender
        if (clientData.cpf) {
            const { data: existingReg } = await supabase
                .from('client_registrations')
                .select('id')
                .eq('lender_id', lenderId)
                .eq('cpf', clientData.cpf)
                .eq('status', 'pending')
                .single();

            if (existingReg) {
                return { success: false, error: 'Já existe um cadastro pendente com este CPF.' };
            }
        }

        const { error } = await supabase
            .from('client_registrations')
            .insert({
                lender_id: lenderId,
                registration_token: registrationToken,
                ...clientData,
                status: 'pending',
            });

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error('Error submitting registration:', error);
        return { success: false, error: error.message || 'Erro ao enviar cadastro.' };
    }
};

/**
 * Fetches all pending registrations for a lender (authenticated).
 */
export const fetchPendingRegistrations = async (lenderId: string) => {
    try {
        const { data, error } = await supabase
            .from('client_registrations')
            .select('*')
            .eq('lender_id', lenderId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching registrations:', error);
        return [];
    }
};

/**
 * Approves a registration: creates a real client and marks registration as approved.
 */
export const approveRegistration = async (registration: any): Promise<boolean> => {
    try {
        // 1. Create the actual client
        const { error: insertError } = await supabase
            .from('clients')
            .insert({
                name: registration.name,
                cpf: registration.cpf,
                phone: registration.phone,
                email: registration.email,
                birthdate: registration.birthdate,
                cep: registration.cep,
                city: registration.city,
                state: registration.state,
                address: registration.address,
                number: registration.number,
                complement: registration.complement,
                avatar_url: registration.avatar_url,
                documents: registration.documents || [],
                user_id: registration.lender_id,
                status: 'active',
            });

        if (insertError) throw insertError;

        // 2. Mark the registration as approved
        await supabase
            .from('client_registrations')
            .update({ status: 'approved', reviewed_at: new Date().toISOString() })
            .eq('id', registration.id);

        return true;
    } catch (error) {
        console.error('Error approving registration:', error);
        return false;
    }
};

/**
 * Rejects a registration with an optional reason.
 */
export const rejectRegistration = async (registrationId: string, reason?: string): Promise<boolean> => {
    try {
        await supabase
            .from('client_registrations')
            .update({
                status: 'rejected',
                reviewed_at: new Date().toISOString(),
                rejection_reason: reason || null,
            })
            .eq('id', registrationId);

        return true;
    } catch (error) {
        console.error('Error rejecting registration:', error);
        return false;
    }
};

/**
 * Uploads a file to Supabase storage (public access for registration).
 */
export const uploadRegistrationFile = async (file: File, path: string): Promise<string | null> => {
    try {
        const { error } = await supabase.storage
            .from('documents')
            .upload(path, file, { upsert: true });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
            .from('documents')
            .getPublicUrl(path);

        return publicUrl;
    } catch (error) {
        console.error('Error uploading file:', error);
        return null;
    }
};
