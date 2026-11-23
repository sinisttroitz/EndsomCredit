import React, { useState, useEffect, useMemo } from 'react';
import { Search, ChevronRight, AlertTriangle, Calendar, RefreshCw, X, Plus, Bell, Share2, Wallet, TrendingUp, DollarSign } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan } from '../types';
import { generateInstallments } from '../utils/loanUtils';
import { ShareReportModal } from '../components/ShareReportModal';
import { matchesClientSearch, normalizeSearchText } from '../utils/searchUtils';

interface LoansProps {
    onLoanSelect?: (loanId: string) => void;
    onNewLoan?: () => void;
    initialFilter?: 'active' | 'late' | 'paid';
    onFilterChange?: (filter: 'active' | 'late' | 'paid') => void;
}

export const Loans: React.FC<LoansProps> = ({ onLoanSelect, onNewLoan, initialFilter = 'active', onFilterChange }) => {
    const [filter, setFilter] = useState<'active' | 'late' | 'paid'>(initialFilter);
    const [loans, setLoans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [frequencyFilter, setFrequencyFilter] = useState<'all' | 'Diária' | 'Semanal' | 'Quinzenal' | 'Mensal'>('all');
    const [showReportModal, setShowReportModal] = useState(false);

    useEffect(() => {
        fetchLoans();
    }, []);

    useEffect(() => {
        if (onFilterChange) {
            onFilterChange(filter);
        }
    }, [filter, onFilterChange]);

    const fetchLoans = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('loans')
                .select(`
                    *,
                    client:clients (name, avatar_url, phone, cpf),
                    installment_fines (*)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            setLoans(data || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const isLoanLate = (loan: Loan): boolean => {
        if (loan.status === 'paid') return false;
        if (loan.status === 'late') return true;
        const installments = generateInstallments(loan, loan.installment_fines || []);
        return installments.some(i => i.status === 'late');
    };

    // Dynamic Counts
    const activeCount = useMemo(() => loans.filter(l => l.status !== 'paid' && l.status !== 'pending').length, [loans]);
    const lateCount = useMemo(() => loans.filter(l => isLoanLate(l)).length, [loans]);
    const paidCount = useMemo(() => loans.filter(l => l.status === 'paid').length, [loans]);

    // Financial Metrics Summary
    const metrics = useMemo(() => {
        const activeLoans = loans.filter(l => l.status !== 'paid' && l.status !== 'pending');

        // Capital emprestado (ativos)
        const totalPrincipal = activeLoans.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

        // Saldo a receber (ativos)
        const totalOutstanding = activeLoans.reduce((sum, l) => {
            const insts = generateInstallments(l, l.installment_fines || []);
            const bal = insts.reduce((acc, i) => i.status !== 'paid' ? acc + i.value : acc, 0);
            return sum + bal;
        }, 0);

        // Total amortizado / recebido
        const totalAmortized = loans.reduce((sum, l) => {
            const isAlg = l.frequency === 'Aluguel';
            const tDebt = isAlg ? Number(l.amount) : (l.installment_value || 0) * (l.installments || 1);
            const insts = generateInstallments(l, l.installment_fines || []);
            const bal = insts.reduce((acc, i) => i.status !== 'paid' ? acc + i.value : acc, 0);
            const paid = isAlg
                ? (Number(l.total_interest_paid) || 0) + Math.max(0, Number(l.amount) - Number(l.balance))
                : (l.status === 'paid' && l.amount_paid
                    ? Number(l.amount_paid)
                    : insts.filter(i => i.status === 'paid').reduce((acc, i) => acc + i.value, 0) || Math.max(0, tDebt - bal));
            return sum + paid;
        }, 0);

        const lateLoans = activeLoans.filter(l => isLoanLate(l));
        const lateAmount = lateLoans.reduce((sum, l) => {
            const insts = generateInstallments(l, l.installment_fines || []);
            const overdue = insts.filter(i => i.status === 'late');
            return sum + overdue.reduce((acc, i) => acc + i.value, 0);
        }, 0);

        return {
            totalPrincipal,
            totalOutstanding,
            totalAmortized,
            activeCount: activeLoans.length,
            lateCount: lateLoans.length,
            lateAmount
        };
    }, [loans]);

    const filteredLoans = loans.filter(loan => {
        if (filter === 'active') {
            if (loan.status === 'paid' || loan.status === 'pending') return false;
        } else if (filter === 'paid') {
            if (loan.status !== 'paid') return false;
        } else if (filter === 'late') {
            if (!isLoanLate(loan)) return false;
        }

        // Search Filter (Client Name, Phone, CPF, or Contract #ID)
        if (searchTerm) {
            const matchesClient = matchesClientSearch(loan.client, searchTerm);
            const cleanQuery = searchTerm.trim().replace(/^#/, '');
            const matchesLoanId = loan.id && normalizeSearchText(loan.id).includes(normalizeSearchText(cleanQuery));
            if (!matchesClient && !matchesLoanId) return false;
        }

        // Frequency Filter
        if (frequencyFilter !== 'all' && loan.frequency !== frequencyFilter) {
            return false;
        }

        return true;
    });

    const formatDate = (dateInput: string | Date | undefined) => {
        if (!dateInput) return '-';
        if (dateInput instanceof Date) return dateInput.toLocaleDateString('pt-BR');
        if (typeof dateInput === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
                const [year, month, day] = dateInput.split('-').map(Number);
                return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
            }
            return new Date(dateInput).toLocaleDateString('pt-BR');
        }
        return '-';
    };

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
            {/* Mobile Header */}
            <header className="md:hidden bg-white dark:bg-card-dark text-gray-900 dark:text-white px-5 pt-10 pb-4 relative z-10 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-black tracking-tight text-gray-900 dark:text-white">Empréstimos</h1>
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] font-bold rounded-full">
                            {loans.length}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {isSearching && (
                            <div className="relative animate-in fade-in slide-in-from-right-4 duration-200">
                                <input
                                    autoFocus
                                    className="w-36 py-1.5 pl-3 pr-8 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs"
                                    placeholder="Buscar cliente, telefone, #id..."
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onBlur={() => { if (!searchTerm) setIsSearching(false); }}
                                />
                                <button
                                    onClick={() => { setSearchTerm(''); setIsSearching(false); }}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                        <button
                            onClick={() => setIsSearching(!isSearching)}
                            className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center transition-all border border-gray-200 dark:border-gray-700 active:scale-95"
                        >
                            <Search className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setShowReportModal(true)}
                            title="Relatório WhatsApp"
                            className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center transition-all border border-gray-200 dark:border-gray-700 active:scale-95"
                        >
                            <Share2 className="w-4 h-4" />
                        </button>
                        {onNewLoan && (
                            <button
                                onClick={onNewLoan}
                                className="w-9 h-9 rounded-xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center transition-all active:scale-95 shadow-sm"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Desktop Header */}
            <header className="hidden md:flex px-8 py-5 bg-white dark:bg-card-dark border-b border-gray-100 dark:border-gray-800 justify-between items-center transition-colors">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white">Empréstimos</h1>
                    <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-500 text-xs font-bold rounded-lg border border-gray-200/80 dark:border-gray-700">
                        {loans.length} total
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="w-4 h-4 text-gray-400 group-focus-within:text-gray-600 transition-colors" />
                        </div>
                        <input
                            type="text"
                            className="w-60 pl-9 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-medium text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 transition-all shadow-xs"
                            placeholder="Buscar cliente, telefone, #contrato..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setShowReportModal(true)}
                        className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 text-sm font-semibold rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer"
                    >
                        <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Relatório WhatsApp
                    </button>

                    {onNewLoan && (
                        <button
                            onClick={onNewLoan}
                            className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-bold rounded-xl hover:bg-black/85 dark:hover:bg-gray-100 transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                            <Plus className="w-4 h-4" /> Novo Empréstimo
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-1 px-4 py-4 md:px-8 md:py-6 overflow-y-auto no-scrollbar">
                {/* Financial Summary Cards (Desktop and Mobile) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-5">
                    <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200/70 dark:border-gray-800 shadow-xs">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Capital Emprestado</span>
                        <span className="text-base md:text-xl font-black text-gray-900 dark:text-white block truncate">
                            R$ {metrics.totalPrincipal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-0.5">
                            {metrics.activeCount} contratos ativos
                        </span>
                    </div>

                    <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200/70 dark:border-gray-800 shadow-xs">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Saldo a Receber</span>
                        <span className="text-base md:text-xl font-black text-gray-900 dark:text-white block truncate">
                            R$ {metrics.totalOutstanding.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-0.5">
                            Saldo devedor total
                        </span>
                    </div>

                    <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200/70 dark:border-gray-800 shadow-xs">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Total Amortizado</span>
                        <span className="text-base md:text-xl font-black text-emerald-600 dark:text-emerald-400 block truncate">
                            R$ {metrics.totalAmortized.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-0.5">
                            Valores já recebidos
                        </span>
                    </div>

                    <div className={`p-4 rounded-2xl border shadow-xs ${metrics.lateCount > 0
                            ? 'bg-red-50/40 dark:bg-red-950/20 border-red-200/80 dark:border-red-900/40'
                            : 'bg-white dark:bg-gray-900 border-gray-200/70 dark:border-gray-800'
                        }`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Inadimplência</span>
                        <span className={`text-base md:text-xl font-black block truncate ${metrics.lateCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                            {metrics.lateCount > 0 ? `${metrics.lateCount} em atraso` : 'Em dia'}
                        </span>
                        <span className={`text-[11px] block mt-0.5 truncate ${metrics.lateCount > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                            {metrics.lateCount > 0 ? `R$ ${metrics.lateAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} vencidos` : 'Nenhum atraso'}
                        </span>
                    </div>
                </div>

                {/* Filter Controls Bar */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
                    {/* Frequência Filter */}
                    <div className="bg-gray-200/60 dark:bg-gray-800/60 p-1 rounded-xl flex items-center border border-gray-200 dark:border-gray-700/60 overflow-x-auto no-scrollbar">
                        {(['all', 'Diária', 'Semanal', 'Quinzenal', 'Mensal'] as const).map((opt) => (
                            <button
                                key={opt}
                                onClick={() => setFrequencyFilter(opt)}
                                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${frequencyFilter === opt
                                        ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                    }`}
                            >
                                {opt === 'all' ? 'Todas' : opt}
                            </button>
                        ))}
                    </div>

                    {/* Status Filter with live counts */}
                    <div className="bg-gray-200/60 dark:bg-gray-800/60 p-1 rounded-xl flex items-center border border-gray-200 dark:border-gray-700/60">
                        <button
                            onClick={() => setFilter('active')}
                            className={`flex-1 sm:flex-initial py-1.5 px-3.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${filter === 'active'
                                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                }`}
                        >
                            <span>Ativos</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${filter === 'active' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' : 'bg-gray-300/60 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                }`}>
                                {activeCount}
                            </span>
                        </button>

                        <button
                            onClick={() => setFilter('late')}
                            className={`flex-1 sm:flex-initial py-1.5 px-3.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${filter === 'late'
                                    ? 'bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 shadow-xs'
                                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                }`}
                        >
                            <span>Atrasados</span>
                            {lateCount > 0 && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-red-500 text-white">
                                    {lateCount}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={() => setFilter('paid')}
                            className={`flex-1 sm:flex-initial py-1.5 px-3.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${filter === 'paid'
                                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                }`}
                        >
                            <span>Quitados</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${filter === 'paid' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' : 'bg-gray-300/60 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                }`}>
                                {paidCount}
                            </span>
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    {filteredLoans.length === 0 && !loading && (
                        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/70 dark:border-gray-800 text-gray-400">
                            Nenhum empréstimo encontrado para este filtro.
                        </div>
                    )}

                    {/* Desktop Table View */}
                    <div className="hidden md:block bg-white dark:bg-gray-900 rounded-2xl shadow-xs border border-gray-200/70 dark:border-gray-800 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                                    <th className="p-4">Cliente</th>
                                    <th className="p-4">Valor Emprestado</th>
                                    <th className="p-4">Amortizado</th>
                                    <th className="p-4">Saldo Devedor</th>
                                    <th className="p-4">Frequência</th>
                                    <th className="p-4 w-1/6">Progresso</th>
                                    <th className="p-4">Próx. Vencimento</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {filteredLoans.map((loan) => {
                                    const installments = generateInstallments(loan, loan.installment_fines || []);
                                    const outstandingBalance = installments.reduce((acc, inst) => inst.status !== 'paid' ? acc + inst.value : acc, 0);
                                    const isAluguel = loan.frequency === 'Aluguel';
                                    const isMensal = loan.frequency === 'Mensal';
                                    const totalDebt = isAluguel ? Number(loan.amount) : (loan.installment_value || 0) * (loan.installments || 1);
                                    const paidAmount = isAluguel
                                        ? (Number(loan.total_interest_paid) || 0) + Math.max(0, Number(loan.amount) - Number(loan.balance))
                                        : (loan.status === 'paid' && loan.amount_paid
                                            ? Number(loan.amount_paid)
                                            : installments.filter(i => i.status === 'paid').reduce((acc, inst) => acc + inst.value, 0) || Math.max(0, totalDebt - outstandingBalance));
                                    const overdueInstallments = installments.filter(i => i.status === 'late');
                                    const nextInstallment = installments.find(i => i.status !== 'paid');
                                    const isLate = overdueInstallments.length > 0 || loan.status === 'late';
                                    const displayStatus = isLate ? 'late' : loan.status;

                                    let displayDate: Date | string | undefined;
                                    if (isLate && overdueInstallments.length > 0) {
                                        displayDate = overdueInstallments[0].date;
                                    } else if (nextInstallment) {
                                        displayDate = nextInstallment.date;
                                    } else {
                                        displayDate = loan.due_date;
                                    }

                                    return (
                                        <tr
                                            key={loan.id}
                                            onClick={() => onLoanSelect?.(loan.id)}
                                            className="hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors cursor-pointer group"
                                        >
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                                                        {loan.client?.avatar_url && !loan.client.avatar_url.includes('ui-avatars.com') ? (
                                                            <img src={loan.client.avatar_url} alt="Client" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span>{loan.client?.name?.substring(0, 2).toUpperCase() || 'CX'}</span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-900 dark:text-white text-sm">{loan.client?.name || 'Cliente'}</p>
                                                        <p className="text-[10px] text-gray-400">#{loan.id.substring(0, 6)}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                                R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-4 text-sm font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                R$ {paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-4 text-sm font-bold text-gray-900 dark:text-white whitespace-nowrap">
                                                R$ {outstandingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-4 text-xs font-medium text-gray-500">
                                                {loan.frequency || 'N/A'}
                                            </td>
                                            <td className="p-4">
                                                {isMensal ? (
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${displayStatus === 'late'
                                                            ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200/60 dark:border-red-900/40'
                                                            : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40'
                                                        }`}>
                                                        <RefreshCw className="w-3 h-3" />
                                                        {displayStatus === 'late' ? 'Juros pendentes' : (Number(loan.total_interest_paid) > 0 ? 'Juros em dia' : '1º Mês')}
                                                    </span>
                                                ) : isAluguel ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/60 dark:border-purple-900/40">
                                                        Aluguel Diário
                                                    </span>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${displayStatus === 'late' ? 'bg-red-500' : displayStatus === 'pending' ? 'bg-gray-400' : 'bg-emerald-500'}`}
                                                                style={{ width: `${loan.progress}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{loan.progress}%</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4 text-sm whitespace-nowrap">
                                                <span className={`${isLate ? 'text-red-600 font-bold' : 'text-gray-600 dark:text-gray-300'}`}>
                                                    {formatDate(displayDate)}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${displayStatus === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40' :
                                                    displayStatus === 'late' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/40' :
                                                        displayStatus === 'paid' ? 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' :
                                                            'bg-amber-50 text-amber-700 border-amber-200'
                                                    }`}>
                                                    {displayStatus === 'active' ? 'Em dia' : displayStatus === 'late' ? 'Atrasado' : displayStatus === 'paid' ? 'Pago' : 'Pendente'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3">
                        {filteredLoans.map((loan) => {
                            const installments = generateInstallments(loan, loan.installment_fines || []);
                            const outstandingBalance = installments.reduce((acc, inst) => inst.status !== 'paid' ? acc + inst.value : acc, 0);
                            const isAluguel = loan.frequency === 'Aluguel';
                            const isMensal = loan.frequency === 'Mensal';
                            const totalDebt = isAluguel ? Number(loan.amount) : (loan.installment_value || 0) * (loan.installments || 1);
                            const paidAmount = isAluguel
                                ? (Number(loan.total_interest_paid) || 0) + Math.max(0, Number(loan.amount) - Number(loan.balance))
                                : (loan.status === 'paid' && loan.amount_paid
                                    ? Number(loan.amount_paid)
                                    : installments.filter(i => i.status === 'paid').reduce((acc, inst) => acc + inst.value, 0) || Math.max(0, totalDebt - outstandingBalance));

                            const overdueInstallments = installments.filter(i => i.status === 'late');
                            const nextInstallment = installments.find(i => i.status !== 'paid');

                            const isLate = overdueInstallments.length > 0 || loan.status === 'late';
                            const displayStatus = isLate ? 'late' : loan.status;

                            let displayDate: Date | string | undefined;
                            if (isLate && overdueInstallments.length > 0) {
                                displayDate = overdueInstallments[0].date;
                            } else if (nextInstallment) {
                                displayDate = nextInstallment.date;
                            } else {
                                displayDate = loan.due_date;
                            }

                            const dateDisplayStr = formatDate(displayDate);

                            return (
                                <div
                                    key={loan.id}
                                    onClick={() => onLoanSelect?.(loan.id)}
                                    className="bg-white dark:bg-card-dark p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-800 hover:shadow-sm transition-all cursor-pointer active:scale-[0.99]"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                                                {loan.client?.avatar_url && !loan.client.avatar_url.includes('ui-avatars.com') ? (
                                                    <img src={loan.client.avatar_url} alt="Client" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-zinc-500 dark:text-zinc-400 text-xs font-bold">{loan.client?.name?.substring(0, 2).toUpperCase() || 'CX'}</span>
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-sm">{loan.client?.name || 'Cliente'}</h3>
                                                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Contrato #{loan.id.substring(0, 6)}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border ${displayStatus === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400' :
                                                        displayStatus === 'late' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400' :
                                                            displayStatus === 'paid' ? 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300' :
                                                                'bg-amber-50 text-amber-700 border-amber-200'
                                                    }`}>
                                                    {displayStatus === 'active' ? 'Em dia' : displayStatus === 'late' ? 'Atrasado' : displayStatus === 'paid' ? 'Pago' : 'Pendente'}
                                                </span>
                                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700">
                                                    {loan.frequency || 'N/A'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-bold uppercase tracking-tight">
                                                {displayStatus === 'late' ? (
                                                    <span className="text-red-500">Venceu: {dateDisplayStr}</span>
                                                ) : (
                                                    <span>Venc: {dateDisplayStr}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 mb-3 bg-gray-50/70 dark:bg-gray-800/40 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800/60">
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-medium mb-0.5">Original</p>
                                            <p className="text-xs font-bold text-gray-900 dark:text-white truncate">R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mb-0.5">Amortizado</p>
                                            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 truncate">R$ {paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] text-gray-400 font-medium mb-0.5">Saldo Devedor</p>
                                            <p className="text-xs font-bold text-gray-900 dark:text-white truncate">R$ {outstandingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </div>
                                    </div>

                                    <div>
                                        {isMensal ? (
                                            <div className="flex justify-between items-center text-xs py-1 px-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800/50">
                                                <span className="text-gray-400 text-[11px]">Status dos Juros</span>
                                                <span className={`font-bold text-xs ${displayStatus === 'late' ? 'text-red-500' : 'text-blue-600 dark:text-blue-400'}`}>
                                                    {displayStatus === 'late' ? 'Juros pendentes' : (Number(loan.total_interest_paid) > 0 ? 'Juros em dia' : '1º Mês')}
                                                </span>
                                            </div>
                                        ) : isAluguel ? (
                                            <div className="flex justify-between items-center text-xs py-1 px-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800/50">
                                                <span className="text-gray-400 text-[11px]">Modalidade</span>
                                                <span className="font-bold text-xs text-purple-600 dark:text-purple-400">Aluguel Diário</span>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-gray-400 text-[11px]">Progresso</span>
                                                    <span className="font-semibold text-gray-700 dark:text-gray-300 text-xs">{loan.progress}%</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${displayStatus === 'late' ? 'bg-red-500' : displayStatus === 'pending' ? 'bg-gray-400' : 'bg-emerald-500'}`}
                                                        style={{ width: `${loan.progress}%` }}
                                                    ></div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </main>

            {/* Modal de Compartilhamento / Relatório WhatsApp */}
            <ShareReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
            />
        </div>
    );
};
