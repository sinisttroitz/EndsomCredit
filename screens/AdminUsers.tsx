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
        <div className="flex flex-col h-full bg-[#F8F9FA]">
            {/* Header */}
            <header className="bg-[#111827] text-white px-6 pt-12 pb-16 sticky top-0 z-10 rounded-b-[3rem]">
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
        </div>
    );
};
