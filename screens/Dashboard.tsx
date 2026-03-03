import React, { useEffect, useState } from 'react';
import { Search, DollarSign, TrendingUp, Users, AlertTriangle, Bell, CheckCircle, X, ChevronRight, User, FileText, Calendar, HelpCircle, Plus } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan, Client } from '../types';
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
}

export const Dashboard: React.FC<DashboardProps> = ({ onClientSelect, onLoanSelect, onViewLateLoans, onViewClients, onViewInterestDetails, onViewCollectionCalendar }) => {
  const [summary, setSummary] = useState({
    totalLent: 0,
    totalReceived: 0,
    totalActiveClients: 0,
    totalClients: 0,
    lateAmount: 0,
    activeCount: 0,
    lateCount: 0,
    totalInterestReceived: 0,
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

  const isLoanLate = (loan: Loan): boolean => {
    if (loan.status === 'paid') return false;
    if (loan.status === 'late') return true;

    const installments = generateInstallments(loan);
    return installments.some(inst => inst.status === 'late');
  };

  const calculateOverdueAmount = (loan: Loan): number => {
    if (loan.status === 'paid') return 0;
    
    const installments = generateInstallments(loan);
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

      // Calculations
      let totalLent = 0;
      let totalReceived = 0;
      let lateAmount = 0;
      let activeCount = 0;
      let totalInterestReceived = 0;
      let todayChargesCount = 0;
      let todayChargesValue = 0;
      let lateLoans: Loan[] = [];
      let lateClientIds = new Set<string>();

      const today = new Date();
      const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      finalLoans?.forEach((loan: Loan) => {
        const amount = Number(loan.amount);
        const balance = Number(loan.balance);
        const installmentValue = Number(loan.installment_value) || 0;
        const installments = Number(loan.installments) || 1;
        
        // Total Debt = Total Amount to be paid (Principal + Interest)
        const totalDebt = installmentValue * installments;

        // Only sum principal for active/late loans (Active Capital)
        if (loan.status === 'active' || loan.status === 'late') {
            totalLent += amount;
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

        // Calculate Interest Received for this loan
        totalInterestReceived += (Number(loan.total_interest_paid) || 0);
        if (loan.status === 'paid' && totalDebt > 0 && amount > 0) {
             const interest = totalDebt - amount;
             totalInterestReceived += interest;
        }

        if (isLoanLate(loan)) {
            lateAmount += calculateOverdueAmount(loan);
            if (loan.client_id) {
                lateClientIds.add(loan.client_id);
            }
            lateLoans.push(loan);
        }

        // Calculate today's charges
        if (loan.status !== 'paid') {
            const loanInstallments = generateInstallments(loan);
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
        totalActiveClients: activeCount,
        totalClients: clients?.length || 0,
        lateAmount,
        activeCount,
        lateCount: lateClientIds.size,
        totalInterestReceived,
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
      <header className="md:hidden bg-primary dark:bg-black text-white rounded-b-b-header px-6 pt-12 pb-8 shadow-lg relative z-10">
        <div className="flex items-center space-x-4 mb-6">
          <div className="relative">
            <div className="w-16 h-16 bg-white text-primary rounded-full flex items-center justify-center text-3xl overflow-hidden border-2 border-white/20 font-bold">
               {userInitial}
            </div>
            <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-400 border-2 border-primary rounded-full"></div>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Olá, {displayName}!</h1>
            <p className="text-gray-400 text-sm">Bem-vindo de volta</p>
          </div>
        </div>

        <div className="relative mb-6 z-50">
          <input 
            className="w-full py-3.5 pl-12 pr-10 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-white/30 transition shadow-sm bg-white/10 backdrop-blur-sm border border-white/20" 
            placeholder="Buscar clientes ou empréstimos..." 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="text-gray-300 w-5 h-5" />
          </div>
          {searchQuery && (
            <button 
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-300 hover:text-white"
            >
                <X className="w-4 h-4" />
            </button>
          )}

          {/* Search Results Dropdown (Mobile) */}
          {(searchQuery.length > 2 && (searchResults.clients.length > 0 || searchResults.loans.length > 0 || isSearching)) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden max-h-96 overflow-y-auto z-50">
                {/* ... (Same search results content) ... */}
                {isSearching ? (
                    <div className="p-4 text-center text-gray-500 text-sm">Buscando...</div>
                ) : (
                    <>
                        {searchResults.clients.length > 0 && (
                            <div className="p-2">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-2">Clientes</h3>
                                {searchResults.clients.map(client => (
                                    <div 
                                        key={client.id}
                                        onClick={() => onClientSelect?.(client.id)}
                                        className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                            <User className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">{client.name}</p>
                                            <p className="text-xs text-gray-500">{client.cpf || client.email || 'Sem dados adicionais'}</p>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-300" />
                                    </div>
                                ))}
                            </div>
                        )}

                        {searchResults.loans.length > 0 && (
                            <div className="p-2 border-t border-gray-100 dark:border-gray-800">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-2">Empréstimos</h3>
                                {searchResults.loans.map(loan => {
                                    const isLate = isLoanLate(loan);
                                    const displayStatus = isLate ? 'late' : loan.status;
                                    return (
                                    <div 
                                        key={loan.id}
                                        onClick={() => onLoanSelect?.(loan.id)}
                                        className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-bold text-xs">
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">Contrato #{loan.id.substring(0,6)}</p>
                                            <p className="text-xs text-gray-500">{loan.client?.name} • R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </div>
                                        <div className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                            displayStatus === 'active' ? 'bg-green-100 text-green-700' :
                                            displayStatus === 'late' ? 'bg-red-100 text-red-700' :
                                            'bg-gray-100 text-gray-600'
                                        }`}>
                                            {displayStatus === 'active' ? 'Ativo' : displayStatus === 'late' ? 'Atrasado' : 'Pago'}
                                        </div>
                                    </div>
                                )})}
                            </div>
                        )}
                        
                        {searchResults.clients.length === 0 && searchResults.loans.length === 0 && !isSearching && (
                            <div className="p-8 text-center text-gray-400 text-sm">
                                Nenhum resultado encontrado para "{searchQuery}"
                            </div>
                        )}
                    </>
                )}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center bg-white/10 rounded-xl p-4 border border-white/5 backdrop-blur-sm">
          <div className="flex flex-col">
            <span className="text-gray-300 text-xs font-medium uppercase tracking-wider mb-1">Empréstimos Ativos</span>
          </div>
          <div className="h-8 w-px bg-white/20 mx-4"></div>
          <div className="flex flex-col items-end">
            <span className="text-xl font-bold tracking-wide">
                {loading ? '...' : `R$ ${summary.totalLent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
          </div>
        </div>
      </header>

      {/* Desktop Header */}
      <header className="hidden md:flex items-center justify-between px-8 py-6 bg-white dark:bg-card-dark border-b border-gray-100 dark:border-gray-800">
        <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Olá, {displayName}</h1>
            <p className="text-sm text-gray-500">Bem-vindo de volta ao seu painel de controle.</p>
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
                                                <div className="flex-1"><p className="text-sm font-bold text-gray-900 dark:text-white">Contrato #{loan.id.substring(0,6)}</p></div>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-6">
          {/* Card 1 */}
          <div className="bg-card-light dark:bg-card-dark p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium">Total Recebido</span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl md:text-2xl font-bold block text-green-600 dark:text-green-400">
                 {loading ? '...' : `R$ ${summary.totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>
          </div>

          {/* Card 2 */}
          <div 
            onClick={onViewInterestDetails}
            className="bg-card-light dark:bg-card-dark p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between h-32 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium">Juros Recebidos</span>
              <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl md:text-2xl font-bold block text-blue-600 dark:text-blue-400">
                 {loading ? '...' : `R$ ${summary.totalInterestReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>
          </div>

          {/* Card 3 */}
          <div 
            onClick={onViewClients}
            className="bg-card-light dark:bg-card-dark p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between h-32 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium">Clientes</span>
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl md:text-2xl font-bold block text-gray-900 dark:text-white">
                {loading ? '...' : summary.totalClients}
              </span>
              <span className="text-[10px] text-red-500 block mt-1 font-medium">
                {summary.lateCount} clientes com atraso
              </span>
            </div>
          </div>

          {/* Card 4 */}
          <div 
            onClick={onViewLateLoans}
            className="bg-card-light dark:bg-card-dark p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between h-32 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium">Em Atraso</span>
              <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500 dark:text-red-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl md:text-2xl font-bold block text-red-600 dark:text-red-400">
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
                                                {(loan.client as any)?.name?.substring(0,2).toUpperCase() || 'CL'}
                                            </div>
                                            <span className="text-sm font-medium text-gray-900 dark:text-white">{(loan.client as any)?.name || 'Cliente'}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 text-sm text-gray-600 dark:text-gray-300">
                                        R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                                    cursor={{fill: 'transparent'}}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 10, fill: '#9CA3AF'}} 
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
                            <span className="font-bold text-gray-900 dark:text-white">R$ {summary.todayChargesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
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

        {/* Collection Calendar Card (Mobile Only) */}
        <div 
            onClick={onViewCollectionCalendar}
            className="md:hidden bg-card-light dark:bg-card-dark rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 min-h-[16rem] cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500">
              <Calendar className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Calendário de Cobranças</h2>
          </div>
          <div className="flex flex-col items-center justify-center h-48 text-center space-y-4">
            <div className="relative w-24 h-24 mb-2">
                 <div className="absolute inset-0 bg-blue-50 dark:bg-blue-900/20 rounded-full animate-pulse"></div>
                 <div className="absolute inset-2 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-sm flex-col">
                    <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">{summary.todayChargesCount}</span>
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Hoje</span>
                 </div>
            </div>
            <div>
              <p className="text-base font-medium text-gray-500 dark:text-gray-400">
                {summary.todayChargesCount > 0 ? `${summary.todayChargesCount} cobranças previstas para hoje.` : "Nenhuma cobrança para hoje."}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                 Toque para ver o calendário completo.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
