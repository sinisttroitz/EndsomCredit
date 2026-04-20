import React, { useEffect, useState } from 'react';
import { Search, DollarSign, TrendingUp, Users, AlertTriangle, Bell, CheckCircle, X, ChevronRight, User, FileText, Calendar, HelpCircle, Plus, Award, ExternalLink, BarChart3, CalendarCheck, EyeOff, Eye } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan, Client, Profile as UserProfileData } from '../types';
import { generateInstallments } from '../utils/loanUtils';
import { processRecurringInterest } from '../utils/interestUtils';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

interface DashboardProps {
    onClientSelect?: (id: string) => void;
    onLoanSelect?: (id: string) => void;
    onViewLateLoans?: () => void;
    onViewClients?: () => void;
    onViewInterestDetails?: () => void;
    onViewCollectionCalendar?: () => void;
    onViewReports?: () => void;
    userProfile?: UserProfileData | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ onClientSelect, onLoanSelect, onViewLateLoans, onViewClients, onViewInterestDetails, onViewCollectionCalendar, onViewReports, userProfile }) => {
    const [summary, setSummary] = useState({
        totalLent: 0,
        totalReceived: 0,
        receivedFromPaidLoans: 0,
        receivedFromActiveLoans: 0,
        totalActiveClients: 0,
        totalClients: 0,
        lateAmount: 0,
        activeCount: 0,
        lateCount: 0,
        totalInterestReceived: 0,
        interestFromPaidLoans: 0,
        interestFromActiveCoveredLoans: 0,
        interestFromRenewals: 0,
        todayChargesCount: 0,
        todayChargesValue: 0,
        userEmail: '',
        userName: '',
        monthlyLent: Array(12).fill(0),
        monthlyReceived: Array(12).fill(0),
        activeLoansCount: 0,
        paidLoansCount: 0,
        lateLoansCount: 0
    });
    const [performanceToggle, setPerformanceToggle] = useState<'Empréstado' | 'Recebidos'>('Empréstado');
    const [loading, setLoading] = useState(true);
    const [lateLoansList, setLateLoansList] = useState<Loan[]>([]);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<{ clients: Client[], loans: any[] }>({ clients: [], loans: [] });
    const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
    const [isTotalReceivedExpanded, setIsTotalReceivedExpanded] = useState(false);
    const [isInterestReceivedExpanded, setIsInterestReceivedExpanded] = useState(false);
    const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
    const [hideValues, setHideValues] = useState(false);
    const [showNotificationToast, setShowNotificationToast] = useState(false);
    const [userNotifications, setUserNotifications] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showNotifPanel, setShowNotifPanel] = useState(false);

    const fetchNotifications = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Fetch all global notifications
            const { data: notifs, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('is_global', true)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            // Fetch which ones the user has read
            const { data: reads } = await supabase
                .from('notification_reads')
                .select('notification_id')
                .eq('user_id', user.id);

            const readIds = new Set((reads || []).map(r => r.notification_id));

            const enriched = (notifs || []).map(n => ({
                ...n,
                isRead: readIds.has(n.id)
            }));

            setUserNotifications(enriched);
            setUnreadCount(enriched.filter(n => !n.isRead).length);
        } catch (err) {
            console.error('Error fetching notifications:', err);
        }
    };

    const markAllAsRead = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const unread = userNotifications.filter(n => !n.isRead);
            if (unread.length === 0) return;

            const inserts = unread.map(n => ({
                notification_id: n.id,
                user_id: user.id
            }));

            await supabase.from('notification_reads').upsert(inserts, { onConflict: 'notification_id,user_id' });

            setUserNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error('Error marking notifications as read:', err);
        }
    };

    const handleBellClick = () => {
        if (showNotifPanel) {
            setShowNotifPanel(false);
        } else {
            setShowNotifPanel(true);
            markAllAsRead();
        }
    };

    useEffect(() => {
        fetchDashboardData();
        fetchNotifications();
    }, []);

    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (searchQuery.length > 2) {
                setIsSearching(true);
                try {
                    // Search Clients
                    const { data: clients } = await supabase
                        .from('clients')
                        .select('*')
                        .or(`name.ilike.%${searchQuery}%,cpf.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
                        .limit(5);

                    // Search Loans by ID
                    let loansData: any[] = [];
                    // Only search loans if query looks like part of an ID (alphanumeric)
                    if (searchQuery.length > 0) {
                        const { data } = await supabase
                            .from('loans')
                            .select('*, client:clients(name)')
                            .ilike('id', `%${searchQuery}%`)
                            .limit(5);
                        loansData = data || [];
                    }

                    setSearchResults({
                        clients: clients || [],
                        loans: loansData
                    });

                } catch (error) {
                    console.error("Search error", error);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults({ clients: [], loans: [] });
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    const isLoanLate = (loan: Loan, allFines: any[] = []): boolean => {
        if (loan.status === 'paid') return false;
        if (loan.status === 'late') return true;

        const loanFines = allFines.filter(f => f.loan_id === loan.id);
        const installments = generateInstallments(loan, loanFines);
        return installments.some(inst => inst.status === 'late');
    };

    const calculateOverdueAmount = (loan: Loan, allFines: any[] = []): number => {
        if (loan.status === 'paid') return 0;

        const loanFines = allFines.filter(f => f.loan_id === loan.id);
        const installments = generateInstallments(loan, loanFines);
        return installments
            .filter(inst => inst.status === 'late')
            .reduce((sum, inst) => sum + inst.value, 0);
    };

    const fetchDashboardData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();

            // Fetch Loans first to process interest
            const { data: loans, error: loansError } = await supabase
                .from('loans')
                .select('*, client:clients(name)')
                .order('created_at', { ascending: false });

            if (loansError) throw loansError;

            // Process recurring interest before calculating summary
            const updated = await processRecurringInterest(loans || []);

            // If any loan was updated, re-fetch to get fresh data for summary
            let finalLoans = loans;
            if (updated) {
                const { data: freshLoans } = await supabase.from('loans').select('*, client:clients(name)');
                finalLoans = freshLoans;
            }

            // Fetch Clients
            const { data: clients, error: clientsError } = await supabase
                .from('clients')
                .select('id, status');

            if (clientsError) throw clientsError;

            // Fetch Fines
            const { data: fines } = await supabase.from('installment_fines').select('*');
            const allFines = fines || [];

            // Calculations
            let totalLent = 0;
            let totalReceived = 0;
            let receivedFromPaidLoans = 0;
            let receivedFromActiveLoans = 0;
            let lateAmount = 0;
            let activeCount = 0;
            let totalInterestReceived = 0;
            let interestFromPaidLoans = 0;
            let interestFromActiveCoveredLoans = 0;
            let interestFromRenewals = 0;
            let todayChargesCount = 0;
            let todayChargesValue = 0;
            let lateLoans: Loan[] = [];
            let lateClientIds = new Set<string>();
            let activeLoansCount = 0;
            let paidLoansCount = 0;

            const monthlyLent = Array(12).fill(0);
            const monthlyReceived = Array(12).fill(0);

            const today = new Date();
            const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());

            finalLoans?.forEach((loan: Loan) => {
                const amount = Number(loan.amount);
                let currentLoanInt = 0;
                const balance = Number(loan.balance);
                const installmentValue = Number(loan.installment_value) || 0;
                const installments = Number(loan.installments) || 1;

                // Total Debt = Total Amount to be paid (Principal + Interest)
                const totalDebt = installmentValue * installments;

                // Nova Logica Categorica (Sync com Reports)
                if (loan.status === 'paid') {
                    paidLoansCount++;
                } else {
                    totalLent += amount; // Capital em Aberto
                    activeLoansCount++;
                }

                let loanReceived = 0;
                if (loan.amount_paid !== undefined && loan.amount_paid !== null) {
                    loanReceived = Number(loan.amount_paid);
                } else {
                    if (totalDebt > 0) {
                        loanReceived = Math.max(0, totalDebt - balance);
                    } else {
                        loanReceived = Math.max(0, amount - balance);
                    }
                    // Fallback logic missed interest paid during renewals
                    loanReceived += (Number(loan.total_interest_paid) || 0);
                }
                totalReceived += loanReceived;

                if (loan.status === 'paid') {
                    receivedFromPaidLoans += loanReceived;
                } else {
                    receivedFromActiveLoans += loanReceived;
                }

                if (loan.created_at) {
                    const month = new Date(loan.created_at).getMonth();
                    monthlyLent[month] += amount;
                    monthlyReceived[month] += loanReceived;
                }

                // Interest Received: Apenas emprestimos quitados
                if (loan.status === 'paid') {
                    // Soma tudo que foi recebido além do capital (ou os juros reportados no fallback se houver)
                    if (loanReceived > amount) {
                        currentLoanInt = (loanReceived - amount);
                    } else {
                        currentLoanInt = (Number(loan.total_interest_paid) || 0);
                    }
                    interestFromPaidLoans += currentLoanInt;
                } else {
                    // Para empréstimos ativos, os juros renovados são o total_interest_paid
                    const renewalsInt = Number(loan.total_interest_paid) || 0;
                    interestFromRenewals += renewalsInt;

                    // Lucro que superou o capital (empréstimos ativos rodando com lucro)
                    if (loanReceived > amount) {
                        currentLoanInt = (loanReceived - amount);
                        // Subtraímos o que já foi contado como renovação para não duplicar se for o caso
                        interestFromActiveCoveredLoans += Math.max(0, currentLoanInt - renewalsInt);
                    }

                    // O lucro total desse empréstimo ativo é a soma das renovações + o excedente do capital
                    currentLoanInt = renewalsInt + Math.max(0, (loanReceived > amount ? (loanReceived - amount) : 0) - renewalsInt);
                }
                totalInterestReceived += currentLoanInt;

                if (isLoanLate(loan, allFines)) {
                    lateAmount += calculateOverdueAmount(loan, allFines);
                    if (loan.client_id) {
                        lateClientIds.add(loan.client_id);
                    }
                    lateLoans.push(loan);
                }

                // Calculate today's charges
                if (loan.status !== 'paid') {
                    const loanFines = allFines.filter(f => f.loan_id === loan.id);
                    const loanInstallments = generateInstallments(loan, loanFines);
                    const todayInstallments = loanInstallments.filter(inst => {
                        const instDate = new Date(inst.date);
                        const instDateZero = new Date(instDate.getFullYear(), instDate.getMonth(), instDate.getDate());
                        return instDateZero.getTime() === todayZero.getTime() && inst.status !== 'paid';
                    });
                    todayChargesCount += todayInstallments.length;
                    todayChargesValue += todayInstallments.reduce((sum, inst) => sum + inst.value, 0);
                }
            });

            clients?.forEach((client: Client) => {
                if (client.status === 'active') activeCount++;
            });

            setSummary({
                totalLent,
                totalReceived,
                receivedFromPaidLoans,
                receivedFromActiveLoans,
                totalActiveClients: activeCount,
                totalClients: clients?.length || 0,
                lateAmount,
                activeCount,
                lateCount: lateClientIds.size,
                totalInterestReceived,
                interestFromPaidLoans,
                interestFromActiveCoveredLoans,
                interestFromRenewals,
                todayChargesCount,
                todayChargesValue,
                userEmail: user?.email || 'Admin',
                userName: user?.user_metadata?.full_name || '',
                monthlyLent,
                monthlyReceived,
                activeLoansCount,
                paidLoansCount,
                lateLoansCount: lateLoans.length
            });

            setLateLoansList(lateLoans.slice(0, 5));

        } catch (error) {
            console.error("Error fetching dashboard data", error);
        } finally {
            setLoading(false);
        }
    };

    const displayName = summary.userName || summary.userEmail.split('@')[0];
    const userInitial = displayName.charAt(0).toUpperCase();

    const chartData = [
        { name: 'SEG', value: 4000 },
        { name: 'TER', value: 3000 },
        { name: 'QUA', value: 2000 },
        { name: 'QUI', value: summary.todayChargesValue > 0 ? summary.todayChargesValue : 5000, active: true },
        { name: 'SEX', value: 1890 },
        { name: 'SAB', value: 2390 },
        { name: 'DOM', value: 3490 },
    ];

    // Mock data for chart
    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const prevMonthIdx = (currentMonthIdx - 1 + 12) % 12;
    const currentLentValue = summary.monthlyLent[currentMonthIdx];
    const prevLentValue = summary.monthlyLent[prevMonthIdx];
    let growthBadge = "+0,0%";
    if (prevLentValue > 0) {
        const pct = ((currentLentValue - prevLentValue) / prevLentValue) * 100;
        growthBadge = `${pct >= 0 ? '+' : ''}${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    } else if (currentLentValue > 0) {
        growthBadge = "+100,0%";
    }

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
            <header className="md:hidden bg-background-light dark:bg-background-dark pt-12 pb-6 px-6 relative z-10 flex flex-col">
                {/* Notification Panel Mobile */}
                {showNotifPanel && (
                    <div className="fixed top-0 left-0 right-0 bottom-0 z-[100]">
                        <div className="absolute inset-0 bg-black/40" onClick={() => setShowNotifPanel(false)}></div>
                        <div className="absolute top-16 left-4 right-4 max-w-sm mx-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white">Notificações</h4>
                                <button onClick={() => setShowNotifPanel(false)}><X className="w-4 h-4 text-gray-400" /></button>
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                                {userNotifications.length === 0 ? (
                                    <div className="p-8 text-center">
                                        <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                        <p className="text-sm text-gray-400 font-medium">Nenhuma notificação</p>
                                    </div>
                                ) : (
                                    userNotifications.map(n => (
                                        <div key={n.id} className={`px-4 py-3 border-b border-gray-50 dark:border-gray-800 last:border-0 ${!n.isRead ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                                            <div className="flex items-start gap-3">
                                                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.isRead ? 'bg-blue-500' : 'bg-transparent'}`}></div>
                                                <div className="flex-1 min-w-0">
                                                    <h5 className="text-sm font-bold text-gray-900 dark:text-white truncate">{n.title}</h5>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{n.message}</p>
                                                    <span className="text-[10px] text-gray-400 mt-1 block">{new Date(n.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white rounded-full flex items-center justify-center text-lg font-bold shrink-0 border border-gray-300 dark:border-gray-700">
                            {userInitial}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[18px] text-gray-900 dark:text-white font-bold leading-tight">Olá, {displayName}!</span>
                            {!userProfile?.is_admin && (
                                <div
                                    className="flex items-center gap-1 cursor-pointer"
                                    onClick={() => setShowSubscriptionModal(true)}
                                >
                                    <Award className="w-3.5 h-3.5 text-[#00A859]" fill="currentColor" />
                                    <span className="text-[11px] font-bold text-[#00A859] tracking-wide">Premium</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={handleBellClick}
                        className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center relative border border-gray-300 dark:border-gray-700 active:scale-95 transition-all"
                    >
                        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>
                </div>

                {/* Dinheiro na Rua - Card Preto */}
                <div className="w-full bg-[#1E1E24] dark:bg-card-dark rounded-3xl p-5 shadow-xl relative mt-1">
                    <div className="flex justify-between items-end">
                        <div className="flex flex-col z-10">
                            <span className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-1.5">Dinheiro na Rua</span>
                            <div className="flex items-center gap-2">
                                <span className="text-white text-[28px] font-manrope font-black tracking-tight leading-none">
                                    {hideValues ? 'R$ •••••••' : (loading ? '...' : `R$ ${summary.totalLent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                                </span>
                                <button onClick={() => setHideValues(!hideValues)} className="text-white/40 hover:text-white transition-colors">
                                    {hideValues ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        {/* Conteúdo de Crescimento Integrado */}
                        <div className="flex flex-col items-center justify-center z-10 pb-0.5">
                            <TrendingUp className="w-5 h-5 text-[#00A859] mb-0.5" strokeWidth={3} />
                            <span className="text-[#00A859] font-manrope font-black text-[15px] leading-none mb-0.5">{growthBadge}</span>
                            <span className="text-white/40 text-[7px] font-black uppercase tracking-tighter leading-none">este mês</span>
                        </div>
                    </div>
                </div>

            </header>

            {/* Desktop Header */}
            <header className="hidden md:flex items-center justify-between px-8 py-6 bg-white dark:bg-card-dark border-b border-gray-100 dark:border-gray-800">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white">Dashboard</h1>
                    <div className="flex items-center gap-3">
                        <p className="text-sm text-gray-500">Bem-vindo de volta ao seu painel de controle.</p>
                        {!userProfile?.is_admin && (
                            <div
                                className="flex items-center bg-white dark:bg-card-dark rounded-full pl-0.5 pr-2.5 py-0.5 border border-gray-100 dark:border-gray-800 cursor-pointer active:scale-95 transition-all hover:bg-gray-50 dark:hover:bg-gray-800"
                                onClick={() => setShowSubscriptionModal(true)}
                            >
                                <div className="text-[#F59E0B]">
                                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                                        <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.418-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .495.083.965.238 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
                                    </svg>
                                </div>
                                <span className="text-[10px] font-bold text-[#F59E0B] uppercase ml-0.5">premium</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">

                    <div className="relative">
                        <button 
                            onClick={handleBellClick}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors relative"
                        >
                            <Bell className="w-5 h-5" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-lg min-w-[18px] h-[18px]">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </button>

                        {/* Desktop Notification Panel */}
                        {showNotifPanel && (
                            <div className="absolute right-0 top-12 w-96 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">Notificações</h4>
                                    <button onClick={() => setShowNotifPanel(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"><X className="w-4 h-4 text-gray-400" /></button>
                                </div>
                                <div className="max-h-96 overflow-y-auto">
                                    {userNotifications.length === 0 ? (
                                        <div className="p-10 text-center">
                                            <Bell className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                                            <p className="text-sm text-gray-400 font-medium">Nenhuma notificação</p>
                                        </div>
                                    ) : (
                                        userNotifications.map(n => (
                                            <div key={n.id} className={`px-5 py-4 border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${!n.isRead ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                                                <div className="flex items-start gap-3">
                                                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.isRead ? 'bg-blue-500' : 'bg-transparent'}`}></div>
                                                    <div className="flex-1 min-w-0">
                                                        <h5 className="text-sm font-bold text-gray-900 dark:text-white">{n.title}</h5>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 mt-0.5">{n.message}</p>
                                                        <span className="text-[10px] text-gray-400 mt-1 block">{new Date(n.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="flex-1 px-4 md:px-8 pt-2 pb-24 md:pb-8 overflow-y-auto no-scrollbar bg-background-light dark:bg-background-dark relative z-20">

                {/* Cards de Métricas Individuais Ultra-Compactos (Lista de 1) */}
                <div className="md:hidden space-y-2 mb-6">
                    {/* Total Recebido */}
                    <div
                        onClick={() => setIsTotalReceivedExpanded(!isTotalReceivedExpanded)}
                        className="bg-white dark:bg-card-dark p-3.5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm active:scale-[0.98] transition-all flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-[#5FB875] rounded-full opacity-60"></div>
                            <span className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Total recebido</span>
                        </div>
                        <span className="text-lg font-manrope font-black text-[#222222] dark:text-white">
                            {hideValues ? 'R$ ••••' : (loading ? '...' : `R$ ${summary.totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                        </span>
                    </div>

                    {/* Juros Recebidos */}
                    <div
                        onClick={() => setIsInterestReceivedExpanded(!isInterestReceivedExpanded)}
                        className="bg-white dark:bg-card-dark p-3.5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm active:scale-[0.98] transition-all flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-[#05A4E8] rounded-full opacity-60"></div>
                            <span className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Juros recebidos</span>
                        </div>
                        <span className="text-lg font-manrope font-black text-[#222222] dark:text-white">
                            {hideValues ? 'R$ ••••' : (loading ? '...' : `R$ ${summary.totalInterestReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                        </span>
                    </div>

                    {/* Atrasados */}
                    <div
                        onClick={onViewLateLoans}
                        className="bg-white dark:bg-card-dark p-3.5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm active:scale-[0.98] transition-all flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-[#F28B9F] rounded-full opacity-60"></div>
                            <span className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Atrasados</span>
                        </div>
                        <span className="text-lg font-manrope font-black text-[#222222] dark:text-white">
                            {hideValues ? 'R$ ••••' : (loading ? '...' : `R$ ${summary.lateAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                        </span>
                    </div>

                    {/* Clientes */}
                    <div
                        onClick={onViewClients}
                        className="bg-white dark:bg-card-dark p-3.5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm active:scale-[0.98] transition-all flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-[#7254A0] rounded-full opacity-60"></div>
                            <span className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Clientes</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-manrope font-black text-[#7254A0]">
                                {loading ? '..' : summary.totalClients}
                            </span>
                            <span className="text-sm font-manrope font-black text-[#222222] dark:text-white">
                                • {loading ? '..' : summary.lateCount}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Calendário de Cobranças (Mobile) */}
                <div
                    onClick={onViewCollectionCalendar}
                    className="md:hidden bg-white dark:bg-card-dark px-4 py-4 rounded-[20px] border border-gray-50 dark:border-white/5 cursor-pointer active:scale-[0.98] transition-all mb-6 flex items-center justify-between"
                >
                    <div className="flex items-center gap-4">
                        {/* Ícone */}
                        <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                            <Calendar className="w-6 h-6 text-gray-700 dark:text-gray-300" strokeWidth={2} />
                        </div>

                        {/* Textos */}
                        <div className="flex flex-col">
                            <span className="text-[15px] font-black text-[#222222] dark:text-white leading-tight">
                                Calendário de Cobranças
                            </span>
                            <span className="text-[11px] font-medium text-gray-400 mt-0.5">
                                Vencimentos de Hoje
                            </span>
                        </div>
                    </div>

                    {/* Status e Arrow */}
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center justify-center shrink-0">
                            <span className="text-[17px] font-manrope font-black text-black-700 dark:text-black-300 leading-none">
                                {summary.todayChargesCount}
                            </span>
                            <span className="text-[9px] uppercase font-manrope font-black tracking-widest text-[black] leading-none mt-0.5">
                                HOJE
                            </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" strokeWidth={2.5} />
                    </div>
                </div>

                {/* Mobile Chart: Desempenho */}
                <div className="md:hidden bg-white dark:bg-[#1C1A17] rounded-3xl pt-8 pb-8 px-6 border border-gray-100 dark:border-white/5 mb-6">
                    <h2 className="text-xl font-black text-[#222222] dark:text-white mb-2 tracking-tighter text-center w-full">Desempenho</h2>

                    {(() => {
                        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                        const now = new Date();
                        const currentMonthIdx = now.getMonth();
                        const sequence = [];
                        // Imagem tem 7 barras (3 passados, atual, 3 futuros)
                        for (let i = 0; i < 7; i++) {
                            let mIdx = (currentMonthIdx - 3 + i);
                            while (mIdx < 0) mIdx += 12;
                            mIdx = mIdx % 12;
                            sequence.push({ name: months[mIdx], index: mIdx });
                        }

                        const maxValueEmprestado = Math.max(...sequence.map(m => summary.monthlyLent[m.index]), 1);
                        const maxValueRecebido = Math.max(...sequence.map(m => summary.monthlyReceived[m.index]), 1);

                        return (
                            <div className="flex flex-col gap-10 mt-6 pt-2">
                                {/* Emprestado */}
                                <div className="flex flex-col relative">
                                    <h3 className="text-[11px] font-black tracking-tight text-gray-800 dark:text-gray-200 mb-6 z-10 -ml-1">Emprestado</h3>
                                    <div
                                        className="w-full h-[120px] flex items-end justify-between px-1 overflow-visible relative"
                                        onClick={(e) => {
                                            if (e.target === e.currentTarget) setActiveTooltip(null);
                                        }}
                                    >
                                        {sequence.map((m) => {
                                            const val = summary.monthlyLent[m.index];
                                            const rawPct = (val / maxValueEmprestado) * 100;
                                            const heightPct = Math.max(15, rawPct);
                                            const isCurrent = m.index === currentMonthIdx;
                                            const isActive = activeTooltip === `emp_${m.index}`;

                                            return (
                                                <div
                                                    key={`emp_${m.name}`}
                                                    className="h-full flex flex-col items-center justify-end gap-2 shrink-0 relative cursor-pointer"
                                                    style={{ width: '12%' }}
                                                    onClick={() => setActiveTooltip(isActive ? null : `emp_${m.index}`)}
                                                >
                                                    {isActive && (
                                                        <div className="absolute bottom-[calc(100%-10px)] left-1/2 -translate-x-1/2 mb-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-2.5 py-1.5 rounded-xl text-[10px] font-manrope font-black shadow-2xl z-50 animate-in fade-in zoom-in slide-in-from-bottom-2 duration-200 whitespace-nowrap border border-white/10"
                                                            style={{ bottom: `${heightPct}%`, marginBottom: '12px' }}>
                                                            R$ {val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-white rotate-45"></div>
                                                        </div>
                                                    )}

                                                    <div
                                                        className={`w-full rounded-md transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] ${isCurrent ? 'bg-[#2B2B2F] dark:bg-white shadow-[0_4px_12px_rgba(0,0,0,0.15)] scale-x-105' : 'bg-[#DEDBD8] dark:bg-[#32302D]'} ${isActive ? 'scale-x-110 !opacity-100 ring-2 ring-offset-2 ring-primary dark:ring-white' : ''}`}
                                                        style={{ height: `${heightPct}%` }}
                                                    ></div>
                                                    <span className={`text-[10px] font-manrope font-black tracking-tighter ${isCurrent ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                                                        {m.name}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Juros Recebidos */}
                                <div className="flex flex-col relative pt-4">
                                    <h3 className="text-[11px] font-black tracking-tight text-gray-800 dark:text-gray-200 mb-6 z-10 -ml-1">Juros Recebidos</h3>
                                    <div
                                        className="w-full h-[120px] flex items-end justify-between px-1 overflow-visible relative"
                                        onClick={(e) => {
                                            if (e.target === e.currentTarget) setActiveTooltip(null);
                                        }}
                                    >
                                        {sequence.map((m) => {
                                            const val = summary.monthlyReceived[m.index];
                                            const rawPct = (val / maxValueRecebido) * 100;
                                            const heightPct = Math.max(15, rawPct);
                                            const isCurrent = m.index === currentMonthIdx;
                                            const isActive = activeTooltip === `rec_${m.index}`;

                                            return (
                                                <div
                                                    key={`rec_${m.name}`}
                                                    className="h-full flex flex-col items-center justify-end gap-2 shrink-0 relative cursor-pointer"
                                                    style={{ width: '12%' }}
                                                    onClick={() => setActiveTooltip(isActive ? null : `rec_${m.index}`)}
                                                >
                                                    {isActive && (
                                                        <div className="absolute bottom-[calc(100%-10px)] left-1/2 -translate-x-1/2 mb-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-2.5 py-1.5 rounded-xl text-[10px] font-manrope font-black shadow-2xl z-50 animate-in fade-in zoom-in slide-in-from-bottom-2 duration-200 whitespace-nowrap border border-white/10"
                                                            style={{ bottom: `${heightPct}%`, marginBottom: '12px' }}>
                                                            R$ {val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-white rotate-45"></div>
                                                        </div>
                                                    )}

                                                    <div
                                                        className={`w-full rounded-md transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] ${isCurrent ? 'bg-[#3B5A9D] shadow-[0_4px_12px_rgba(59,90,157,0.25)] scale-x-105' : 'bg-[#DEDBD8] dark:bg-[#32302D]'} ${isActive ? 'scale-x-110 !opacity-100 ring-2 ring-offset-2 ring-primary dark:ring-white z-10' : ''}`}
                                                        style={{ height: `${heightPct}%` }}
                                                    ></div>
                                                    <span className={`text-[10px] font-manrope font-black tracking-tighter ${isCurrent ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                                                        {m.name}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* Status dos Empréstimos (Mobile) */}
                <div className="md:hidden bg-white dark:bg-[#1C1A17] rounded-3xl p-6 pt-8 pb-10 border border-gray-100 dark:border-white/5 mb-6">
                    <h2 className="text-[16px] font-black text-[#222222] dark:text-white mb-4 tracking-tighter text-center">Status dos Empréstimos</h2>
                    <div className="flex items-center justify-center gap-4 mb-4 mt-2">
                        <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#3B5A9D]"></div>
                            <span className="text-[10px] font-black uppercase tracking-tight">Ativos</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#00A859]"></div>
                            <span className="text-[10px] font-black uppercase tracking-tight">Quitados</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#E5222E]"></div>
                            <span className="text-[10px] font-black uppercase tracking-tight">Atrasados</span>
                        </div>
                    </div>

                    <div className="h-[240px] w-full relative">
                        {(() => {
                            const total = summary.activeLoansCount + summary.paidLoansCount + summary.lateLoansCount;
                            const validTotal = total > 0 ? total : 1;
                            const activePct = Math.round((summary.activeLoansCount / validTotal) * 100);
                            const paidPct = Math.round((summary.paidLoansCount / validTotal) * 100);
                            const latePct = Math.round((summary.lateLoansCount / validTotal) * 100);

                            const pieData = [
                                { name: 'Ativos', value: summary.activeLoansCount, color: '#3B5A9D', pct: activePct },
                                { name: 'Quitados', value: summary.paidLoansCount, color: '#00A859', pct: paidPct },
                                { name: 'Atrasados', value: summary.lateLoansCount, color: '#E5222E', pct: latePct }
                            ].filter(d => d.value > 0);

                            if (pieData.length === 0) {
                                return <div className="w-full h-full flex items-center justify-center text-[12px] font-medium text-gray-400">Nenhum dado</div>;
                            }

                            return (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={65}
                                            outerRadius={95}
                                            paddingAngle={3}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: number, name: string) => [`${value} contratos`, name]}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}
                                            itemStyle={{ fontWeight: 'bold' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            );
                        })()}
                    </div>
                </div>

                {/* Desktop Only Grid */}
                <div className="hidden md:grid grid-cols-3 gap-6">
                    {/* Alerts Table */}
                    <div className="col-span-2 bg-white dark:bg-card-dark rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-gray-900 dark:text-white">Alertas de Atrasos e Atividades</h3>
                            <button onClick={onViewLateLoans} className="text-sm text-primary font-medium hover:underline">Ver tudo</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                                        <th className="pb-3 pl-2">Cliente</th>
                                        <th className="pb-3">Valor</th>
                                        <th className="pb-3">Status</th>
                                        <th className="pb-3">Vencimento</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                    {lateLoansList.length > 0 ? lateLoansList.map((loan) => (
                                        <tr key={loan.id} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => onLoanSelect?.(loan.id)}>
                                            <td className="py-4 pl-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center text-xs font-bold border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                                                        {(loan.client as any)?.avatar_url && !(loan.client as any).avatar_url.includes('ui-avatars.com') ? (
                                                            <img src={(loan.client as any).avatar_url} alt="Profile" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span>{(loan.client as any)?.name?.substring(0, 2).toUpperCase() || 'CL'}</span>
                                                        )}
                                                    </div>
                                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{(loan.client as any)?.name || 'Cliente'}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 text-sm text-gray-600 dark:text-gray-300">
                                                R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="py-4">
                                                <span className="px-2 py-1 rounded-md bg-red-100 text-red-600 text-xs font-bold">
                                                    Atrasado
                                                </span>
                                            </td>
                                            <td className="py-4 text-sm text-gray-500">
                                                {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : 'N/A'}
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={4} className="py-8 text-center text-gray-400 text-sm">
                                                Nenhum atraso recente encontrado.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-6">
                        {/* Monthly Performance Chart */}
                        <div className="bg-white dark:bg-card-dark rounded-2xl p-6 border border-gray-100 dark:border-gray-800 h-80 flex flex-col">
                            <h3 className="font-bold text-gray-900 dark:text-white mb-6">Desempenho Mensal</h3>
                            <div className="flex-1 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <Tooltip
                                            cursor={{ fill: 'transparent' }}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                        />
                                        <XAxis
                                            dataKey="name"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 10, fill: '#9CA3AF' }}
                                            dy={10}
                                        />
                                        <Bar dataKey="value" radius={[4, 4, 4, 4]} barSize={30}>
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.active ? '#3B82F6' : '#F3F4F6'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="mt-4 space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                        <span className="text-gray-500">Volume de hoje</span>
                                    </div>
                                    <span className="font-bold text-gray-900 dark:text-white">R$ {summary.todayChargesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                        <span className="text-gray-500">Meta mensal</span>
                                    </div>
                                    <span className="font-bold text-gray-900 dark:text-white">75% atingida</span>
                                </div>
                            </div>
                        </div>

                        {/* New Loan CTA */}
                        <div className="bg-[#1E1E24] rounded-2xl p-6 text-white relative overflow-hidden group cursor-pointer" onClick={onViewClients}>
                            <div className="relative z-10">
                                <h3 className="text-lg font-bold mb-2">Novo Empréstimo</h3>
                                <p className="text-gray-400 text-sm mb-6 max-w-[80%]">
                                    Simule e gere novos contratos em poucos segundos para seus clientes.
                                </p>
                                <button className="w-full bg-white text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors">
                                    <Plus className="w-5 h-5" />
                                    Iniciar Simulação
                                </button>
                            </div>
                            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-colors"></div>
                        </div>
                    </div>
                </div>

                {/* Removed Calendário here as it was moved up */}

                {/* Página de Relatórios */}
                <div
                    onClick={onViewReports}
                    className="mt-4 bg-white/80 dark:bg-card-dark/80 backdrop-blur-md p-5 rounded-2xl border border-white/30 dark:border-gray-800 cursor-pointer active:scale-[0.99] transition-all"
                >
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1">
                            <div className="w-14 h-14 rounded-2xl bg-[#333333]/10 dark:bg-white/10 flex items-center justify-center text-[#222222] dark:text-gray-300 shrink-0">
                                <BarChart3 className="w-7 h-7" />
                            </div>
                            <h2 className="text-base font-bold text-gray-900 dark:text-white">Relatórios Financeiros</h2>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0">
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>
                    </div>
                </div>
            </main>

            {/* Subscription Modal */}
            {showSubscriptionModal && (
                <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
                    <div className="bg-[#1C1A17] max-w-xs md:max-w-sm w-full rounded-3xl p-4 shadow-2xl relative overflow-hidden flex flex-col gap-4 border border-white/5 animate-fade-in-up">
                        {/* Close Button */}
                        <button
                            onClick={() => setShowSubscriptionModal(false)}
                            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/50 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        {/* Top Card: Gradient Orange */}
                        <div className="bg-gradient-to-br from-[#D96B20] to-[#A04510] rounded-2xl p-8 pb-10 flex flex-col items-center justify-center text-center shadow-[inset_0_2px_15px_rgba(0,0,0,0.2)] relative overflow-hidden">
                            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center border-[1.5px] border-white/30 mb-5 backdrop-blur-md shadow-lg">
                                <Award className="w-10 h-10 text-white fill-white/20" strokeWidth={1.5} />
                            </div>
                            <div className="flex items-center gap-2 mb-3">
                                <h2 className="text-2xl font-bold text-white tracking-tight drop-shadow-sm">Plano Premium</h2>
                                <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#FFD700] drop-shadow-sm" fill="currentColor">
                                    <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.418-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .495.083.965.238 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
                                </svg>
                            </div>
                            <div className="bg-white/20 rounded-full px-5 py-1.5 backdrop-blur-md border border-white/10 shadow-sm">
                                <span className="text-[13px] font-semibold text-white tracking-wide">Assinatura Ativa</span>
                            </div>
                        </div>

                        {/* Bottom Card: Dark Info */}
                        <div className="bg-[#2B2823] rounded-2xl p-5 shadow-inner border border-white/5">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-[#A3A09A] text-[13px] font-semibold tracking-wide">Status do Período Atual</span>
                                <span className="text-[#F97316] font-bold text-sm">
                                    {(() => {
                                        if (!userProfile?.access_until) return '0 dias';
                                        const d = Math.ceil((new Date(userProfile.access_until).getTime() - Date.now()) / 86400000);
                                        return `${Math.max(d, 0)} dias`;
                                    })()}
                                </span>
                            </div>

                            {/* Progress bar */}
                            <div className="h-[6px] w-full bg-[#1C1A17] rounded-full overflow-hidden mb-5">
                                <div
                                    className="h-full bg-[#F97316] rounded-full transition-all duration-1000 ease-out"
                                    style={{
                                        width: (() => {
                                            if (!userProfile?.access_until) return '0%';
                                            const d = Math.ceil((new Date(userProfile.access_until).getTime() - Date.now()) / 86400000);
                                            const pct = Math.min(100, Math.max(0, (d / 30) * 100)); // Assuming a visual full bar of 30 days
                                            return `${pct}%`;
                                        })()
                                    }}
                                ></div>
                            </div>

                            <p className="text-[#7D7B75] text-[11px] text-center leading-[1.6] mb-5">
                                {(() => {
                                    if (!userProfile?.access_until) return 'Sua assinatura expirou.';
                                    const dt = new Date(userProfile.access_until);
                                    const dia = dt.getDate();
                                    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                                    return `Sua assinatura expira automaticamente em ${dia} de ${meses[dt.getMonth()]}. Voce pode renovar o plano clicando no botao abaixo.`;
                                })()}
                            </p>

                            <a
                                href="https://pay.cakto.com.br/36whx5j_805010"
                                className="w-full bg-[#1DA74D] hover:bg-[#158f3e] text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors border border-[#1DA74D]"
                            >
                                Renovar Plano <ExternalLink className="w-4 h-4" />
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
