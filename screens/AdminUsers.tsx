import React, { useState, useEffect } from 'react';
import { Users, Calendar, Clock, CheckCircle2, AlertCircle, ChevronLeft, Search, RefreshCw, Crown, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface Profile {
    id: string;
    email: string;
    full_name: string;
    access_until: string;
    is_admin: boolean;
    created_at: string;
}

interface AdminUsersProps {
    onBack: () => void;
}

export const AdminUsers: React.FC<AdminUsersProps> = ({ onBack }) => {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [updating, setUpdating] = useState<string | null>(null);

    const [alertModal, setAlertModal] = useState<{
        open: boolean;
        title: string;
        message: string;
        onConfirm?: () => void;
        confirmText?: string;
    }>({ open: false, title: '', message: '' });

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setProfiles(data || []);
        } catch (err) {
            console.error("Error fetching profiles:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfiles();
    }, []);

    const handleRenewAccess = async (profileId: string, currentAccessUntil: string) => {
        setUpdating(profileId);
        try {
            const current = new Date(currentAccessUntil);
            const now = new Date();
            
            // If already expired, start from now. If not, add to current expiry.
            const baseDate = current > now ? current : now;
            const newExpiry = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

            const { data, error } = await supabase
                .from('profiles')
                .update({ 
                    access_until: newExpiry.toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', profileId)
                .select();

            if (error) throw error;
            
            if (!data || data.length === 0) {
                // RLS possivelmente bloqueou a atualização (0 linhas afetadas)
                throw new Error("Acesso negado ou registro não atualizado no banco (possível bloqueio de segurança/RLS).");
            }
            
            // Refresh local state
            setProfiles(profiles.map(p => 
                p.id === profileId ? { ...p, access_until: newExpiry.toISOString() } : p
            ));
        } catch (err) {
            console.error("Error updating access:", err);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: 'Erro ao renovar acesso'
            });
        } finally {
            setUpdating(null);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const getStatusInfo = (expiryDate: string, isAdmin: boolean) => {
        if (isAdmin) return { label: 'Admin', color: 'text-purple-500 bg-purple-50', icon: Crown };
        
        const expiry = new Date(expiryDate);
        const now = new Date();
        const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { label: 'Expirado', color: 'text-red-500 bg-red-50', icon: AlertCircle };
        if (diffDays <= 7) return { label: `${diffDays} dias`, color: 'text-amber-500 bg-amber-50', icon: Clock };
        return { label: 'Ativo', color: 'text-green-500 bg-green-50', icon: CheckCircle2 };
    };

    const filteredProfiles = profiles.filter(p => 
        (p.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (p.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    return (
        <>
        <div className="md:hidden flex flex-col h-full bg-[#F8F9FA]">
            {/* Header */}
            <header className="bg-black text-white px-6 pt-12 pb-16 sticky top-0 z-10 rounded-b-[40px]">
                <div className="flex items-center justify-between mb-8">
                    <button 
                        onClick={onBack}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-xl font-bold">Gestão de Usuários</h1>
                    <button 
                        onClick={fetchProfiles}
                        className={`p-2 hover:bg-white/10 rounded-xl transition-colors ${loading ? 'animate-spin' : ''}`}
                    >
                        <RefreshCw className="w-5 h-5" />
                    </button>
                </div>

                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="w-5 h-5 text-white/40" />
                    </div>
                    <input 
                        type="text" 
                        placeholder="Buscar por nome ou e-mail..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white/10 border-transparent rounded-2xl py-4 pl-12 pr-4 text-white placeholder-white/40 focus:bg-white/20 focus:ring-0 outline-none transition-all"
                    />
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 px-6 -mt-8 pb-32 overflow-y-auto no-scrollbar">
                {loading && profiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-40">
                        <RefreshCw className="w-10 h-10 animate-spin mb-4" />
                        <p className="text-sm font-medium">Carregando usuários...</p>
                    </div>
                ) : filteredProfiles.length === 0 ? (
                    <div className="bg-white rounded-3xl p-12 text-center shadow-sm border border-gray-100 mt-4">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Users className="w-10 h-10 text-gray-300" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-1">Nenhum usuário encontrado</h3>
                        <p className="text-sm text-gray-500">Tente ajustar sua busca ou verifique o painel do Supabase.</p>
                    </div>
                ) : (
                    <div className="space-y-4 pt-4">
                        {filteredProfiles.map((profile) => {
                            const status = getStatusInfo(profile.access_until, profile.is_admin);
                            const StatusIcon = status.icon;

                            return (
                                <div key={profile.id} className="bg-white rounded-[2rem] p-5 shadow-sm border border-gray-100 flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center font-bold text-gray-400">
                                                {profile.full_name?.charAt(0) || profile.email?.charAt(0)}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-gray-900 truncate max-w-[150px]">
                                                    {profile.full_name || 'Usuário'}
                                                </h4>
                                                <p className="text-xs text-gray-500 truncate max-w-[150px]">
                                                    {profile.email}
                                                </p>
                                            </div>
                                        </div>
                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${status.color}`}>
                                            <StatusIcon className="w-3 h-3" />
                                            {status.label}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Vence em</span>
                                            <span className="text-sm font-bold text-gray-700 flex items-center gap-1.5 mt-0.5">
                                                <Calendar className="w-3.5 h-3.5 text-primary" />
                                                {profile.is_admin ? 'Infinito' : formatDate(profile.access_until)}
                                            </span>
                                        </div>

                                        {!profile.is_admin && (
                                            <button 
                                                onClick={() => handleRenewAccess(profile.id, profile.access_until)}
                                                disabled={updating === profile.id}
                                                className="bg-primary hover:bg-primary/90 text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                                            >
                                                {updating === profile.id ? (
                                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Clock className="w-3.5 h-3.5" />
                                                )}
                                                +30 Dias
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>

        {/* --- DESKTOP VIEW --- */}
        <div className="hidden md:flex flex-col flex-1 p-8 overflow-y-auto no-scrollbar bg-gray-50 dark:bg-[#0B0B0F] h-full w-full">
            <div className="max-w-[1200px] w-full mx-auto space-y-8">
                {/* Header Desktop */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <ChevronLeft className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Gestão de Usuários</h1>
                            <p className="text-sm font-medium text-gray-500 mt-1">Controle de acesso e carteiras virtuais do sistema.</p>
                        </div>
                    </div>
                    <div className="flex gap-3 items-center">
                        <div className="relative w-72">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="w-4 h-4 text-gray-400" />
                            </div>
                            <input 
                                type="text" 
                                placeholder="Buscar por nome ou e-mail..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm"
                            />
                        </div>
                        <button onClick={fetchProfiles} className={`p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-sm ${loading ? 'animate-spin cursor-wait' : ''}`}>
                            <RefreshCw className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-3 gap-6">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-5">
                        <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                            <Users className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Total de Contas</p>
                            <h2 className="text-3xl font-black text-gray-900 dark:text-white">{profiles.length}</h2>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-5">
                        <div className="w-14 h-14 bg-green-50 dark:bg-green-900/20 rounded-2xl flex items-center justify-center text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Assinantes Ativos</p>
                            <h2 className="text-3xl font-black text-gray-900 dark:text-white">
                                {profiles.filter(p => !p.is_admin && Math.ceil((new Date(p.access_until).getTime() - new Date().getTime()) / 86400000) >= 0).length}
                            </h2>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-5">
                        <div className="w-14 h-14 bg-rose-50 dark:bg-rose-900/20 rounded-2xl flex items-center justify-center text-rose-600 dark:text-rose-400">
                            <AlertCircle className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Acessos Expirados</p>
                            <h2 className="text-3xl font-black text-gray-900 dark:text-white">
                                {profiles.filter(p => !p.is_admin && Math.ceil((new Date(p.access_until).getTime() - new Date().getTime()) / 86400000) < 0).length}
                            </h2>
                        </div>
                    </div>
                </div>

                {/* Desktop Data Table */}
                <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden relative">
                    {loading && profiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-40">
                            <RefreshCw className="w-10 h-10 animate-spin mb-4 text-primary" />
                            <p className="text-sm font-medium text-gray-500">Carregando usuários...</p>
                        </div>
                    ) : filteredProfiles.length === 0 ? (
                        <div className="p-16 text-center">
                            <div className="w-20 h-20 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100 dark:border-gray-800">
                                <Search className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Nenhum usuário encontrado</h3>
                            <p className="text-sm text-gray-500">Tente ajustar sua busca com outros termos.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                                <tr>
                                    <th className="px-8 py-5 text-[11px] font-black text-gray-400 uppercase tracking-widest">Usuário da Plataforma</th>
                                    <th className="px-8 py-5 text-[11px] font-black text-gray-400 uppercase tracking-widest">Status da Licença</th>
                                    <th className="px-8 py-5 text-[11px] font-black text-gray-400 uppercase tracking-widest text-right">Ações Administrativas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {filteredProfiles.map((profile) => {
                                    const status = getStatusInfo(profile.access_until, profile.is_admin);
                                    const StatusIcon = status.icon;

                                    return (
                                        <tr key={profile.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors group">
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center font-black text-gray-500 dark:text-gray-300 text-sm">
                                                        {profile.full_name?.charAt(0) || profile.email?.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-gray-900 dark:text-white text-base">{profile.full_name || 'Usuário Não Nomeado'}</h4>
                                                        <p className="text-sm font-medium text-gray-500">{profile.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 text-sm font-medium">
                                                <div className="flex flex-col gap-2">
                                                    <div className={`flex items-center gap-1.5 px-3 py-1 bg-opacity-10 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit ${status.color}`}>
                                                        <StatusIcon className="w-3.5 h-3.5" /> {status.label}
                                                    </div>
                                                    {!profile.is_admin && (
                                                        <div className="text-gray-500 dark:text-gray-400 text-xs flex gap-1.5 items-center font-semibold">
                                                             <Calendar className="w-3.5 h-3.5 text-gray-400" /> 
                                                             Vence em: {formatDate(profile.access_until)}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                {!profile.is_admin ? (
                                                    <button 
                                                        onClick={() => handleRenewAccess(profile.id, profile.access_until)}
                                                        disabled={updating === profile.id}
                                                        className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 text-xs opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    >
                                                        {updating === profile.id ? (
                                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Clock className="w-4 h-4" />
                                                        )}
                                                        Aprovar +30 Dias
                                                    </button>
                                                ) : (
                                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-xl text-xs font-bold w-fit ml-auto">
                                                        <Crown className="w-4 h-4"/> Conta Matriz
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>

        {/* Alert Modal */}
            {alertModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
