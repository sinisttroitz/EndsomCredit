import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Camera, Loader2, AlertCircle, Trash2, X, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { compressImage } from '@/utils/imageUtils';
import { Client } from '../types';

interface EditClientProps {
    clientId: string | null;
    onBack: () => void;
    onSuccess: () => void;
    onDelete: () => void;
}

export const EditClient: React.FC<EditClientProps> = ({ clientId, onBack, onSuccess, onDelete }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Delete states
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Form fields
    const [name, setName] = useState('');
    const [cpf, setCpf] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [cep, setCep] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [address, setAddress] = useState('');
    const [number, setNumber] = useState('');
    const [complement, setComplement] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    
    // File upload
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);

    // Helpers de máscara
    const maskCPF = (value: string) => value.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').replace(/(-\d{2})\d+?$/, '$1');
    const maskPhone = (value: string) => value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').replace(/(-\d{4})\d+?$/, '$1');
    const maskCEP = (value: string) => value.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').replace(/(-\d{3})\d+?$/, '$1');

    useEffect(() => {
        if (clientId) {
            fetchClientData(clientId);
        }
    }, [clientId]);

    const fetchClientData = async (id: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('clients').select('*').eq('id', id).single();
            if (error) throw error;
            if (data) {
                setName(data.name || '');
                setCpf(data.cpf || '');
                setPhone(data.phone || '');
                setEmail(data.email || '');
                setCep(data.cep || '');
                setCity(data.city || '');
                setState(data.state || '');
                setAddress(data.address || '');
                setNumber(data.number || '');
                setComplement(data.complement || '');
                setAvatarUrl(data.avatar_url || '');
            }
        } catch (err: any) {
            console.error(err);
            setError("Erro ao carregar dados do cliente.");
        } finally {
            setLoading(false);
        }
    };

    const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value;
        const formatted = maskCEP(rawValue);
        setCep(formatted);
        const numeric = rawValue.replace(/\D/g, '');
        if (numeric.length === 8) {
            try {
                const res = await fetch(`https://viacep.com.br/ws/${numeric}/json/`);
                const data = await res.json();
                if (!data.erro) {
                    setCity(data.localidade);
                    setState(data.uf);
                    setAddress(data.logradouro);
                }
            } catch (e) {
                console.error("Erro no CEP", e);
            }
        }
    };

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const uploadFile = async (file: File): Promise<string | null> => {
        try {
            const ext = file.name.split('.').pop();
            const fileName = `avatars/${Date.now()}.${ext}`;
            const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, file, { upsert: true });
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(fileName);
            return publicUrl;
        } catch (e) {
            console.error("Upload error:", e);
            return null;
        }
    };

    const handleSave = async () => {
        if (!clientId || !name) return;
        setSaving(true);
        
        try {
            let finalAvatarUrl = avatarUrl;
            
            if (photoFile) {
                const compressedPhoto = await compressImage(photoFile);
                const uploaded = await uploadFile(compressedPhoto);
                if (uploaded) finalAvatarUrl = uploaded;
            }

            const { error: updateError } = await supabase.from('clients').update({
                name,
                cpf,
                phone,
                email,
                cep,
                city,
                state,
                address,
                number,
                complement,
                avatar_url: finalAvatarUrl
            }).eq('id', clientId);

            if (updateError) throw updateError;
            onSuccess();
        } catch (err: any) {
            console.error(err);
            setError("Erro ao salvar alterações.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletePassword) {
            setDeleteError("Por favor, digite sua senha.");
            return;
        }
        setDeleting(true);
        setDeleteError(null);

        try {
            // 1. Verificar senha do usuário atual
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || !user.email) throw new Error("Usuário não autenticado.");

            const { error: authError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: deletePassword
            });

            if (authError) {
                throw new Error("Senha incorreta.");
            }

            // 2. Excluir empréstimos vinculados (opcional, dependendo da regra de negócio, aqui assumimos limpar tudo)
            const { error: loansError } = await supabase.from('loans').delete().eq('client_id', clientId);
            if (loansError) {
                console.error("Erro ao excluir empréstimos:", loansError);
                throw new Error("Erro ao excluir empréstimos vinculados.");
            }

            // 3. Excluir cliente
            const { error: deleteError } = await supabase.from('clients').delete().eq('id', clientId);
            
            if (deleteError) throw deleteError;

            // Fechar modal e chamar callback
            setShowDeleteModal(false);
            onDelete();

        } catch (err: any) {
            console.error(err);
            setDeleteError(err.message || "Erro ao excluir cliente.");
        } finally {
            setDeleting(false);
        }
    };

    if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark relative">
            <header className="sticky top-0 z-50 bg-black text-white px-6 pt-10 pb-12 rounded-b-[40px]">
                <div className="max-w-md mx-auto flex items-center justify-between">
                    <button onClick={onBack} className="flex items-center justify-center p-2 hover:bg-white/10 rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-lg font-bold flex-1 text-center pr-10">Editar Cadastro</h1>
                </div>
            </header>

            <main className="flex-1 max-w-md mx-auto pb-48 overflow-y-auto no-scrollbar w-full">
                {error && (
                    <div className="m-4 bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-2 text-sm border border-red-100">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {/* Profile Picture Section */}
                <section className="flex flex-col items-center py-8">
                    <div className="relative group cursor-pointer" onClick={() => photoInputRef.current?.click()}>
                        <div className="w-32 h-32 rounded-full border-4 border-white dark:border-gray-800 shadow-xl overflow-hidden bg-gray-200 dark:bg-gray-700">
                            {photoPreview ? (
                                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                            ) : avatarUrl ? (
                                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl text-gray-400 font-bold">{name.substring(0,2).toUpperCase()}</div>
                            )}
                        </div>
                        <button className="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full shadow-lg border-2 border-white dark:border-background-dark flex items-center justify-center hover:scale-105 transition-transform">
                            <Camera className="w-4 h-4" />
                        </button>
                        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                    </div>
                    <p className="mt-4 text-gray-500 dark:text-gray-400 text-sm font-medium">Toque para alterar foto</p>
                </section>

                <div className="px-4 space-y-6">
                    {/* Personal Data */}
                    <div className="bg-white dark:bg-card-dark rounded-xl p-5 shadow-sm space-y-4 border border-gray-100 dark:border-gray-800">
                        <h2 className="text-xs font-bold text-primary tracking-widest uppercase">Dados Pessoais</h2>
                        <div className="space-y-4">
                            <label className="block">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Nome Completo</span>
                                <input 
                                    className="mt-1 block w-full rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:ring-primary h-12 px-4 text-base transition-all" 
                                    type="text" 
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                />
                            </label>
                            <label className="block">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">CPF</span>
                                <input 
                                    className="mt-1 block w-full rounded-lg border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-gray-500 h-12 px-4 text-base cursor-not-allowed" 
                                    type="text" 
                                    value={cpf}
                                    onChange={e => setCpf(maskCPF(e.target.value))}
                                    disabled
                                />
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label className="block">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Telefone</span>
                                    <input 
                                        className="mt-1 block w-full rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:ring-primary h-12 px-4 text-base" 
                                        type="tel" 
                                        value={phone}
                                        onChange={e => setPhone(maskPhone(e.target.value))}
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">E-mail</span>
                                    <input 
                                        className="mt-1 block w-full rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:ring-primary h-12 px-4 text-base" 
                                        type="email" 
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Address Section */}
                    <div className="bg-white dark:bg-card-dark rounded-xl p-5 shadow-sm space-y-4 border border-gray-100 dark:border-gray-800">
                        <h2 className="text-xs font-bold text-primary tracking-widest uppercase">Endereço</h2>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <label className="block">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">CEP</span>
                                    <input 
                                        className="mt-1 block w-full rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:ring-primary h-12 px-4 text-base" 
                                        type="text" 
                                        value={cep}
                                        onChange={handleCepChange}
                                        maxLength={9}
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Cidade - UF</span>
                                    <input 
                                        className="mt-1 block w-full rounded-lg border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-black dark:text-white opacity-80 h-12 px-4 text-base" 
                                        type="text" 
                                        value={city && state ? `${city} - ${state}` : ''}
                                        readOnly
                                    />
                                </label>
                            </div>
                            <label className="block">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Logradouro</span>
                                <input 
                                    className="mt-1 block w-full rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:ring-primary h-12 px-4 text-base" 
                                    type="text" 
                                    value={address}
                                    onChange={e => setAddress(e.target.value)}
                                    placeholder="Rua, Avenida..."
                                />
                            </label>
                            <div className="grid grid-cols-3 gap-4">
                                <label className="block col-span-1">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Número</span>
                                    <input 
                                        className="mt-1 block w-full rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:ring-primary h-12 px-4 text-base" 
                                        type="text" 
                                        value={number}
                                        onChange={e => setNumber(e.target.value)}
                                    />
                                </label>
                                <label className="block col-span-2">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Complemento</span>
                                    <input 
                                        className="mt-1 block w-full rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:ring-primary h-12 px-4 text-base" 
                                        type="text" 
                                        value={complement}
                                        onChange={e => setComplement(e.target.value)}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Sticky Bottom Buttons */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 z-30 flex flex-col gap-3">
                <div className="max-w-md mx-auto w-full space-y-3">
                    <button 
                        onClick={handleSave}
                        disabled={saving || deleting}
                        className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                        {saving ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
                        Salvar Alterações
                    </button>
                    
                    <button 
                        onClick={() => setShowDeleteModal(true)}
                        disabled={saving || deleting}
                        className="w-full bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold py-3 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-red-200 dark:border-red-900/30"
                    >
                        <Trash2 className="w-4 h-4" />
                        Excluir Cliente
                    </button>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <button onClick={() => setShowDeleteModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <X className="w-5 h-5" />
                        </button>
                        
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-500" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Excluir Cliente?</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Esta ação não pode ser desfeita. Todos os dados e empréstimos deste cliente serão apagados.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                                    Confirme sua senha
                                </label>
                                <input 
                                    type="password"
                                    value={deletePassword}
                                    onChange={(e) => setDeletePassword(e.target.value)}
                                    className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none transition-all"
                                    placeholder="Sua senha de login"
                                />
                            </div>

                            {deleteError && (
                                <p className="text-xs text-red-600 font-medium bg-red-50 dark:bg-red-900/20 p-2 rounded-lg text-center">
                                    {deleteError}
                                </p>
                            )}

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button 
                                    onClick={() => setShowDeleteModal(false)}
                                    className="py-3 px-4 rounded-xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="py-3 px-4 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 disabled:opacity-70 transition-colors"
                                >
                                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};