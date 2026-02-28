import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, ChevronRight, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Client, Loan } from '../types';

interface ClientsProps {
    onClientSelect: (clientId: string) => void;
}

export const Clients: React.FC<ClientsProps> = ({ onClientSelect }) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'late'>('all');
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

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
        .select('client_id, balance, status, due_date, created_at, installments, installment_value, frequency, skip_saturday, skip_sunday, amount');

      if (loansError) throw loansError;

      const clientsWithDebt = clientsData.map((client: any) => {
        const clientLoans = loansData.filter((l: any) => l.client_id === client.id);
        const debt = clientLoans.reduce((acc: number, curr: any) => acc + Number(curr.balance), 0);
        
        const isLate = clientLoans.some((loan: any) => isLoanLate(loan));
        const overdueStats = clientLoans.reduce((acc: { count: number, amount: number }, curr: any) => {
            const stats = calculateOverdueStats(curr);
            return { count: acc.count + stats.count, amount: acc.amount + stats.amount };
        }, { count: 0, amount: 0 });
        
        return {
            ...client,
            initials: client.name.substring(0, 2).toUpperCase(),
            debt: debt,
            isLate: isLate,
            overdueStats: overdueStats
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

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <header className="bg-primary dark:bg-black text-white rounded-b-b-header px-6 pt-12 pb-8 shadow-lg relative z-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
        </div>
        <div className="relative mb-2">
          <input 
            className="w-full py-3.5 pl-12 pr-4 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-white/30 transition shadow-sm bg-white/10 backdrop-blur-sm border border-white/20" 
            placeholder="Buscar por nome..." 
            type="text" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="text-gray-300 w-5 h-5" />
          </div>
        </div>
      </header>

      <div className="px-6 mt-6 mb-2">
        <div className="flex space-x-3 overflow-x-auto no-scrollbar pb-2">
          <button 
            onClick={() => setFilter('all')}
            className={`px-5 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap transition-colors ${filter === 'all' ? 'bg-primary text-white' : 'bg-white text-text-sub-light border border-gray-200'}`}
          >
            Todos
          </button>
          <button 
             onClick={() => setFilter('active')}
            className={`px-5 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap transition-colors ${filter === 'active' ? 'bg-primary text-white' : 'bg-white text-text-sub-light border border-gray-200'}`}
          >
            Ativos
          </button>
          <button 
             onClick={() => setFilter('late')}
            className={`px-5 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap transition-colors ${filter === 'late' ? 'bg-primary text-white' : 'bg-white text-text-sub-light border border-gray-200'}`}
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
          
          {filteredClients.map((client) => (
            <div 
                key={client.id} 
                onClick={() => onClientSelect(client.id)}
                className="bg-card-light dark:bg-card-dark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98] transform duration-150"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center text-gray-500 font-bold">
                  {client.avatar_url ? (
                    <img src={client.avatar_url} alt={client.initials} className="w-full h-full object-cover" />
                  ) : (
                    <span>{client.initials}</span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{client.name}</h3>
                  <p className="text-xs text-text-sub-light dark:text-text-sub-dark mt-0.5">
                    Saldo Devedor: <span className="font-semibold text-gray-800 dark:text-gray-200">R$ {client.debt?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </p>
                  {(client as any).overdueStats?.count > 0 && (
                      <p className="text-[10px] text-red-500 font-medium mt-0.5">
                        Parcelas Atrasadas: {(client as any).overdueStats.count} de R$ {((client as any).overdueStats.amount / (client as any).overdueStats.count).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${
                  (client as any).isLate 
                    ? 'bg-red-100 text-red-700 border-red-200' 
                    : client.status === 'active' 
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-gray-100 text-gray-700 border-gray-200'
                }`}>
                  {(client as any).isLate ? 'Irregular' : (client.status === 'active' ? 'Em dia' : 'Quitado')}
                </span>
                <ChevronRight className="text-gray-300 w-5 h-5 mt-2" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};