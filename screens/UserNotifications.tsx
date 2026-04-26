import React, { useState, useEffect } from 'react';
import { Bell, ChevronLeft, RefreshCw, CheckCheck, Clock, X } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface UserNotification {
    id: string;
    title: string;
    message: string;
    created_at: string;
    is_global: boolean;
    isRead: boolean;
}

interface UserNotificationsProps {
    onBack: () => void;
}

export const UserNotifications: React.FC<UserNotificationsProps> = ({ onBack }) => {
    const [notifications, setNotifications] = useState<UserNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: notifs, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('is_global', true)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            const { data: reads } = await supabase
                .from('notification_reads')
                .select('notification_id')
                .eq('user_id', user.id);

            const readIds = new Set((reads || []).map(r => r.notification_id));

            const enriched = (notifs || []).map(n => ({
                ...n,
                isRead: readIds.has(n.id)
            }));

            setNotifications(enriched);

            // Mark all unread as read
            const unread = enriched.filter(n => !n.isRead);
            if (unread.length > 0) {
                const inserts = unread.map(n => ({
                    notification_id: n.id,
                    user_id: user.id
                }));
                await supabase.from('notification_reads').upsert(inserts, { onConflict: 'notification_id,user_id' });
                setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            }
        } catch (err) {
            console.error('Error fetching notifications:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

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
        if (diff < 3600) return `${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
        if (diff < 172800) return 'ontem';
        if (diff < 604800) return `${Math.floor(diff / 86400)} dias atrás`;
        return formatDate(dateString);
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return (
        <div className="flex flex-col h-full bg-[#F8F9FA] dark:bg-background-dark">
            {/* Header */}
            <header className="bg-black text-white px-6 pt-12 pb-8 sticky top-0 z-10 rounded-b-[40px]">
                <div className="flex items-center justify-between mb-2">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-xl transition-colors active:scale-95">
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
                {notifications.length > 0 && (
                    <div className="flex items-center justify-center gap-2 mt-2">
                        <CheckCheck className="w-4 h-4 text-white/50" />
                        <span className="text-xs text-white/50 font-medium">
                            {notifications.length} {notifications.length === 1 ? 'notificação' : 'notificações'}
                        </span>
                    </div>
                )}
            </header>

            {/* Content */}
            <main className="flex-1 px-5 -mt-4 pb-32 overflow-y-auto no-scrollbar">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-40">
                        <RefreshCw className="w-8 h-8 animate-spin mb-3 text-gray-400" />
                        <p className="text-sm font-medium text-gray-500">Carregando notificações...</p>
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="bg-white dark:bg-card-dark rounded-3xl p-10 text-center shadow-sm border border-gray-100 dark:border-gray-800 mt-6">
                        <div className="w-20 h-20 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Bell className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Nenhuma notificação</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Quando houver novidades, elas aparecerão aqui.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3 mt-2">
                        {notifications.map((n, index) => {
                            const isExpanded = expandedId === n.id;
                            return (
                                <div
                                    key={n.id}
                                    onClick={() => setExpandedId(isExpanded ? null : n.id)}
                                    className={`bg-white dark:bg-card-dark rounded-2xl shadow-sm border transition-all duration-300 active:scale-[0.98] cursor-pointer ${
                                        !n.isRead
                                            ? 'border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/10'
                                            : 'border-gray-100 dark:border-gray-800'
                                    }`}
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    <div className="p-4">
                                        <div className="flex items-start gap-3">
                                            {/* Indicator */}
                                            <div className="mt-1 shrink-0">
                                                {!n.isRead ? (
                                                    <div className="w-3 h-3 rounded-full bg-blue-500 shadow-lg shadow-blue-500/30 animate-pulse" />
                                                ) : (
                                                    <div className="w-3 h-3 rounded-full bg-gray-200 dark:bg-gray-700" />
                                                )}
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <h4 className="font-bold text-[15px] text-gray-900 dark:text-white truncate">
                                                        {n.title}
                                                    </h4>
                                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-bold shrink-0 whitespace-nowrap">
                                                        {timeAgo(n.created_at)}
                                                    </span>
                                                </div>
                                                <p className={`text-[13px] text-gray-600 dark:text-gray-400 leading-relaxed ${
                                                    isExpanded ? '' : 'line-clamp-2'
                                                }`}>
                                                    {n.message}
                                                </p>
                                                {isExpanded && (
                                                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                                                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                                                        <span className="text-[11px] text-gray-400 font-medium">
                                                            {formatDate(n.created_at)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
};
