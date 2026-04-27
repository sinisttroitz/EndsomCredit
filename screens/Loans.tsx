import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, ChevronRight, AlertTriangle, Calendar, Hourglass, RefreshCw, X, Plus, Bell } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan } from '../types';
import { generateInstallments } from '../utils/loanUtils';

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
                    client:clients (name, avatar_url),
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


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.freq-dropdown-container')) {
                setShowFreqDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isLoanLate = (loan: Loan): boolean => {
        if (loan.status === 'paid') return false;
        if (loan.status === 'late') return true;
        const installments = generateInstallments(loan, loan.installment_fines || []);
        return installments.some(i => i.status === 'late');
    };

    const filteredLoans = loans.filter(loan => {
        if (filter === 'active') {
            // Show active and late (ongoing loans), exclude paid and pending
            if (loan.status === 'paid' || loan.status === 'pending') return false;
        } else if (filter === 'paid') {
            if (loan.status !== 'paid') return false;
        } else if (filter === 'late') {
            if (!isLoanLate(loan)) return false;
        }

        // Search Filter
        if (searchTerm) {
            const clientName = loan.client?.name?.toLowerCase() || '';
            if (!clientName.includes(searchTerm.toLowerCase())) return false;
        }

        // Frequency Filter
        if (frequencyFilter !== 'all' && loan.frequency !== frequencyFilter) {
            return false;
        }

        return true;
    });

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
            {/* Mobile Header */}
            <header className="md:hidden bg-background-light dark:bg-background-dark text-gray-900 dark:text-white px-6 pt-12 pb-6 relative z-10 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Empréstimos</h1>
                    <div className="flex items-center gap-2">
                        {isSearching && (
                            <div className="relative animate-in fade-in slide-in-from-right-4 duration-300">
                                <input
                                    autoFocus
                                    className="w-40 py-2 pl-4 pr-10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm"
                                    placeholder="Buscar..."
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onBlur={() => { if (!searchTerm) setIsSearching(false); }}
                                />
                                <button
                                    onClick={() => { setSearchTerm(''); setIsSearching(false); }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        <button
                            onClick={() => setIsSearching(!isSearching)}
                            className={`w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center transition-all border border-gray-300 dark:border-gray-700 ${isSearching ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : ''}`}
                        >
                            <Search className={`w-5 h-5 ${isSearching ? 'text-white dark:text-black' : 'text-gray-600 dark:text-gray-300'}`} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Desktop Header */}
            <header className="hidden md:flex px-8 py-6 bg-white dark:bg-card-dark border-b border-gray-100 dark:border-gray-800 justify-between items-center transition-colors">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white">Empréstimos</h1>
                    <span className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-500 text-[10px] font-black uppercase tracking-wider rounded-full border border-gray-200 dark:border-gray-700">
                        {loans.length} total
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {onNewLoan && (
                        <button
                            onClick={onNewLoan}
                            className="hidden md:flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-bold rounded-full hover:bg-black/80 dark:hover:bg-gray-100 transition-all shadow-md active:scale-95 mr-2"
                        >
                            <Plus className="w-4 h-4" /> Novo Empréstimo
                        </button>
                    )}
                    <div className="relative group mr-2">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                        <input
                            type="text"
                            className="w-full sm:w-64 pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full font-medium text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm"
                            placeholder="Buscar empréstimo..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <button className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors relative opacity-60">
                        <Bell className="w-5 h-5" />
                    </button>
                </div>
            </header>

                <div className="flex flex-col md:flex-row gap-2 md:gap-4 w-full md:w-auto mt-3 md:mt-0">
                    <div className="bg-gray-200 dark:bg-gray-800 p-1 rounded-2xl flex items-center shadow-inner border border-gray-300 dark:border-gray-700 w-full overflow-x-auto no-scrollbar">
                        {(['all', 'Diária', 'Semanal', 'Quinzenal', 'Mensal'] as const).map((opt) => (
                            <button
                                key={opt}
                                onClick={() => setFrequencyFilter(opt)}
                                className={`flex-1 min-w-[70px] py-2 rounded-xl text-[10px] font-black transition-all duration-200 uppercase tracking-widest whitespace-nowrap ${frequencyFilter === opt ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-lg' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'}`}
                            >
                                {opt === 'all' ? 'Todas' : opt}
                            </button>
                        ))}
                    </div>

                    <div className="bg-gray-200 dark:bg-gray-800 p-1 rounded-2xl flex items-center shadow-inner border border-gray-300 dark:border-gray-700 w-full md:w-[360px]">
                        <button
                            onClick={() => setFilter('active')}
                            className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all duration-200 uppercase tracking-widest ${filter === 'active' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-lg' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'}`}
                        >
                            Ativos
                        </button>
                        <button
                            onClick={() => setFilter('late')}
                            className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all duration-200 uppercase tracking-widest ${filter === 'late' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-lg' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'}`}
                        >
                            Atrasados
                        </button>
                        <button
                            onClick={() => setFilter('paid')}
                            className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all duration-200 uppercase tracking-widest ${filter === 'paid' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-lg' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'}`}
                        >
                            Quitados
                        </button>
                </div>
            </div>

            {/* Mobile Filters (Hidden on Desktop) */}
            <div className="md:hidden">
                {/* Mobile specific filter buttons were moved to header for better desktop layout, 
            but we can keep a secondary mobile-only filter bar if needed. 
            For now, the header handles both. */}
            </div>

            <main className="flex-1 px-5 pt-2 pb-32 overflow-y-auto no-scrollbar md:px-8 md:pt-8">
                <div className="space-y-4">
                    {filteredLoans.length === 0 && !loading && (
                        <div className="text-center text-gray-400 mt-10">
                            Nenhum empréstimo encontrado.
                        </div>
                    )}

                    {/* Desktop Table View (Hidden on Mobile) */}
                    <div className="hidden md:block bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                                    <th className="p-4">Cliente</th>
                                    <th className="p-4">Valor Emprestado</th>
                                    <th className="p-4">Saldo Devedor</th>
                                    <th className="p-4">Frequência</th>
                                    <th className="p-4 w-1/5">Progresso</th>
                                    <th className="p-4">Próx. Vencimento</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {filteredLoans.map((loan) => {
                                    const installments = generateInstallments(loan, loan.installment_fines || []);
                                    const outstandingBalance = installments.reduce((acc, inst) => inst.status !== 'paid' ? acc + inst.value : acc, 0);
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
                                        <tr
                                            key={loan.id}
                                            onClick={() => onLoanSelect?.(loan.id)}
                                            className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer group"
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
                                            <td className="p-4 text-sm text-gray-600 dark:text-gray-300">
                                                R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-4 text-sm font-bold text-gray-900 dark:text-white">
                                                R$ {outstandingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-4 text-xs font-medium text-gray-500">
                                                {loan.frequency || 'N/A'}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${displayStatus === 'late' ? 'bg-red-500' : displayStatus === 'pending' ? 'bg-gray-400' : 'bg-green-500'}`}
                                                            style={{ width: `${loan.progress}%` }}
                                                        ></div>
                                                    </div>
                                                    <span className="text-xs font-medium text-gray-500">{loan.progress}%</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm">
                                                <span className={`${isLate ? 'text-red-600 font-bold' : 'text-gray-600 dark:text-gray-300'}`}>
                                                    {formatDate(displayDate)}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${displayStatus === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                                                        displayStatus === 'late' ? 'bg-red-50 text-red-700 border-red-200' :
                                                            displayStatus === 'paid' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                                                                'bg-orange-50 text-orange-700 border-orange-200'
                                                    }`}>
                                                    {displayStatus === 'active' ? 'Em dia' : displayStatus === 'late' ? 'Atrasado' : displayStatus === 'paid' ? 'Pago' : 'Pendente'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-primary transition-colors">
                                                    <ChevronRight className="w-5 h-5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View (Hidden on Desktop) */}
                    <div className="md:hidden space-y-4">
                        {filteredLoans.map((loan) => {
                            // Calculate installments and derived data
                            const installments = generateInstallments(loan, loan.installment_fines || []);
                            const outstandingBalance = installments.reduce((acc, inst) => inst.status !== 'paid' ? acc + inst.value : acc, 0);

                            const overdueInstallments = installments.filter(i => i.status === 'late');
                            const nextInstallment = installments.find(i => i.status !== 'paid');

                            const isLate = overdueInstallments.length > 0 || loan.status === 'late';
                            const displayStatus = isLate ? 'late' : loan.status;

                            // Determine date to display
                            let displayDate: Date | string | undefined;
                            if (isLate && overdueInstallments.length > 0) {
                                displayDate = overdueInstallments[0].date; // Oldest overdue
                            } else if (nextInstallment) {
                                displayDate = nextInstallment.date; // Next due
                            } else {
                                displayDate = loan.due_date; // Fallback
                            }

                            // Format date for display handling timezone correctly
                            const formatDate = (dateInput: string | Date | undefined) => {
                                if (!dateInput) return '';

                                if (dateInput instanceof Date) {
                                    return dateInput.toLocaleDateString('pt-BR');
                                }

                                // Handle string YYYY-MM-DD
                                if (typeof dateInput === 'string') {
                                    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
                                        const [year, month, day] = dateInput.split('-').map(Number);
                                        return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
                                    }
                                    return new Date(dateInput).toLocaleDateString('pt-BR');
                                }
                                return '';
                            };

                            const dateDisplayStr = formatDate(displayDate);

                            return (
                                <div
                                    key={loan.id}
                                    onClick={() => onLoanSelect?.(loan.id)}
                                    className="bg-card-light dark:bg-card-dark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98] transform duration-150"
                                >

                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                                                {loan.client?.avatar_url && !loan.client.avatar_url.includes('ui-avatars.com') ? (
                                                    <img src={loan.client.avatar_url} alt="Client" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-zinc-500 dark:text-zinc-400 text-sm font-bold">{loan.client?.name?.substring(0, 2).toUpperCase() || 'CX'}</span>
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-sm">{loan.client?.name || 'Cliente'}</h3>
                                                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Contrato #{loan.id.substring(0, 6)}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5">
                                            <div className="flex items-center gap-1.5">
                                                {/* Status Pill */}
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${displayStatus === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                                                        displayStatus === 'late' ? 'bg-red-50 text-red-700 border-red-200' :
                                                            displayStatus === 'paid' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                                                                'bg-orange-50 text-orange-700 border-orange-200'
                                                    }`}>
                                                    {displayStatus === 'active' ? 'Em dia' : displayStatus === 'late' ? 'Atrasado' : displayStatus === 'paid' ? 'Pago' : 'Pendente'}
                                                </span>
                                                {/* Frequency Pill */}
                                                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700">
                                                    {loan.frequency || 'N/A'}
                                                </span>
                                            </div>
                                            {/* Date */}
                                            <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-bold uppercase tracking-tight">
                                                {displayStatus === 'late' ? (
                                                    <span className="text-red-500/80">Venceu: {dateDisplayStr}</span>
                                                ) : (
                                                    <span>Venc: {dateDisplayStr}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-3">
                                        <div>
                                            <p className="text-xs text-gray-500 mb-0.5">Valor Original</p>
                                            <p className="font-bold text-gray-900 dark:text-white">R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500 mb-0.5">Saldo Devedor</p>
                                            <p className="font-bold text-gray-900 dark:text-white">R$ {outstandingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </div>
                                    </div>

                                    <div className="mb-3">
                                        <div className="flex justify-between text-xs mb-1.5">
                                            <span className="text-gray-500">Progresso</span>
                                            <span className="font-medium text-gray-900">{loan.progress}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${displayStatus === 'late' ? 'bg-red-500' : displayStatus === 'pending' ? 'bg-gray-400' : 'bg-green-500'}`}
                                                style={{ width: `${loan.progress}%` }}
                                            ></div>
                                        </div>
                                    </div>


                                </div>
                            )
                        })}
                    </div>
                </div>
            </main>
        </div>
    );
};