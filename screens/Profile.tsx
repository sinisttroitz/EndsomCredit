import React, { useState, useEffect } from 'react';
import { LogOut, Edit2, MapPin, CreditCard, ChevronRight, Lock, Save, X, Loader2, Search, Download, FileText, Users, Crown, Clock, AlertTriangle, Bell } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { UserSettings } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ProfileProps {
    onLogout: () => void;
    onNavigate?: (view: any) => void;
    userEmail?: string;
}

import { Profile as UserProfileData } from '../types';

export const Profile: React.FC<ProfileProps> = ({ onLogout, userEmail, onNavigate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showDownloadModal, setShowDownloadModal] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);

    // Password Change State
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [updatingPassword, setUpdatingPassword] = useState(false);

    // Estado local para o CEP e carregamento da busca
    const [cep, setCep] = useState('');
    const [loadingCep, setLoadingCep] = useState(false);

    const [settings, setSettings] = useState<UserSettings>({
        pix_key: '',
        pix_beneficiary: '',
        city: '',
        state: ''
    });

    const [email, setEmail] = useState(userEmail || '');
    const [name, setName] = useState('');

    const [alertModal, setAlertModal] = useState<{
        open: boolean;
        title: string;
        message: string;
        onConfirm?: () => void;
        confirmText?: string;
    }>({ open: false, title: '', message: '' });

    // Fetch initial data
    useEffect(() => {
        fetchSettings();
        if (userEmail) setEmail(userEmail);
    }, [userEmail]);

    const fetchSettings = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setName(user.user_metadata.full_name || '');

                // Fetch Profile info (Subscription)
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (profileData) setUserProfile(profileData);

                const { data, error } = await supabase
                    .from('user_settings')
                    .select('*')
                    .eq('user_id', user.id)
                    .single();

                if (data) {
                    setSettings({
                        pix_key: data.pix_key || '',
                        pix_beneficiary: data.pix_beneficiary || '',
                        city: data.city || '',
                        state: data.state || ''
                    });
                } else if (error && error.code !== 'PGRST116') { // PGRST116 is "not found", which is fine for first run
                    console.error("Error fetching settings:", error);
                }
            }
        } catch (error) {
            console.error("Error:", error);
        } finally {
            setLoading(false);
        }
    };

    const getDaysRemaining = () => {
        if (!userProfile?.access_until) return 0;
        const expiry = new Date(userProfile.access_until);
        const now = new Date();
        const diff = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return diff > 0 ? diff : 0;
    };

    const handleDownloadData = async (format: 'pdf' | 'csv') => {
        setDownloading(true);
        try {
            const { data: loans, error } = await supabase
                .from('loans')
                .select('*, client:clients(name, credit_balance), installment_fines(*)')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!loans || loans.length === 0) {
                setAlertModal({
                    open: true,
                    title: 'Sem Dados',
                    message: 'Nenhum empréstimo encontrado para gerar relatório.'
                });
                return;
            }

            if (format === 'pdf') {
                generatePDF(loans);
            } else {
                generateCSV(loans);
            }
            setShowDownloadModal(false);
        } catch (error) {
            console.error("Erro ao gerar relatório:", error);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: 'Erro ao gerar relatório. Tente novamente.'
            });
        } finally {
            setDownloading(false);
        }
    };

    const generatePDF = (loans: any[]) => {
        const doc = new jsPDF({ orientation: 'landscape' });

        doc.setFontSize(18);
        doc.text("Relatório Detalhado de Empréstimos", 14, 22);

        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 30);
        doc.text(`Usuário: ${name || email}`, 14, 35);

        const tableData = loans.map(loan => {
            const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
            const contractInterest = Math.max(0, totalDebt - loan.amount);
            const lateInterest = Math.max(0, Number(loan.balance) - totalDebt);
            const totalFines = loan.installment_fines?.reduce((acc: number, curr: any) => acc + curr.fine_value, 0) || 0;

            return [
                loan.client?.name || 'Cliente Removido',
                `R$ ${loan.amount.toFixed(2)}`,
                `R$ ${contractInterest.toFixed(2)}`,
                `R$ ${lateInterest.toFixed(2)}`,
                `R$ ${totalFines.toFixed(2)}`,
                loan.frequency || '-',
                loan.installments || 1,
                new Date(loan.created_at).toLocaleDateString('pt-BR'),
                loan.due_date ? new Date(loan.due_date).toLocaleDateString('pt-BR') : '-',
                `R$ ${(loan.client?.credit_balance || 0).toFixed(2)}`,
                `R$ ${(loan.amount_paid || 0).toFixed(2)}`,
                loan.status === 'paid' ? 'Pago' : (loan.status === 'late' ? 'Atrasado' : 'Em Aberto')
            ];
        });

        autoTable(doc, {
            head: [['Cliente', 'Valor Inicial', 'Juros Contrato', 'Juros Atraso', 'Multas', 'Freq.', 'Parc.', 'Data Sol.', 'Venc.', 'Créditos', 'Total Rec.', 'Status']],
            body: tableData,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 35 }, // Cliente
                1: { cellWidth: 20 }, // Valor Inicial
                2: { cellWidth: 20 }, // Juros Contrato
                3: { cellWidth: 20 }, // Juros Atraso
                4: { cellWidth: 15 }, // Multas
                5: { cellWidth: 20 }, // Frequência
                6: { cellWidth: 10 }, // Parcelas
                7: { cellWidth: 20 }, // Data Sol.
                8: { cellWidth: 20 }, // Vencimento
                9: { cellWidth: 20 }, // Créditos
                10: { cellWidth: 20 }, // Total Rec.
                11: { cellWidth: 20 }  // Status
            }
        });

        doc.save('relatorio_emprestimos_detalhado.pdf');
    };

    const generateCSV = (loans: any[]) => {
        const headers = ['Cliente,Valor Inicial,Juros Contrato,Juros Atraso,Multas,Frequência,Parcelas,Data Solicitação,Vencimento,Créditos,Total Recebido,Status'];
        const rows = loans.map(loan => {
            const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
            const contractInterest = Math.max(0, totalDebt - loan.amount);
            const lateInterest = Math.max(0, Number(loan.balance) - totalDebt);
            const totalFines = loan.installment_fines?.reduce((acc: number, curr: any) => acc + curr.fine_value, 0) || 0;

            return [
                `"${loan.client?.name || 'Cliente Removido'}"`,
                `"${loan.amount.toFixed(2).replace('.', ',')}"`,
                `"${contractInterest.toFixed(2).replace('.', ',')}"`,
                `"${lateInterest.toFixed(2).replace('.', ',')}"`,
                `"${totalFines.toFixed(2).replace('.', ',')}"`,
                `"${loan.frequency || '-'}"`,
                `"${loan.installments || 1}"`,
                `"${new Date(loan.created_at).toLocaleDateString('pt-BR')}"`,
                `"${loan.due_date ? new Date(loan.due_date).toLocaleDateString('pt-BR') : '-'}"`,
                `"${(loan.client?.credit_balance || 0).toFixed(2).replace('.', ',')}"`,
                `"${(loan.amount_paid || 0).toFixed(2).replace('.', ',')}"`,
                `"${loan.status === 'paid' ? 'Pago' : (loan.status === 'late' ? 'Atrasado' : 'Em Aberto')}"`
            ];
        });

        const csvContent = [headers, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'relatorio_emprestimos_detalhado.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleUpdatePassword = async () => {
        if (!currentPassword) {
            setAlertModal({
                open: true,
                title: 'Senha Atual',
                message: 'Por favor, insira sua senha atual.'
            });
            return;
        }
        if (newPassword !== confirmPassword) {
            setAlertModal({
                open: true,
                title: 'Senhas Diferentes',
                message: 'As senhas não coincidem.'
            });
            return;
        }
        if (newPassword.length < 6) {
            setAlertModal({
                open: true,
                title: 'Senha Curta',
                message: 'A senha deve ter pelo menos 6 caracteres.'
            });
            return;
        }

        setUpdatingPassword(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || !user.email) throw new Error("Usuário não identificado.");

            // Verify current password by attempting to sign in
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: currentPassword
            });

            if (signInError) {
                throw new Error("A senha atual está incorreta.");
            }

            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;

            setAlertModal({
                open: true,
                title: 'Sucesso',
                message: 'Senha atualizada com sucesso!'
            });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setShowPasswordModal(false);
        } catch (error: any) {
            console.error("Erro ao atualizar senha:", error);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: `Erro ao atualizar senha: ${error.message || error}`
            });
        } finally {
            setUpdatingPassword(false);
        }
    };

    const handleCepChange = async (value: string) => {
        const numericValue = value.replace(/\D/g, '');
        setCep(numericValue);

        if (numericValue.length === 8) {
            setLoadingCep(true);
            try {
                const response = await fetch(`https://viacep.com.br/ws/${numericValue}/json/`);
                const data = await response.json();

                if (!data.erro) {
                    setSettings(prev => ({
                        ...prev,
                        city: data.localidade,
                        state: data.uf
                    }));
                } else {
                    setAlertModal({
                        open: true,
                        title: 'CEP não encontrado',
                        message: 'O CEP informado não foi encontrado.'
                    });
                }
            } catch (error) {
                console.error("Erro ao buscar CEP", error);
                setAlertModal({
                    open: true,
                    title: 'Erro',
                    message: 'Erro ao buscar CEP. Verifique sua conexão.'
                });
            } finally {
                setLoadingCep(false);
            }
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Update email if changed
            if (email !== userEmail) {
                const { error: emailError } = await supabase.auth.updateUser({ email: email });
                if (emailError) throw emailError;
                setAlertModal({
                    open: true,
                    title: 'Email Atualizado',
                    message: 'Email atualizado! Verifique sua caixa de entrada para confirmar a alteração.'
                });
            }

            // Update name if changed
            if (name !== user.user_metadata.full_name) {
                const { error: nameError } = await supabase.auth.updateUser({ data: { full_name: name } });
                if (nameError) throw nameError;
            }

            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    pix_key: settings.pix_key,
                    pix_beneficiary: settings.pix_beneficiary,
                    city: settings.city,
                    state: settings.state,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
            setIsEditing(false);
            setCep(''); // Limpa o CEP após salvar, pois só armazenamos a cidade/uf
        } catch (error: any) {
            console.error("Error saving settings:", error);
            setAlertModal({
                open: true,
                title: 'Erro ao Salvar',
                message: `Erro ao salvar alterações: ${error.message || error}`
            });
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (field: keyof UserSettings, value: string) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

    return (
        <>
            {/* --- MOBILE VIEW --- */}
            <div className="md:hidden flex flex-col h-full bg-background-light dark:bg-background-dark">
                <header className="bg-background-light dark:bg-background-dark px-6 pt-12 pb-4 relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-20 h-20 rounded-full overflow-hidden bg-primary shadow-lg flex items-center justify-center text-2xl font-bold text-white border-2 border-white dark:border-gray-800">
                                {name ? name.charAt(0).toUpperCase() : (userEmail ? userEmail.charAt(0).toUpperCase() : 'A')}
                            </div>
                            {!isEditing && (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="absolute bottom-0 right-0 bg-secondary text-white p-1.5 rounded-full shadow-lg border-2 border-background-light dark:border-background-dark hover:scale-105 transition-transform"
                                >
                                    <Edit2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white capitalize leading-tight">{name || 'Usuário'}</h1>
                            <p className="text-gray-500 text-xs">{userEmail}</p>
                        </div>

                        {userProfile?.is_admin && onNavigate && (
                            <div className="ml-auto flex items-center gap-2">
                                <button
                                    onClick={() => onNavigate('admin-notifications')}
                                    className="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-500 transition-colors shadow-sm"
                                    title="Notificações"
                                >
                                    <Bell className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => onNavigate('admin-users')}
                                    className="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-500 transition-colors shadow-sm"
                                    title="Gestão de Usuários"
                                >
                                    <Users className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                    </div>
                </header>

                <main className="flex-1 px-5 pt-4 pb-32 overflow-y-auto no-scrollbar space-y-6">

                    {isEditing && (
                        <div className="bg-yellow-50 text-yellow-800 p-4 rounded-2xl text-sm flex justify-between items-center border border-yellow-100">
                            <span>Modo de edição ativado</span>
                            <div className="flex gap-2">
                                <button onClick={() => setIsEditing(false)} className="p-2 bg-white rounded-full shadow-sm text-gray-500"><X className="w-4 h-4" /></button>
                                <button onClick={handleSave} disabled={saving} className="p-2 bg-primary text-white rounded-full shadow-sm flex items-center gap-2 px-4">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    <span className="text-xs font-bold">Salvar</span>
                                </button>
                            </div>
                        </div>
                    )}

                    <section>
                        <h3 className="text-xs font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-3 pl-1">Informações Pessoais</h3>
                        <div className="bg-card-light dark:bg-card-dark rounded-2xl p-2 shadow-sm border border-gray-100 dark:border-gray-800">
                            <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                                <div className="w-full">
                                    <p className="text-xs text-gray-400 mb-0.5">Nome</p>
                                    {isEditing ? (
                                        <input
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            placeholder="Seu nome completo"
                                        />
                                    ) : (
                                        <p className="font-semibold text-gray-800 dark:text-white">{name || 'Não informado'}</p>
                                    )}
                                </div>
                                {!isEditing && <Edit2 className="w-4 h-4 text-gray-300" />}
                            </div>
                            <div className="p-3 flex justify-between items-center">
                                <div className="w-full">
                                    <p className="text-xs text-gray-400 mb-0.5">Email</p>
                                    {isEditing ? (
                                        <input
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                    ) : (
                                        <p className="font-semibold text-gray-800 dark:text-white">{email}</p>
                                    )}
                                </div>
                                {!isEditing && <Lock className="w-4 h-4 text-gray-300" />}
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-xs font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-3 pl-1">Dados de Pagamento</h3>
                        <div className="bg-card-light dark:bg-card-dark rounded-2xl p-2 shadow-sm border border-gray-100 dark:border-gray-800">
                            <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                                <div className="w-full">
                                    <p className="text-xs text-gray-400 mb-0.5">Chave PIX</p>
                                    {isEditing ? (
                                        <input
                                            value={settings.pix_key}
                                            onChange={(e) => handleChange('pix_key', e.target.value)}
                                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            placeholder="CPF, Email ou Aleatória"
                                        />
                                    ) : (
                                        <p className="font-semibold text-gray-800 dark:text-white">{settings.pix_key || 'Não definida'}</p>
                                    )}
                                </div>
                                {!isEditing && (
                                    <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg ml-3">
                                        <CreditCard className="w-4 h-4 text-gray-500" />
                                    </div>
                                )}
                            </div>
                            <div className="p-3 flex justify-between items-center">
                                <div className="w-full">
                                    <p className="text-xs text-gray-400 mb-0.5">Beneficiário PIX</p>
                                    {isEditing ? (
                                        <input
                                            value={settings.pix_beneficiary}
                                            onChange={(e) => handleChange('pix_beneficiary', e.target.value)}
                                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            placeholder="Nome completo"
                                        />
                                    ) : (
                                        <p className="font-semibold text-gray-800 dark:text-white">{settings.pix_beneficiary || 'Não definido'}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-xs font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-3 pl-1">Localização</h3>
                        <div className="bg-card-light dark:bg-card-dark rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-center">
                            <div className="w-full">
                                <p className="text-xs text-gray-400 mb-1.5 flex justify-between">
                                    <span>Cidade / Estado</span>
                                    {!isEditing && <MapPin className="w-3 h-3 text-gray-300" />}
                                </p>

                                {isEditing ? (
                                    <div className="space-y-3">
                                        {/* Busca por CEP */}
                                        <div className="relative">
                                            <input
                                                value={cep}
                                                onChange={(e) => handleCepChange(e.target.value)}
                                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-10 py-2 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                                placeholder="Digite o CEP"
                                                maxLength={8}
                                            />
                                            <div className="absolute right-3 top-2.5">
                                                {loadingCep ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Search className="w-4 h-4 text-gray-400" />}
                                            </div>
                                        </div>

                                        {/* Resultados Auto-preenchidos */}
                                        <div className="flex gap-2">
                                            <input
                                                value={settings.city}
                                                onChange={(e) => handleChange('city', e.target.value)}
                                                className="flex-1 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm font-semibold text-primary dark:text-white outline-none opacity-80"
                                                placeholder="Cidade"
                                                readOnly={true} // Sugerido manter apenas leitura se a ideia é só usar o CEP, mas deixei onChange caso queira permitir edição manual
                                            />
                                            <input
                                                value={settings.state}
                                                onChange={(e) => handleChange('state', e.target.value)}
                                                className="w-16 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm font-semibold text-primary dark:text-white outline-none opacity-80"
                                                placeholder="UF"
                                                readOnly={true}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <p className="font-semibold text-gray-800 dark:text-white text-base">
                                        {settings.city ? `${settings.city}, ${settings.state}` : 'Não informado'}
                                    </p>
                                )}
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-xs font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-3 pl-1">Segurança</h3>
                        <button
                            onClick={() => setShowPasswordModal(true)}
                            className="w-full bg-card-light dark:bg-card-dark rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex justify-between items-center group active:scale-[0.99] transition-transform"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300">
                                    <Lock className="w-5 h-5" />
                                </div>
                                <span className="font-semibold text-gray-800 dark:text-white">Trocar Senha</span>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-300" />
                        </button>

                        <button
                            onClick={() => setShowDownloadModal(true)}
                            className="w-full bg-card-light dark:bg-card-dark rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex justify-between items-center group active:scale-[0.99] transition-transform mt-3"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300">
                                    <Download className="w-5 h-5" />
                                </div>
                                <span className="font-semibold text-gray-800 dark:text-white">Baixar Dados</span>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-300" />
                        </button>
                    </section>

                    <div className="text-center pt-4 pb-8">
                        <button onClick={onLogout} className="text-red-500 text-sm font-semibold hover:underline">Sair da conta</button>
                        <p className="text-[10px] text-gray-400 mt-2">Versão 2.7.0</p>
                    </div>
                </main>
            </div>

            {/* --- DESKTOP VIEW --- */}
            <div className="hidden md:flex flex-col flex-1 p-8 overflow-y-auto no-scrollbar bg-gray-50 dark:bg-[#0B0B0F]">
                <div className="max-w-[1200px] w-full mx-auto space-y-8">
                    {/* Header Desktop */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Configurações</h1>
                            <p className="text-sm font-medium text-gray-500 mt-1">Gerencie sua conta e preferências do sistema.</p>
                        </div>
                        <div className="flex gap-3">
                            {userProfile?.is_admin && onNavigate && (
                                <>
                                    <button onClick={() => onNavigate('admin-notifications')} className="px-5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-2">
                                        <Bell className="w-4 h-4" /> Notificações
                                    </button>
                                    <button onClick={() => onNavigate('admin-users')} className="px-5 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-2">
                                        <Users className="w-4 h-4" /> Gestão de Usuários
                                    </button>
                                </>
                            )}

                        </div>
                    </div>

                    {isEditing && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-500 p-4 rounded-xl text-sm flex justify-between items-center border border-yellow-200 dark:border-yellow-900/50 shadow-sm">
                            <span className="font-bold flex items-center gap-2"><Edit2 className="w-4 h-4" /> Modo de edição ativado</span>
                            <div className="flex gap-3">
                                <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-colors">Cancelar</button>
                                <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg shadow-sm flex items-center gap-2 font-bold hover:bg-primary/90 transition-colors">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Salvar Alterações
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left Column - Profile Summary */}
                        <div className="lg:col-span-1 space-y-6">
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center text-center relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-10 -mt-10"></div>

                                <div className="w-24 h-24 rounded-full border-4 border-gray-50 dark:border-gray-900 bg-gradient-to-br from-primary to-blue-600 shadow-xl flex items-center justify-center text-3xl font-black text-white relative z-10 mb-4">
                                    {userEmail ? userEmail.charAt(0).toUpperCase() : 'A'}
                                    {!isEditing && (
                                        <button onClick={() => setIsEditing(true)} className="absolute bottom-0 right-0 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 p-2 rounded-full shadow-lg border border-gray-200 dark:border-gray-600 hover:scale-110 transition-transform">
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                <h2 className="text-xl font-bold text-gray-900 dark:text-white relative z-10">{name || 'Administrador'}</h2>
                                <p className="text-sm font-medium text-gray-500 relative z-10 mb-6">{email}</p>

                                <div className="w-full pt-6 border-t border-gray-100 dark:border-gray-700 text-left space-y-4 relative z-10">
                                    <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest pl-1">Ações Rápidas</h3>

                                    <button onClick={() => setShowPasswordModal(true)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group/btn">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 group-hover/btn:scale-110 transition-transform">
                                                <Lock className="w-4 h-4" />
                                            </div>
                                            <span className="font-bold text-sm text-gray-700 dark:text-gray-200">Trocar Senha</span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                                    </button>

                                    <button onClick={() => setShowDownloadModal(true)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group/btn">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 group-hover/btn:scale-110 transition-transform">
                                                <Download className="w-4 h-4" />
                                            </div>
                                            <span className="font-bold text-sm text-gray-700 dark:text-gray-200">Baixar Dados</span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Right Column - Forms */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Info Pessoal */}
                            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6 relative overflow-hidden">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1.5 h-6 bg-primary rounded-full"></div>
                                    <h3 className="text-lg font-black text-gray-900 dark:text-white">Informações Pessoais</h3>
                                </div>

                                <div className="grid grid-cols-2 gap-6 relative z-10">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Nome Completo</label>
                                        {isEditing ? (
                                            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all" placeholder="Seu nome" />
                                        ) : (
                                            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-gray-900 dark:text-gray-200 font-medium text-sm border border-transparent">{name || 'Não informado'}</div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Email de Acesso</label>
                                        {isEditing ? (
                                            <input value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                                        ) : (
                                            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-gray-900 dark:text-gray-200 font-medium text-sm flex justify-between items-center border border-transparent">
                                                {email} <Lock className="w-3.5 h-3.5 text-gray-400" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* PIX e Localização */}
                            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6 relative overflow-hidden">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div>
                                    <h3 className="text-lg font-black text-gray-900 dark:text-white">Financeiro e Endereço</h3>
                                </div>

                                <div className="grid grid-cols-2 gap-8 relative z-10">
                                    <div className="space-y-5">
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Chave PIX (Para Recebimentos)</label>
                                            {isEditing ? (
                                                <input value={settings.pix_key} onChange={e => handleChange('pix_key', e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all" placeholder="CPF, Email, Celular..." />
                                            ) : (
                                                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-gray-900 dark:text-gray-200 font-medium text-sm flex justify-between items-center border border-transparent">
                                                    {settings.pix_key || 'Não definida'} <CreditCard className="w-4 h-4 text-gray-400" />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Nome do Beneficiário PIX</label>
                                            {isEditing ? (
                                                <input value={settings.pix_beneficiary} onChange={e => handleChange('pix_beneficiary', e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all" placeholder="Nome completo" />
                                            ) : (
                                                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-gray-900 dark:text-gray-200 font-medium text-sm border border-transparent">{settings.pix_beneficiary || 'Não definido'}</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-5">
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Buscar CEP</label>
                                            {isEditing ? (
                                                <div className="relative">
                                                    <input value={cep} onChange={e => handleCepChange(e.target.value)} maxLength={8} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all" placeholder="00000000" />
                                                    <div className="absolute right-3 top-3">
                                                        {loadingCep ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Search className="w-4 h-4 text-gray-400" />}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-gray-400 italic text-sm border border-transparent">Disponível em modo de edição</div>
                                            )}
                                        </div>

                                        <div className="flex gap-4">
                                            <div className="flex-1">
                                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block flex items-center justify-between">Cidade <MapPin className="w-3 h-3" /></label>
                                                <div className={`p-3 rounded-xl font-medium text-sm border border-transparent ${isEditing ? 'bg-gray-100 dark:bg-gray-800 text-gray-500' : 'bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-gray-200'}`}>
                                                    {settings.city || '---'}
                                                </div>
                                            </div>
                                            <div className="w-20">
                                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">UF</label>
                                                <div className={`p-3 rounded-xl font-medium text-center text-sm border border-transparent ${isEditing ? 'bg-gray-100 dark:bg-gray-800 text-gray-500' : 'bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-gray-200'}`}>
                                                    {settings.state || '--'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                    {/* Version Text Desktop */}
                    <div className="text-center pt-2 pb-8">
                        <p className="text-[10px] text-gray-400">Versão 2.7.0</p>
                    </div>
                </div>
            </div>

            {showPasswordModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPasswordModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Trocar Senha</h3>
                            <button onClick={() => setShowPasswordModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Senha Atual</label>
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="Sua senha atual"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Nova Senha</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="Mínimo 6 caracteres"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Confirmar Senha</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="Repita a nova senha"
                                />
                            </div>

                            <button
                                onClick={handleUpdatePassword}
                                disabled={updatingPassword || !newPassword || !confirmPassword}
                                className="w-full bg-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                            >
                                {updatingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                                Atualizar Senha
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDownloadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDownloadModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200 overflow-hidden">
                        
                        {/* Header */}
                        <div className="bg-gray-900 dark:bg-gray-800 px-6 py-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-white">Exportar Relatório</h3>
                                <p className="text-[10px] text-gray-400 mt-0.5">Relatório completo de empréstimos</p>
                            </div>
                            <button onClick={() => setShowDownloadModal(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                                <X className="w-4 h-4 text-gray-400" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-5 space-y-3">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Selecione o formato</p>
                            
                            {/* PDF Option */}
                            <button
                                onClick={() => handleDownloadData('pdf')}
                                disabled={downloading}
                                className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center gap-4 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-750 transition-all text-left group active:scale-[0.98]"
                            >
                                <div className="w-11 h-11 bg-white dark:bg-gray-700 rounded-xl flex items-center justify-center border border-gray-200 dark:border-gray-600 shadow-sm group-hover:shadow-md transition-shadow">
                                    <span className="text-[10px] font-black text-red-500 uppercase tracking-wide">.PDF</span>
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-sm text-gray-900 dark:text-white">Documento PDF</h4>
                                    <p className="text-[11px] text-gray-400 mt-0.5">Ideal para impressão e arquivamento</p>
                                </div>
                                {downloading ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                ) : (
                                    <Download className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                                )}
                            </button>

                            {/* CSV Option */}
                            <button
                                onClick={() => handleDownloadData('csv')}
                                disabled={downloading}
                                className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center gap-4 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-750 transition-all text-left group active:scale-[0.98]"
                            >
                                <div className="w-11 h-11 bg-white dark:bg-gray-700 rounded-xl flex items-center justify-center border border-gray-200 dark:border-gray-600 shadow-sm group-hover:shadow-md transition-shadow">
                                    <span className="text-[10px] font-black text-green-600 uppercase tracking-wide">.CSV</span>
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-sm text-gray-900 dark:text-white">Planilha CSV</h4>
                                    <p className="text-[11px] text-gray-400 mt-0.5">Compatível com Excel e Google Sheets</p>
                                </div>
                                {downloading ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                ) : (
                                    <Download className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                                )}
                            </button>
                        </div>

                        {/* Footer */}
                        <div className="px-5 pb-5 pt-1">
                            <button 
                                onClick={() => setShowDownloadModal(false)}
                                className="w-full py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Alert Modal */}
            {alertModal.open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAlertModal(prev => ({ ...prev, open: false }))}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle className="w-8 h-8 text-yellow-600 dark:text-yellow-500" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{alertModal.title}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {alertModal.message}
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setAlertModal(prev => ({ ...prev, open: false }))}
                                className={`flex-1 py-3 px-4 rounded-xl font-bold transition-colors ${alertModal.onConfirm ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700' : 'bg-primary text-white hover:bg-primary/90'}`}
                            >
                                Entendi
                            </button>
                            {alertModal.onConfirm && (
                                <button
                                    onClick={alertModal.onConfirm}
                                    className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-primary hover:bg-primary/90 transition-colors"
                                >
                                    {alertModal.confirmText || 'Confirmar'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};