import React, { useEffect, useState } from 'react';
import { Search, DollarSign, TrendingUp, Users, AlertTriangle, Bell, CheckCircle, X, ChevronRight, User, FileText, Calendar, HelpCircle, Plus, Award, ExternalLink, BarChart3 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan, Client, Profile as UserProfileData } from '../types';
import { generateInstallments } from '../utils/loanUtils';
import { processRecurringInterest } from '../utils/interestUtils';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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
        userName: ''
    });
    const [loading, setLoading] = useState(true);
    const [lateLoansList, setLateLoansList] = useState<Loan[]>([]);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<{ clients: Client[], loans: any[] }>({ clients: [], loans: [] });
    const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
    const [isTotalReceivedExpanded, setIsTotalReceivedExpanded] = useState(false);
    const [isInterestReceivedExpanded, setIsInterestReceivedExpanded] = useState(false);

    useEffect(() => {
        fetchDashboardData();
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
                    // Já devolvido
                } else {
                    totalLent += amount; // Capital em Aberto
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
                userName: user?.user_metadata?.full_name || ''
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

    // Mock data for chart
    const chartData = [
        { name: 'SEG', value: 4000 },
        { name: 'TER', value: 3000 },
        { name: 'QUA', value: 2000 },
        { name: 'QUI', value: summary.todayChargesValue > 0 ? summary.todayChargesValue : 5000, active: true },
        { name: 'SEX', value: 1890 },
        { name: 'SAB', value: 2390 },
        { name: 'DOM', value: 3490 },
    ];

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
            {/* Mobile Header */}
            <header className="md:hidden bg-primary dark:bg-black text-white rounded-b-b-header px-6 pt-8 pb-5 shadow-lg relative z-10">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white text-primary rounded-full flex items-center justify-center text-2xl overflow-hidden border-2 border-white/20 font-bold shrink-0">
                            {userInitial}
                        </div>
                        <h1 className="text-[26px] font-bold tracking-tight text-white">Olá, {displayName}!</h1>
                    </div>
                    {!userProfile?.is_admin && (
                        <div
                            className="flex items-center bg-black rounded-full pl-3 pr-3 py-1.5 shadow-sm shrink-0 cursor-pointer active:scale-95 transition-all"
                            onClick={() => setShowSubscriptionModal(true)}
                        >
                            <div className="text-[#F59E0B]">
                                <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                                    <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.418-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .495.083.965.238 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
                                </svg>
                            </div>
                            <span className="text-[11px] font-bold text-[#F59E0B] lowercase ml-0.5">premium</span>
                        </div>
                    )}
                </div>



                <div className="flex justify-between items-center bg-white/10 rounded-xl p-3 border border-white/5 backdrop-blur-sm">
                    <div className="flex flex-col">
                        <span className="text-gray-300 text-[10px] font-medium uppercase tracking-wider">Empréstimos Ativos</span>
                    </div>
                    <div className="h-6 w-px bg-white/20 mx-3"></div>
                    <div className="flex flex-col items-end">
                        <span className="text-lg font-bold tracking-wide">
                            {loading ? '...' : `R$ ${summary.totalLent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </span>
                    </div>
                </div>
            </header>

            {/* Desktop Header */}
            <header className="hidden md:flex items-center justify-between px-8 py-6 bg-white dark:bg-card-dark border-b border-gray-100 dark:border-gray-800">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Olá, {displayName}</h1>
                    <div className="flex items-center gap-3">
                        <p className="text-sm text-gray-500">Bem-vindo de volta ao seu painel de controle.</p>
                        {!userProfile?.is_admin && (
                            <div
                                className="flex items-center bg-white dark:bg-card-dark rounded-full pl-0.5 pr-2.5 py-0.5 shadow-sm border border-gray-100 dark:border-gray-800 cursor-pointer active:scale-95 transition-all hover:bg-gray-50 dark:hover:bg-gray-800"
                                onClick={() => setShowSubscriptionModal(true)}
                            >
                                <div className="text-[#F59E0B]">
                                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                                        <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.418-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .495.083.965.238 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
                                    </svg>
                                </div>
                                <span className="text-[10px] font-bold text-[#F59E0B] lowercase ml-0.5">premum</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4 flex-1 justify-end max-w-xl">
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar cliente ou contrato..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-full text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {/* Desktop Search Results Dropdown */}
                        {(searchQuery.length > 2 && (searchResults.clients.length > 0 || searchResults.loans.length > 0 || isSearching)) && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden max-h-96 overflow-y-auto z-50">
                                {/* Reuse same search results logic/component here if possible, or duplicate for now */}
                                {isSearching ? (
                                    <div className="p-4 text-center text-gray-500 text-sm">Buscando...</div>
                                ) : (
                                    <>
                                        {searchResults.clients.length > 0 && (
                                            <div className="p-2">
                                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-2">Clientes</h3>
                                                {searchResults.clients.map(client => (
                                                    <div key={client.id} onClick={() => onClientSelect?.(client.id)} className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition-colors">
                                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs"><User className="w-4 h-4" /></div>
                                                        <div className="flex-1"><p className="text-sm font-bold text-gray-900 dark:text-white">{client.name}</p></div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {searchResults.loans.length > 0 && (
                                            <div className="p-2 border-t border-gray-100 dark:border-gray-800">
                                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-2">Empréstimos</h3>
                                                {searchResults.loans.map(loan => (
                                                    <div key={loan.id} onClick={() => onLoanSelect?.(loan.id)} className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition-colors">
                                                        <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-bold text-xs"><FileText className="w-4 h-4" /></div>
                                                        <div className="flex-1"><p className="text-sm font-bold text-gray-900 dark:text-white">Contrato #{loan.id.substring(0, 6)}</p></div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors relative">
                        <Bell className="w-5 h-5" />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-card-dark"></span>
                    </button>
                    <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                        <HelpCircle className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* Content */}
            <main className="flex-1 px-5 md:px-8 pt-6 pb-24 md:pb-8 overflow-y-auto no-scrollbar">
                <div className="flex flex-col md:grid md:grid-cols-4 gap-2.5 md:gap-6 mb-6">
                    {/* Card 1: Total Recebido */}
                    <div className="relative z-40 flex flex-col md:block">
                        <div
                            onClick={() => setIsTotalReceivedExpanded(!isTotalReceivedExpanded)}
                            className={`bg-emerald-500 dark:bg-emerald-700 py-3.5 pl-5 pr-5 md:p-6 shadow-sm md:shadow-lg border-none flex justify-between items-center md:flex-col md:items-start md:h-32 hover:shadow-xl transition-all cursor-pointer relative z-20 ${isTotalReceivedExpanded ? 'rounded-t-xl rounded-b-none md:rounded-xl md:hover:-translate-y-1' : 'rounded-xl md:hover:-translate-y-1'}`}
                        >
                            <div className="flex justify-between items-start md:w-full">
                                <span className="text-[11px] md:text-xs text-white/90 font-extrabold uppercase tracking-wide">Total Recebido</span>
                                <div className="hidden md:flex w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/20 items-center justify-center text-white">
                                    <DollarSign className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                </div>
                            </div>
                            <div className="md:w-full md:mt-auto flex items-center justify-between">
                                <span className="text-[22px] md:text-2xl font-bold block text-white tracking-tight text-right md:text-left">
                                    {loading ? '...' : `R$ ${summary.totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </span>
                                <ChevronRight className={`w-5 h-5 text-emerald-100 transition-transform hidden md:block ${isTotalReceivedExpanded ? '-rotate-90' : 'rotate-90'}`} />
                            </div>
                        </div>

                        {/* Expandable Section */}
                        {isTotalReceivedExpanded && (
                            <div className="bg-gray-100 dark:bg-gray-800 p-4 pt-5 pb-5 border border-gray-200 dark:border-gray-700 shadow-xl rounded-b-xl md:rounded-xl md:absolute md:top-[calc(100%+8px)] md:left-0 md:min-w-[150%] text-[11px] sm:text-[13px] font-bold w-full uppercase -mt-2 md:mt-0 transition-opacity animate-in fade-in relative z-10">
                                <div className="flex flex-col gap-4">
                                    <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-3 gap-6">
                                        <span className="text-gray-600 dark:text-gray-400 flex-1 whitespace-normal">Proveniente de empréstimos quitados:</span>
                                        <span className="text-emerald-600 dark:text-emerald-500 text-right whitespace-nowrap text-[15px] sm:text-base font-black">
                                            R$ {summary.receivedFromPaidLoans.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center gap-6">
                                        <span className="text-gray-600 dark:text-gray-400 flex-1 whitespace-normal">Proveniente de empréstimos ativos (contém juros de empréstimos renovados):</span>
                                        <span className="text-emerald-600 dark:text-emerald-500 text-right whitespace-nowrap text-[15px] sm:text-base font-black">
                                            R$ {summary.receivedFromActiveLoans.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Card 2: Juros Recebidos */}
                    <div className="relative z-30 flex flex-col md:block">
                        <div
                            onClick={() => setIsInterestReceivedExpanded(!isInterestReceivedExpanded)}
                            className={`bg-blue-500 dark:bg-blue-700 py-3.5 pl-5 pr-5 md:p-6 shadow-sm md:shadow-lg border-none flex justify-between items-center md:flex-col md:items-start md:h-32 hover:shadow-xl transition-all cursor-pointer relative z-20 ${isInterestReceivedExpanded ? 'rounded-t-xl rounded-b-none md:rounded-xl md:hover:-translate-y-1' : 'rounded-xl md:hover:-translate-y-1'}`}
                        >
                            <div className="flex justify-between items-start md:w-full">
                                <span className="text-[11px] md:text-xs text-white/90 font-extrabold uppercase tracking-wide">Juros Recebidos</span>
                                <div className="hidden md:flex w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/20 items-center justify-center text-white">
                                    <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                </div>
                            </div>
                            <div className="md:w-full md:mt-auto flex items-center justify-between">
                                <span className="text-[22px] md:text-2xl font-bold block text-white tracking-tight text-right md:text-left">
                                    {loading ? '...' : `R$ ${summary.totalInterestReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </span>
                                <ChevronRight className={`w-5 h-5 text-blue-100 transition-transform hidden md:block ${isInterestReceivedExpanded ? '-rotate-90' : 'rotate-90'}`} />
                            </div>
                        </div>

                        {/* Expandable Section */}
                        {isInterestReceivedExpanded && (
                            <div className="bg-gray-100 dark:bg-gray-800 p-4 pt-5 pb-5 border border-gray-200 dark:border-gray-700 shadow-xl rounded-b-xl md:rounded-xl md:absolute md:top-[calc(100%+8px)] md:left-0 md:min-w-[150%] text-[11px] sm:text-[13px] font-bold w-full uppercase -mt-2 md:mt-0 transition-opacity animate-in fade-in relative z-10">
                                <div className="flex flex-col gap-4">
                                    <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-3 gap-6">
                                        <span className="text-gray-600 dark:text-gray-400 flex-1 whitespace-normal">Juros de empréstimos quitados:</span>
                                        <span className="text-blue-600 dark:text-blue-500 text-right whitespace-nowrap text-[15px] sm:text-base font-black">
                                            R$ {summary.interestFromPaidLoans.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-3 gap-6">
                                        <span className="text-gray-600 dark:text-gray-400 flex-1 whitespace-normal">Juros de empréstimos renovados:</span>
                                        <span className="text-blue-600 dark:text-blue-500 text-right whitespace-nowrap text-[15px] sm:text-base font-black">
                                            R$ {summary.interestFromRenewals.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center gap-6">
                                        <span className="text-gray-600 dark:text-gray-400 flex-1 whitespace-normal">Juros de empréstimos ativos cujo pagamento ultrapassou o capital:</span>
                                        <span className="text-blue-600 dark:text-blue-500 text-right whitespace-nowrap text-[15px] sm:text-base font-black">
                                            R$ {summary.interestFromActiveCoveredLoans.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Card 3: Clientes */}
                    <div
                        onClick={onViewClients}
                        className="bg-purple-500 dark:bg-purple-700 py-3.5 pl-5 pr-5 md:p-6 rounded-xl shadow-sm md:shadow-lg border-none flex justify-between items-center md:flex-col md:items-start md:h-32 hover:shadow-xl transition-all md:hover:-translate-y-1 cursor-pointer active:scale-[0.98]"
                    >
                        <div className="flex justify-between items-start md:w-full">
                            <span className="text-[11px] md:text-xs text-white/90 font-extrabold uppercase tracking-wide">Clientes</span>
                            <div className="hidden md:flex w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/20 items-center justify-center text-white">
                                <Users className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-1.5 md:w-full md:mt-auto justify-end md:justify-start">
                            <span className="text-[22px] md:text-2xl font-bold block text-white tracking-tight">
                                {loading ? '...' : summary.totalClients}
                            </span>
                            <span className="text-[10px] md:text-[10px] text-white/90 font-bold truncate">
                                {summary.lateCount} em atraso
                            </span>
                        </div>
                    </div>

                    {/* Card 4: Em Atraso */}
                    <div
                        onClick={onViewLateLoans}
                        className="bg-rose-500 dark:bg-rose-700 py-3.5 pl-5 pr-5 md:p-6 rounded-xl shadow-sm md:shadow-lg border-none flex justify-between items-center md:flex-col md:items-start md:h-32 hover:shadow-xl transition-all md:hover:-translate-y-1 cursor-pointer active:scale-[0.98]"
                    >
                        <div className="flex justify-between items-start md:w-full">
                            <span className="text-[11px] md:text-xs text-white/90 font-extrabold uppercase tracking-wide">Em Atraso</span>
                            <div className="hidden md:flex w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/20 items-center justify-center text-white">
                                <AlertTriangle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </div>
                        </div>
                        <div className="md:w-full md:mt-auto">
                            <span className="text-[22px] md:text-2xl font-bold block text-white tracking-tight text-right md:text-left">
                                {loading ? '...' : `R$ ${summary.lateAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Desktop Only Grid */}
                <div className="hidden md:grid grid-cols-3 gap-6">
                    {/* Alerts Table */}
                    <div className="col-span-2 bg-white dark:bg-card-dark rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
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
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                                                        {(loan.client as any)?.name?.substring(0, 2).toUpperCase() || 'CL'}
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
                        <div className="bg-white dark:bg-card-dark rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 h-80 flex flex-col">
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
                        <div className="bg-[#1E1E24] rounded-2xl p-6 shadow-lg text-white relative overflow-hidden group cursor-pointer" onClick={onViewClients}>
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

                {/* Calendário de Cobranças - Redesenhado e Compacto */}
                <div
                    onClick={onViewCollectionCalendar}
                    className="bg-white/80 dark:bg-card-dark/80 backdrop-blur-md p-5 rounded-2xl shadow-sm border border-white/30 dark:border-gray-800 cursor-pointer active:scale-[0.99] transition-all hover:shadow-md"
                >
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1">
                            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0">
                                <Calendar className="w-7 h-7" />
                            </div>
                            <div className="flex flex-col">
                                <h2 className="text-base font-bold text-gray-900 dark:text-white">Calendário de Cobranças</h2>
                            </div>
                        </div>

                        {/* Indicador Numérico Compacto */}
                        <div className="flex flex-col items-center justify-center bg-blue-600 dark:bg-blue-500 px-4 py-2.5 rounded-xl text-white shadow-lg shadow-blue-500/20">
                            <span className="text-xl font-black leading-none">{summary.todayChargesCount}</span>
                            <span className="text-[9px] uppercase font-black tracking-tighter mt-1">Hoje</span>
                        </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100/50 dark:border-gray-800/50 flex items-center justify-between">
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium italic">Toque para gerenciar as cobranças</span>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                </div>

                {/* Página de Relatórios */}
                <div
                    onClick={onViewReports}
                    className="mt-4 bg-white/80 dark:bg-card-dark/80 backdrop-blur-md p-5 rounded-2xl shadow-sm border border-white/30 dark:border-gray-800 cursor-pointer active:scale-[0.99] transition-all hover:shadow-md"
                >
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1">
                            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-600 shrink-0">
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
                                target="_blank"
                                rel="noopener noreferrer"
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
