import React, { useEffect, useState } from 'react';
import { Search, DollarSign, TrendingUp, Users, AlertTriangle, Bell, CheckCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan, Client } from '../types';

export const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState({
    totalLent: 0,
    totalReceived: 0,
    totalActiveClients: 0,
    lateAmount: 0,
    activeCount: 0,
    lateCount: 0,
    userEmail: ''
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

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

      loans?.forEach((loan: Loan) => {
        const amount = Number(loan.amount);
        const balance = Number(loan.balance);
        
        totalLent += amount;
        totalReceived += (amount - balance);

        if (loan.status === 'late') {
            lateAmount += balance;
            lateCount++;
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
        userEmail: user?.email || 'Admin'
      });

    } catch (error) {
      console.error("Error fetching dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  const userName = summary.userEmail.split('@')[0];
  const userInitial = userName.charAt(0).toUpperCase();

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
            <h1 className="text-3xl font-bold tracking-tight">Olá, {userName}!</h1>
            <p className="text-gray-400 text-sm">Bem-vindo de volta</p>
          </div>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="text-gray-300 w-5 h-5" />
          </div>
          <input 
            className="w-full py-3.5 pl-12 pr-4 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-white/30 transition shadow-sm bg-white/10 backdrop-blur-sm border border-white/20" 
            placeholder="Buscar clientes ou empréstimos..." 
            type="text" 
          />
        </div>

        <div className="flex justify-between items-center bg-white/10 rounded-xl p-4 border border-white/5 backdrop-blur-sm">
          <div className="flex flex-col">
            <span className="text-gray-300 text-xs font-medium uppercase tracking-wider mb-1">Total Emprestado</span>
          </div>
          <div className="h-8 w-px bg-white/20 mx-4"></div>
          <div className="flex flex-col items-end">
            <span className="text-xl font-bold tracking-wide">
                {loading ? '...' : `R$ ${summary.totalLent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
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
                 {loading ? '...' : `R$ ${summary.totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              </span>
            </div>
          </div>

           {/* Card 2 */}
           <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium">Lucro Estimado</span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl font-bold block text-blue-600 dark:text-blue-400">R$ 0,00</span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
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
          <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium">Em Atraso</span>
              <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500 dark:text-red-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-xl font-bold block text-red-500 dark:text-red-400">
                {loading ? '...' : `R$ ${summary.lateAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              </span>
              <span className="text-[10px] text-red-400/80 block mt-1">{summary.lateCount} contratos</span>
            </div>
          </div>
        </div>

        {/* Alerts Section */}
        <div className="bg-card-light dark:bg-card-dark rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 min-h-[16rem]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-500">
              <Bell className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Alertas de Atraso</h2>
          </div>
          <div className="flex flex-col items-center justify-center h-48 text-center space-y-4 opacity-60">
            <div className="relative w-24 h-24 mb-2">
              {summary.lateAmount > 0 ? (
                 <>
                    <div className="absolute inset-0 bg-red-50 dark:bg-red-900/20 rounded-full animate-pulse"></div>
                    <div className="absolute inset-2 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-sm">
                        <AlertTriangle className="w-10 h-10 text-red-500" />
                    </div>
                 </>
              ) : (
                <>
                    <div className="absolute inset-0 bg-blue-50 dark:bg-blue-900/20 rounded-full animate-pulse"></div>
                    <div className="absolute inset-2 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-sm">
                        <CheckCircle className="w-10 h-10 text-green-500 dark:text-green-400/80" />
                    </div>
                </>
              )}
            </div>
            <div>
              <p className="text-base font-medium text-gray-500 dark:text-gray-400">
                {summary.lateAmount > 0 ? `Atenção: ${summary.lateCount} contratos atrasados.` : "Nenhum atraso crítico."}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                 {summary.lateAmount > 0 ? "Verifique a lista de empréstimos." : "Tudo em dia! Seus pagamentos estão ótimos."}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};