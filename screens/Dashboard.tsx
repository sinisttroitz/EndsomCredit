import React, { useEffect, useState } from 'react';
import { Search, DollarSign, TrendingUp, Users, AlertTriangle, Bell, CheckCircle, X, ChevronRight, User, FileText, Calendar } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan, Client } from '../types';
import { generateInstallments } from '../utils/loanUtils';

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
    lateAmount: 0,
    activeCount: 0,
    lateCount: 0,
    totalInterestReceived: 0,
    todayChargesCount: 0,
    userEmail: '',
    userName: ''
  });
  const [loading, setLoading] = useState(true);
  
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
         // Use small epsilon
         if (paidAccumulator + (installmentValue * 0.99) < totalPaid) {
             paidAccumulator += installmentValue;
             continue; // This one is paid
         }
         
         // This is the first unpaid installment
         const today = new Date();
         // Reset time part for accurate date comparison
         const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
         const dateZero = new Date(date.getFullYear(), date.getMonth(), date.getDate());
         
         if (dateZero < todayZero) {
             return true;
         }
         return false; // First unpaid is in future or today
    }
    
    return false;
  };

    const calculateOverdueAmount = (loan: Loan): number => {
    if (loan.status === 'paid') return 0;

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
         }
    }
    
    return overdueSum;
  };

  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Fetch Clients
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, status');

      if (clientsError) throw clientsError;

      // Fetch Loans
      const { data: loans, error: loansError } = await supabase
        .from('loans')
        .select('*');

      if (loansError) throw loansError;

      // Calculations
      let totalLent = 0;
      let totalReceived = 0;
      let lateAmount = 0;
      let activeCount = 0;
      let lateCount = 0;
      let totalInterestReceived = 0;
      let todayChargesCount = 0;

      const today = new Date();
      const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      loans?.forEach((loan: Loan) => {
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
        // Total Received = Total Debt - Remaining Balance
        // If totalDebt is 0 (legacy data), fallback to amount - balance, but ideally use totalDebt
        if (totalDebt > 0) {
            loanReceived = (totalDebt - balance);
        } else {
            loanReceived = (amount - balance);
        }
        totalReceived += loanReceived;

        // Calculate Interest Received for this loan
        
        // 1. Add historical interest paid (from renewals)
        totalInterestReceived += (Number(loan.total_interest_paid) || 0);

        // 2. Add interest from the final payment if the loan is fully paid
        if (loan.status === 'paid' && totalDebt > 0 && amount > 0) {
             // For paid loans, the interest received is the total expected interest
             // (Total Debt - Principal)
             const interest = totalDebt - amount;
             totalInterestReceived += interest;
        }

        if (isLoanLate(loan)) {
            lateAmount += calculateOverdueAmount(loan);
            lateCount++;
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
        }
      });

      clients?.forEach((client: Client) => {
         if (client.status === 'active') activeCount++;
      });

      setSummary({
        totalLent,
        totalReceived,
        totalActiveClients: activeCount,
        lateAmount,
        activeCount,
        lateCount,
        totalInterestReceived,
        todayChargesCount,
        userEmail: user?.email || 'Admin',
        userName: user?.user_metadata?.full_name || ''
      });

    } catch (error) {
      console.error("Error fetching dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  const displayName = summary.userName || summary.userEmail.split('@')[0];
  const userInitial = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      {/* Header */}
      <header className="bg-primary dark:bg-black text-white rounded-b-b-header px-6 pt-12 pb-8 shadow-lg relative z-10">
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

          {/* Search Results Dropdown */}
          {(searchQuery.length > 2 && (searchResults.clients.length > 0 || searchResults.loans.length > 0 || isSearching)) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden max-h-96 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
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

      {/* Content */}
      <main className="flex-1 px-5 pt-6 pb-24 overflow-y-auto no-scrollbar">
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Card 1 */}
          <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium">Total Recebido</span>
              <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl font-bold block text-gray-900 dark:text-white">
                 {loading ? '...' : `R$ ${summary.totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>
          </div>

            {/* Card 2 */}
          <div 
            onClick={onViewInterestDetails}
            className="bg-card-light dark:bg-card-dark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between h-32 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium">Juros Recebidos</span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl font-bold block text-blue-600 dark:text-blue-400">
                {loading ? '...' : `R$ ${summary.totalInterestReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>
          </div>

          {/* Card 3 */}
          <div 
            onClick={onViewClients}
            className="bg-card-light dark:bg-card-dark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between h-32 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium">Clientes Ativos</span>
              <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center text-gray-600 dark:text-gray-300">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl font-bold block text-gray-900 dark:text-white">
                {loading ? '...' : summary.totalActiveClients}
              </span>
              <span className="text-[10px] text-gray-400 block mt-1">{summary.lateCount} Contratos Atrasados</span>
            </div>
          </div>

          {/* Card 4 */}
          <div 
            onClick={onViewLateLoans}
            className="bg-card-light dark:bg-card-dark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between h-32 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium">Em Atraso</span>
              <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500 dark:text-red-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl font-bold block text-red-500 dark:text-red-400">
                {loading ? '...' : `R$ ${summary.lateAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
              <span className="text-[10px] text-red-400/80 block mt-1">{summary.lateCount} contratos</span>
            </div>
          </div>
        </div>

        {/* Collection Calendar Card */}
        <div 
            onClick={onViewCollectionCalendar}
            className="bg-card-light dark:bg-card-dark rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 min-h-[16rem] cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]"
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