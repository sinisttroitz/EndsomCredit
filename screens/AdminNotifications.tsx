import React, { useState, useEffect } from 'react';
import { Bell, ChevronLeft, Send, Trash2, RefreshCw, AlertTriangle, X, Loader2, CheckCircle, Clock, Globe } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface Notification {
    id: string;
    title: string;
    message: string;
    created_at: string;
    created_by: string;
    is_global: boolean;
    target_user_id?: string;
}

interface AdminNotificationsProps {
    onBack: () => void;
}

export const AdminNotifications: React.FC<AdminNotificationsProps> = ({ onBack }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [deleting, setDeleting] = useState<string | null>(null);

    const [alertModal, setAlertModal] = useState<{
        open: boolean;
        title: string;
        message: string;
        type?: 'success' | 'error';
        onConfirm?: () => void;
        confirmText?: string;
    }>({ open: false, title: '', message: '' });

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setNotifications(data || []);
        } catch (err) {
            console.error("Error fetching notifications:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const handleSend = async () => {
        if (!title.trim() || !message.trim()) {
            setAlertModal({
                open: true,
                title: 'Campos Obrigatórios',
                message: 'Preencha o título e a mensagem da notificação.',
                type: 'error'
            });
            return;
        }

        setSending(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado');

            const { error } = await supabase
                .from('notifications')
                .insert({
                    title: title.trim(),
                    message: message.trim(),
                    created_by: user.id,
                    is_global: true
                });

            if (error) throw error;

            setAlertModal({
                open: true,
                title: 'Notificação Enviada',
                message: 'A notificação foi enviada com sucesso para todos os usuários.',
                type: 'success'
            });

            setTitle('');
            setMessage('');
            fetchNotifications();
        } catch (err: any) {
            console.error("Error sending notification:", err);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: `Erro ao enviar notificação: ${err.message || err}`,
                type: 'error'
            });
        } finally {
            setSending(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeleting(id);
        try {
            // Delete reads first
            await supabase.from('notification_reads').delete().eq('notification_id', id);
            // Then delete notification
            const { error } = await supabase.from('notifications').delete().eq('id', id);
            if (error) throw error;
            setNotifications(prev => prev.filter(n => n.id !== id));
        } catch (err) {
            console.error("Error deleting notification:", err);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: 'Não foi possível excluir a notificação.',
                type: 'error'
            });
        } finally {
            setDeleting(null);
        }
    };

    const formatDate = (dateString: string) => {
        const d = new Date(dateString);
        return d.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const timeAgo = (dateString: string) => {
        const now = new Date();
        const d = new Date(dateString);
        const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
        if (diff < 60) return 'agora';
        if (diff < 3600) return `${Math.floor(diff / 60)}min`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
        return `${Math.floor(diff / 86400)}d`;
    };

    return (
        <>
            {/* --- MOBILE VIEW --- */}
            <div className="md:hidden flex flex-col h-full bg-[#F8F9FA]">
                <header className="bg-black text-white px-6 pt-12 pb-8 sticky top-0 z-10 rounded-b-[40px]">
                    <div className="flex items-center justify-between mb-6">
                        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <h1 className="text-xl font-bold">Notificações</h1>
                        <button
                            onClick={fetchNotifications}
                            className={`p-2 hover:bg-white/10 rounded-xl transition-colors ${loading ? 'animate-spin' : ''}`}
                        >
                            <RefreshCw className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                <main className="flex-1 px-5 -mt-4 pb-32 overflow-y-auto no-scrollbar">
                    {/* Compose Card */}
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 mb-6">
                        <h3 className="text-sm font-black text-gray-900 mb-4 flex items-center gap-2">
                            <Send className="w-4 h-4 text-primary" /> Nova Notificação
                        </h3>
                        <div className="space-y-3">
                            <input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-primary/20 placeholder-gray-400"
                                placeholder="Título da notificação"
                                maxLength={100}
                            />
                            <textarea
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-primary/20 placeholder-gray-400 min-h-[100px] resize-none"
                                placeholder="Escreva a mensagem que todos os usuários receberão..."
                                maxLength={500}
                            />
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                                    <Globe className="w-3 h-3" /> Enviada para todos
                                </span>
                                <button
                                    onClick={handleSend}
                                    disabled={sending || !title.trim() || !message.trim()}
                                    className="bg-primary text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    Enviar
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Sent Notifications */}
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 pl-1">Histórico de Envios</h3>
                    {loading && notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 opacity-40">
                            <RefreshCw className="w-8 h-8 animate-spin mb-3" />
                            <p className="text-sm font-medium">Carregando...</p>
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="bg-white rounded-3xl p-10 text-center shadow-sm border border-gray-100">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Bell className="w-8 h-8 text-gray-300" />
                            </div>
                            <h3 className="text-base font-bold text-gray-900 mb-1">Nenhuma notificação</h3>
                            <p className="text-sm text-gray-500">Comece enviando sua primeira notificação.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {notifications.map(n => (
                                <div key={n.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 relative group">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-bold text-sm text-gray-900 truncate">{n.title}</h4>
                                                <span className="text-[10px] text-gray-400 font-bold shrink-0">{timeAgo(n.created_at)}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 line-clamp-2">{n.message}</p>
                                        </div>
                                        <button
                                            onClick={() => handleDelete(n.id)}
                                            disabled={deleting === n.id}
                                            className="p-2 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                                        >
                                            {deleting === n.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            ))}
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
                                <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Central de Notificações</h1>
                                <p className="text-sm font-medium text-gray-500 mt-1">Envie comunicados para todos os usuários do sistema.</p>
                            </div>
                        </div>
                        <button
                            onClick={fetchNotifications}
                            className={`p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-sm ${loading ? 'animate-spin cursor-wait' : ''}`}
                        >
                            <RefreshCw className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-12 gap-8">
                        {/* Left: Compose */}
                        <div className="col-span-5">
                            <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 sticky top-8">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                                        <Send className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-gray-900 dark:text-white">Nova Notificação</h3>
                                        <p className="text-xs text-gray-500 font-medium">Será enviada para todos os usuários</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Título</label>
                                        <input
                                            value={title}
                                            onChange={e => setTitle(e.target.value)}
                                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder-gray-400"
                                            placeholder="Ex: Manutenção Programada"
                                            maxLength={100}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Mensagem</label>
                                        <textarea
                                            value={message}
                                            onChange={e => setMessage(e.target.value)}
                                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder-gray-400 min-h-[140px] resize-none"
                                            placeholder="Escreva sua mensagem aqui..."
                                            maxLength={500}
                                        />
                                        <p className="text-[10px] text-gray-400 text-right mt-1 font-bold">{message.length}/500</p>
                                    </div>

                                    <button
                                        onClick={handleSend}
                                        disabled={sending || !title.trim() || !message.trim()}
                                        className="w-full bg-primary text-white py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                        Enviar Notificação
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Right: History */}
                        <div className="col-span-7">
                            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                                <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-700">
                                    <h3 className="font-bold text-gray-900 dark:text-white text-lg">Histórico de Envios</h3>
                                    <p className="text-sm text-gray-500 mt-1">{notifications.length} notificações enviadas</p>
                                </div>

                                {loading && notifications.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 opacity-40">
                                        <RefreshCw className="w-10 h-10 animate-spin mb-4 text-primary" />
                                        <p className="text-sm font-medium text-gray-500">Carregando...</p>
                                    </div>
                                ) : notifications.length === 0 ? (
                                    <div className="p-16 text-center">
                                        <div className="w-20 h-20 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100 dark:border-gray-800">
                                            <Bell className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Nenhuma notificação</h3>
                                        <p className="text-sm text-gray-500">Envie sua primeira notificação usando o formulário ao lado.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-50 dark:divide-gray-700">
                                        {notifications.map(n => (
                                            <div key={n.id} className="px-8 py-5 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors group flex items-start justify-between gap-4">
                                                <div className="flex items-start gap-4 flex-1 min-w-0">
                                                    <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                                                        <Bell className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">{n.title}</h4>
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-500 text-[9px] font-bold rounded-full shrink-0">
                                                                <Globe className="w-2.5 h-2.5" /> Global
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-1.5">{n.message}</p>
                                                        <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                                                            <Clock className="w-3 h-3" /> {formatDate(n.created_at)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setAlertModal({
                                                        open: true,
                                                        title: 'Excluir Notificação',
                                                        message: `Deseja excluir a notificação "${n.title}"? Esta ação não pode ser desfeita.`,
                                                        type: 'error',
                                                        onConfirm: () => {
                                                            setAlertModal(prev => ({ ...prev, open: false }));
                                                            handleDelete(n.id);
                                                        },
                                                        confirmText: 'Excluir'
                                                    })}
                                                    disabled={deleting === n.id}
                                                    className="p-2.5 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                                                >
                                                    {deleting === n.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Alert Modal */}
            {alertModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAlertModal(prev => ({ ...prev, open: false }))}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${alertModal.type === 'success' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'}`}>
                                {alertModal.type === 'success' ? (
                                    <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-500" />
                                ) : (
                                    <AlertTriangle className="w-8 h-8 text-yellow-600 dark:text-yellow-500" />
                                )}
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{alertModal.title}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{alertModal.message}</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setAlertModal(prev => ({ ...prev, open: false }))}
                                className={`flex-1 py-3 px-4 rounded-xl font-bold transition-colors ${alertModal.onConfirm ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700' : 'bg-primary text-white hover:bg-primary/90'}`}
                            >
                                {alertModal.onConfirm ? 'Cancelar' : 'Entendi'}
                            </button>
                            {alertModal.onConfirm && (
                                <button
                                    onClick={alertModal.onConfirm}
                                    className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
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
