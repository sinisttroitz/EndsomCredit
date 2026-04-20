import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, ChevronRight, RefreshCw, Plus, Filter, MoreVertical, Mail, Phone, MessageSquare, MapPin, X, ChevronLeft, Calendar as CalendarIcon, DollarSign, User, MessageCircle, CreditCard, FileText, ExternalLink, Bell } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Client, Loan } from '../types';
import { generateInstallments } from '../utils/loanUtils';

interface ClientsProps {
    onClientSelect: (clientId: string) => void;
    onEditClient?: (clientId: string) => void;
    onNewLoan?: (clientId: string) => void;
}

interface ExtendedClient extends Client {
    initials: string;
    debt: number;
    isLate: boolean;
    overdueStats: { count: number, amount: number };
    contractsCount: number;
    lastLoan?: Loan;
    loans: Loan[];
}

export const Clients: React.FC<ClientsProps> = ({ onClientSelect, onEditClient, onNewLoan }) => {
    const [filter, setFilter] = useState<'all' | 'active' | 'late'>('all');
    const [clients, setClients] = useState<ExtendedClient[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [loading, setLoading] = useState(true);

    // Desktop specific state
    const [selectedClientDesktop, setSelectedClientDesktop] = useState<ExtendedClient | null>(null);

    useEffect(() => {
        fetchClients();
    }, []);

    const isLoanLate = (loan: Loan): boolean => {
        if (loan.status === 'paid') return false;
        if (loan.status === 'late') return true;

        const count = loan.installments || 1;
        const installmentValue = loan.installment_value || (loan.amount / count);

        let startDate: Date;
        if (loan.due_date) {
            const [year, month, day] = loan.due_date.split('-').map(Number);
            startDate = new Date(year, month - 1, day);
        } else {
            startDate = new Date(loan.created_at || Date.now());
        }

        // Total Debt = installment_value * installments
        const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
        const totalPaid = totalDebt - Number(loan.balance);

        let paidAccumulator = 0;
        let dailyDateTracker = new Date(startDate);

        for (let i = 0; i < count; i++) {
            let date: Date;

            if (loan.frequency === 'Diária') {
                if (i === 0) {
                    date = new Date(startDate);
                } else {
                    date = new Date(dailyDateTracker);
                    date.setDate(date.getDate() + 1);

                    while (true) {
                        const day = date.getDay();
                        if (loan.skip_saturday && day === 6) {
                            date.setDate(date.getDate() + 1);
                            continue;
                        }
                        if (loan.skip_sunday && day === 0) {
                            date.setDate(date.getDate() + 1);
                            continue;
                        }
                        break;
                    }
                }
                dailyDateTracker = new Date(date);
            } else {
                date = new Date(startDate);
                if (loan.frequency === 'Semanal') {
                    date.setDate(startDate.getDate() + (i * 7));
                } else if (loan.frequency === 'Quinzenal') {
                    date.setDate(startDate.getDate() + (i * 15));
                } else {
                    date.setMonth(startDate.getMonth() + i);
                }
            }

            // Check if this installment is paid
            if (paidAccumulator + (installmentValue * 0.99) < totalPaid) {
                paidAccumulator += installmentValue;
                continue; // This one is paid
            }

            // This is the first unpaid installment
            const today = new Date();
            const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const dateZero = new Date(date.getFullYear(), date.getMonth(), date.getDate());

            if (dateZero < todayZero) {
                return true;
            }
            return false; // First unpaid is in future or today
        }

        return false;
    };

    const calculateOverdueStats = (loan: Loan): { count: number, amount: number } => {
        if (loan.status === 'paid') return { count: 0, amount: 0 };

        const count = loan.installments || 1;
        const installmentValue = loan.installment_value || (loan.amount / count);

        let startDate: Date;
        if (loan.due_date) {
            const [year, month, day] = loan.due_date.split('-').map(Number);
            startDate = new Date(year, month - 1, day);
        } else {
            startDate = new Date(loan.created_at || Date.now());
        }

        const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
        const totalPaid = totalDebt - Number(loan.balance);

        let paidAccumulator = 0;
        let overdueSum = 0;
        let overdueCount = 0;
        let dailyDateTracker = new Date(startDate);

        const today = new Date();
        const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        for (let i = 0; i < count; i++) {
            let date: Date;

            if (loan.frequency === 'Diária') {
                if (i === 0) {
                    date = new Date(startDate);
                } else {
                    date = new Date(dailyDateTracker);
                    date.setDate(date.getDate() + 1);

                    while (true) {
                        const day = date.getDay();
                        if (loan.skip_saturday && day === 6) {
                            date.setDate(date.getDate() + 1);
                            continue;
                        }
                        if (loan.skip_sunday && day === 0) {
                            date.setDate(date.getDate() + 1);
                            continue;
                        }
                        break;
                    }
                }
                dailyDateTracker = new Date(date);
            } else {
                date = new Date(startDate);
                if (loan.frequency === 'Semanal') {
                    date.setDate(startDate.getDate() + (i * 7));
                } else if (loan.frequency === 'Quinzenal') {
                    date.setDate(startDate.getDate() + (i * 15));
                } else {
                    date.setMonth(startDate.getMonth() + i);
                }
            }

            // Check if this installment is paid
            if (paidAccumulator + (installmentValue * 0.99) < totalPaid) {
                paidAccumulator += installmentValue;
                continue; // This one is paid
            }

            // This is an unpaid installment
            const dateZero = new Date(date.getFullYear(), date.getMonth(), date.getDate());

            if (dateZero < todayZero) {
                overdueSum += installmentValue;
                overdueCount++;
            }
        }

        return { count: overdueCount, amount: overdueSum };
    };

    const fetchClients = async () => {
        setLoading(true);
        try {
            // Fetch Clients
            const { data: clientsData, error } = await supabase
                .from('clients')
                .select('*')
                .order('name');

            if (error) throw error;

            // Fetch Loans to calculate debt per client
            const { data: loansData, error: loansError } = await supabase
                .from('loans')
                .select('*, client_id, balance, status, due_date, created_at, installments, installment_value, frequency, skip_saturday, skip_sunday, amount, installment_fines (*)')
                .order('created_at', { ascending: false });

            if (loansError) throw loansError;

            const clientsWithDebt = clientsData.map((client: any) => {
                const clientLoans = loansData.filter((l: any) => l.client_id === client.id);

                let debt = 0;
                let isLate = false;
                let overdueCount = 0;
                let overdueAmount = 0;

                clientLoans.forEach((loan: any) => {
                    if (loan.status === 'paid') return;

                    const installments = generateInstallments(loan, loan.installment_fines || []);

                    // Calculate Loan Debt
                    const loanDebt = installments.reduce((acc, inst) => inst.status !== 'paid' ? acc + inst.value : acc, 0);
                    debt += loanDebt;

                    // Calculate Overdue Stats
                    const overdueInstallments = installments.filter(inst => inst.status === 'late');
                    if (overdueInstallments.length > 0) {
                        isLate = true;
                        overdueCount += overdueInstallments.length;
                        overdueAmount += overdueInstallments.reduce((acc, inst) => acc + inst.value, 0);
                    } else if (loan.status === 'late') {
                        isLate = true;
                    }
                });

                const contractsCount = clientLoans.filter((l: any) => l.status === 'active' || l.status === 'late').length;
                const lastLoan = clientLoans.length > 0 ? clientLoans[0] : undefined;

                return {
                    ...client,
                    initials: client.name.substring(0, 2).toUpperCase(),
                    debt: debt,
                    isLate: isLate,
                    overdueStats: { count: overdueCount, amount: overdueAmount },
                    contractsCount,
                    lastLoan,
                    loans: clientLoans
                };
            });

            setClients(clientsWithDebt);

        } catch (error) {
            console.error('Error fetching clients:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredClients = clients.filter(client => {
        let matchesFilter = true;
        if (filter === 'late') {
            matchesFilter = (client as any).isLate;
        } else if (filter === 'active') {
            matchesFilter = client.status === 'active' && !(client as any).isLate;
        } else if (filter !== 'all') {
            matchesFilter = client.status === filter;
        }

        const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">

            {/* Mobile View */}
            <div className="md:hidden flex flex-col h-full">
                <header className="bg-background-light dark:bg-background-dark text-gray-900 dark:text-white px-6 pt-12 pb-2 relative z-10">
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Clientes</h1>
                        <div className="flex items-center gap-2">
                            {isSearching && (
                                <div className="relative animate-in fade-in slide-in-from-right-4 duration-300">
                                    <input
                                        autoFocus
                                        className="w-48 py-2.5 pl-4 pr-10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm"
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
                            <button
                                onClick={() => onClientSelect('new')}
                                className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center border border-gray-300 dark:border-gray-700"
                            >
                                <Plus className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                            </button>
                        </div>
                    </div>
                </header>

                <div className="px-6 mt-6 mb-2">
                    <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl flex items-center shadow-inner">
                        <button
                            onClick={() => setFilter('all')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all duration-200 uppercase tracking-wider ${filter === 'all' ? 'bg-gray-900 text-white shadow-lg dark:bg-white dark:text-gray-900' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                        >
                            Todos
                        </button>
                        <button
                            onClick={() => setFilter('active')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all duration-200 uppercase tracking-wider ${filter === 'active' ? 'bg-gray-900 text-white shadow-lg dark:bg-white dark:text-gray-900' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                        >
                            Ativos
                        </button>
                        <button
                            onClick={() => setFilter('late')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all duration-200 uppercase tracking-wider ${filter === 'late' ? 'bg-gray-900 text-white shadow-lg dark:bg-white dark:text-gray-900' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 tracking-tight'}`}
                        >
                            Em Atraso
                        </button>
                    </div>
                </div>

                <main className="flex-1 px-5 pt-2 pb-32 overflow-y-auto no-scrollbar">
                    <div className="space-y-4">
                        {filteredClients.length === 0 && !loading && (
                            <div className="text-center text-gray-400 mt-10">
                                Nenhum cliente encontrado.
                            </div>
                        )}

                        {filteredClients.map((client) => {
                            const isLate = (client as any).isLate;
                            return (
                                <div
                                    key={client.id}
                                    onClick={() => onClientSelect(client.id)}
                                    className="bg-white dark:bg-zinc-900 rounded-[15px] p-3 flex items-center shadow-lg hover:shadow-xl transition-all cursor-pointer active:scale-[0.98]"
                                >
                                    {/* Avatar */}
                                    <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                                        {client.avatar_url && !client.avatar_url.includes('ui-avatars.com') ? (
                                            <img src={client.avatar_url} alt={client.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-zinc-500 dark:text-zinc-400 text-sm font-bold">{client.initials}</span>
                                        )}
                                    </div>

                                    {/* Conteúdo */}
                                    <div className="flex-1 ml-4 min-w-0">
                                        {/* Nome completo */}
                                        <div className="text-sm font-bold text-zinc-900 dark:text-white leading-tight mb-1 truncate uppercase">
                                            {client.name}
                                        </div>

                                        {/* Linha inferior */}
                                        <div className="flex items-center justify-between">
                                            {/* Saldo Devedor */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-zinc-600 dark:text-zinc-400 text-[10px] font-medium">Saldo Devedor</span>
                                                <span className="text-sm font-bold text-zinc-900 dark:text-white">
                                                    R$ {client.debt?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>

                                            {/* Pill + Seta alinhados à direita */}
                                            <div className="flex items-center gap-2">
                                                <div className={`${isLate ? 'bg-red-500/90' : 'bg-[#1DA74D]/90'} text-white text-[9px] font-bold w-[72px] py-1 rounded-lg tracking-wider uppercase text-center`}>
                                                    {isLate ? 'Atrasado' : 'Em Dia'}
                                                </div>
                                                <span className="text-xl text-zinc-400 font-light leading-none">›</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </main>
            </div>

            {/* Desktop View */}
            <div className="hidden md:flex h-full bg-gray-50 dark:bg-gray-900">
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Desktop Header */}
                    <header className="px-8 py-6 bg-white dark:bg-card-dark border-b border-gray-100 dark:border-gray-800 transition-colors">
                        <div className="max-w-[1400px] mx-auto flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <h1 className="text-2xl font-black text-gray-900 dark:text-white">Clientes</h1>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => onClientSelect('new')}
                                    className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all shadow-lg active:scale-95"
                                >
                                    <Plus className="w-4 h-4" />
                                    Novo Cliente
                                </button>

                                <div className="flex items-center gap-1 ml-2">
                                    <div className="relative group mr-2">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Search className="w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                        </div>
                                        <input
                                            type="text"
                                            className="w-full sm:w-64 pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full font-medium text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm"
                                            placeholder="Buscar cliente..."
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
                            </div>
                        </div>
                    </header>                    <div className="px-8 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-card-dark transition-colors">
                        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
                            <div className="flex items-center gap-8">
                                <button
                                    onClick={() => setFilter('all')}
                                    className={`py-6 text-[11px] font-black uppercase tracking-[0.2em] transition-all relative ${filter === 'all' ? 'text-gray-900 dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                                >
                                    Todos
                                    {filter === 'all' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-white rounded-full"></div>}
                                </button>
                                <button
                                    onClick={() => setFilter('active')}
                                    className={`py-6 text-[11px] font-black uppercase tracking-[0.2em] transition-all relative ${filter === 'active' ? 'text-gray-900 dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                                >
                                    Ativos
                                    {filter === 'active' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-white rounded-full"></div>}
                                </button>
                                <button
                                    onClick={() => setFilter('late')}
                                    className={`py-6 text-[11px] font-black uppercase tracking-[0.2em] transition-all relative ${filter === 'late' ? 'text-rose-500' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                                >
                                    Em Atraso
                                    {filter === 'late' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-500 rounded-full"></div>}
                                </button>
                            </div>

                        </div>
                    </div>

                    {/* Cards List Area */}
                    <div className="flex-1 overflow-auto p-8 no-scrollbar">
                        <div className="max-w-[1400px] mx-auto">
                            {filteredClients.length === 0 ? (
                                <div className="bg-white dark:bg-card-dark rounded-3xl p-16 text-center text-gray-400 font-medium border border-gray-100 dark:border-gray-800">
                                    Nenhum cliente encontrado com os filtros atuais.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredClients.map((client) => (
                                        <div
                                            key={client.id}
                                            onClick={() => setSelectedClientDesktop(client)}
                                            className={`group bg-white dark:bg-card-dark rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 flex items-center gap-5 p-5 ${
                                                selectedClientDesktop?.id === client.id 
                                                    ? 'border-primary shadow-md shadow-primary/10 ring-1 ring-primary/20' 
                                                    : 'border-gray-100 dark:border-gray-800 shadow-sm hover:border-gray-200 dark:hover:border-gray-700'
                                            }`}
                                        >
                                            {/* Status indicator bar (left) */}
                                            <div className={`w-1 self-stretch rounded-full shrink-0 ${
                                                client.isLate 
                                                    ? 'bg-rose-400' 
                                                    : client.status === 'active' 
                                                        ? 'bg-emerald-400' 
                                                        : 'bg-gray-200 dark:bg-gray-700'
                                            }`}></div>

                                            {/* Avatar */}
                                            <div className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-black text-sm overflow-hidden border border-gray-100 dark:border-gray-700">
                                                {client.avatar_url && !client.avatar_url.includes('ui-avatars.com') ? (
                                                    <img src={client.avatar_url} alt={client.initials} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="uppercase">{client.initials}</span>
                                                )}
                                            </div>

                                            {/* Name */}
                                            <div className="min-w-[180px] max-w-[220px]">
                                                <p className="font-black text-sm text-gray-900 dark:text-white leading-tight truncate group-hover:text-primary transition-colors">{client.name}</p>
                                                <p className="text-[11px] text-gray-400 mt-0.5 truncate">{client.email || 'Sem e-mail'}</p>
                                            </div>

                                            {/* Phone */}
                                            <div className="hidden lg:block min-w-[130px]">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Contato</p>
                                                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{client.phone || '-'}</p>
                                            </div>

                                            {/* City */}
                                            <div className="hidden xl:flex items-center gap-1.5 min-w-[120px] text-gray-500">
                                                <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                <span className="text-sm font-medium truncate">{client.city ? `${client.city}/${client.state || ''}` : '-'}</span>
                                            </div>

                                            {/* Debt */}
                                            <div className="ml-auto text-right min-w-[140px]">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Saldo Devedor</p>
                                                <p className="text-base font-black text-gray-900 dark:text-white">
                                                    R$ {client.debt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </p>
                                            </div>


                                            {/* Arrow */}
                                            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Count Footer */}
                            <div className="flex justify-between items-center mt-6 px-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mostrando {filteredClients.length} clientes</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick View Sidebar */}
                {selectedClientDesktop && (
                    <div className="w-80 bg-white dark:bg-card-dark border-l border-gray-200 dark:border-gray-800 flex flex-col shadow-xl z-20">
                        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
                            <h3 className="font-bold text-sm text-gray-900 dark:text-white">Detalhes</h3>
                            <button onClick={() => setSelectedClientDesktop(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                            <div className="flex flex-col items-center text-center mb-5">
                                <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 mb-3 overflow-hidden flex items-center justify-center text-gray-400 border border-gray-100 dark:border-gray-700">
                                    {selectedClientDesktop.avatar_url ? (
                                        <img src={selectedClientDesktop.avatar_url} alt={selectedClientDesktop.initials} className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-7 h-7" />
                                    )}
                                </div>
                                <h2 className="text-base font-bold text-gray-900 dark:text-white">{selectedClientDesktop.name}</h2>
                                <p className="text-xs text-gray-500">{selectedClientDesktop.email || 'Sem e-mail'}</p>

                                <div className="flex gap-2 mt-3">
                                    <button
                                        onClick={() => {
                                            if (selectedClientDesktop.phone) {
                                                window.open(`https://wa.me/55${selectedClientDesktop.phone.replace(/\D/g, '')}`, '_blank');
                                            }
                                        }}
                                        className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 transition-colors flex items-center gap-1.5 px-2.5"
                                        title="Abrir WhatsApp"
                                    >
                                        <MessageCircle className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-bold">WhatsApp</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (selectedClientDesktop.address) {
                                                const addressQuery = `${selectedClientDesktop.address}, ${selectedClientDesktop.number || ''}, ${selectedClientDesktop.city || ''}, ${selectedClientDesktop.state || ''}`;
                                                window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`, '_blank');
                                            }
                                        }}
                                        className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors flex items-center gap-1.5 px-2.5"
                                        title="Ver no Mapa"
                                    >
                                        <MapPin className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-bold">Mapa</span>
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-5">
                                <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                                    <span className="text-[9px] text-gray-400 uppercase font-black tracking-widest">Situação</span>
                                    <p className={`text-sm font-black mt-0.5 ${selectedClientDesktop.isLate ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {selectedClientDesktop.isLate ? 'Inadimplente' : 'Em dia'}
                                    </p>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                                    <span className="text-[9px] text-gray-400 uppercase font-black tracking-widest">Contratos</span>
                                    <p className="text-xl font-black text-gray-900 dark:text-white mt-0.5">{selectedClientDesktop.contractsCount.toString().padStart(2, '0')}</p>
                                </div>
                            </div>

                            <div className="mb-5">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Contratos</h4>
                                <div className="space-y-2">
                                    {selectedClientDesktop.loans && selectedClientDesktop.loans.length > 0 ? (
                                        selectedClientDesktop.loans.map((loan) => (
                                            <div key={loan.id} className="bg-[#1E1E24] text-white p-3.5 rounded-xl relative overflow-hidden">
                                                <div className="flex justify-between items-start mb-2.5">
                                                    <div>
                                                        <span className="text-[9px] text-gray-400 block uppercase font-bold">Contrato #{loan.id.substring(0, 6)}</span>
                                                        <span className="text-base font-bold">R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${loan.status === 'active' ? 'bg-green-500/20 text-green-400' :
                                                        loan.status === 'paid' ? 'bg-gray-500/20 text-gray-400' :
                                                            'bg-red-500/20 text-red-400'
                                                        }`}>
                                                        {loan.status === 'active' ? 'Ativo' : loan.status === 'paid' ? 'Pago' : 'Atrasado'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-[9px] text-gray-400 mb-1">
                                                        <span>Progresso</span>
                                                        <span>{loan.installments} parcelas</span>
                                                    </div>
                                                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-green-500 rounded-full transition-all duration-500"
                                                            style={{ width: `${loan.progress || 0}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-xs text-gray-500 italic">Nenhum empréstimo registrado.</div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3 mb-5">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Informações de Contato</h4>
                                <div className="flex items-start gap-2.5 text-xs text-gray-600 dark:text-gray-300">
                                    <Phone className="w-3.5 h-3.5 mt-0.5 text-gray-400" />
                                    <div className="flex-1">
                                        <p className="text-[9px] text-gray-400 uppercase font-bold">Telefone</p>
                                        <span>{selectedClientDesktop.phone || 'Não informado'}</span>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2.5 text-xs text-gray-600 dark:text-gray-300">
                                    <CreditCard className="w-3.5 h-3.5 mt-0.5 text-gray-400" />
                                    <div className="flex-1">
                                        <p className="text-[9px] text-gray-400 uppercase font-bold">CPF</p>
                                        <span>{selectedClientDesktop.cpf || 'Não informado'}</span>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2.5 text-xs text-gray-600 dark:text-gray-300">
                                    <Mail className="w-3.5 h-3.5 mt-0.5 text-gray-400" />
                                    <div className="flex-1">
                                        <p className="text-[9px] text-gray-400 uppercase font-bold">E-mail</p>
                                        <span>{selectedClientDesktop.email || 'Não informado'}</span>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2.5 text-xs text-gray-600 dark:text-gray-300">
                                    <MapPin className="w-3.5 h-3.5 mt-0.5 text-gray-400" />
                                    <div className="flex-1">
                                        <p className="text-[9px] text-gray-400 uppercase font-bold">Endereço</p>
                                        <span>
                                            {selectedClientDesktop.address ? `${selectedClientDesktop.address}, ${selectedClientDesktop.number || 'S/N'}${selectedClientDesktop.city ? ` - ${selectedClientDesktop.city}/${selectedClientDesktop.state}` : ''}` : 'Não informado'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="mb-5">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Documentos Anexados</h4>
                                {selectedClientDesktop.documents && selectedClientDesktop.documents.length > 0 ? (
                                    <div className="grid grid-cols-3 gap-2">
                                        {selectedClientDesktop.documents.map((docUrl, index) => (
                                            <a
                                                key={index}
                                                href={docUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="aspect-square bg-white dark:bg-card-dark rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden relative group shadow-sm hover:shadow-md transition-all"
                                            >
                                                <img
                                                    src={docUrl}
                                                    alt={`Doc ${index}`}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                                    }}
                                                />
                                                <div className="hidden w-full h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800 text-gray-400">
                                                    <FileText className="w-6 h-6 mb-1" />
                                                    <span className="text-[9px]">Arquivo</span>
                                                </div>
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ExternalLink className="text-white w-5 h-5" />
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-dashed border-gray-300 dark:border-gray-700 text-center text-gray-400 text-xs flex flex-col items-center gap-1.5">
                                        <FileText className="w-6 h-6 opacity-20" />
                                        <span>Nenhum documento anexado.</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2">
                            <button
                                onClick={() => onNewLoan?.(selectedClientDesktop.id)}
                                className="w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-bold hover:opacity-90 transition-colors flex items-center justify-center gap-2 shadow-lg active:scale-[0.98]"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Novo Empréstimo
                            </button>
                            <button
                                onClick={() => onClientSelect(selectedClientDesktop.id)}
                                className="w-full py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                            >
                                <User className="w-3.5 h-3.5" />
                                Ver Perfil Completo
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};