import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, ChevronRight, AlertTriangle, Calendar, Hourglass, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan } from '../types';

interface LoansProps {
    onLoanSelect?: (loanId: string) => void;
    initialFilter?: 'active' | 'late' | 'paid';
    onFilterChange?: (filter: 'active' | 'late' | 'paid') => void;
}

export const Loans: React.FC<LoansProps> = ({ onLoanSelect, initialFilter = 'active', onFilterChange }) => {
    const [filter, setFilter] = useState<'active' | 'late' | 'paid'>(initialFilter);
    const [loans, setLoans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

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
                    client:clients (name, avatar_url)
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

    const getOldestLateInstallmentDate = (loan: Loan): Date | null => {
        if (loan.status === 'paid') return null;
    
        const count = loan.installments || 1;
        const installmentValue = loan.installment_value || (loan.amount / count);
        const startDate = loan.due_date ? new Date(loan.due_date) : new Date(loan.created_at || Date.now());
        
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
                 return date;
             }
             return null; // First unpaid is in future or today
        }
        
        return null;
    };

    const isLoanLate = (loan: Loan): boolean => {
        if (loan.status === 'paid') return false;
        if (loan.status === 'late') return true;
        return getOldestLateInstallmentDate(loan) !== null;
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
        
        if (searchTerm) {
             const clientName = loan.client?.name?.toLowerCase() || '';
             return clientName.includes(searchTerm.toLowerCase());
        }
        return true;
    });

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <header className="bg-primary dark:bg-black text-white rounded-b-b-header px-6 pt-12 pb-8 shadow-lg relative z-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Empréstimos</h1>
        </div>
        <div className="relative mb-2">
          <input 
            className="w-full py-3.5 pl-12 pr-4 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-white/30 transition shadow-sm bg-white/10 backdrop-blur-sm border border-white/20" 
            placeholder="Buscar por cliente..." 
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
             onClick={() => setFilter('active')}
             className={`px-5 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap transition-colors ${filter === 'active' ? 'bg-primary text-white' : 'bg-white text-text-sub-light border border-gray-200'}`}
           >
            Ativos
          </button>
          <button 
             onClick={() => setFilter('late')}
             className={`px-5 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap transition-colors ${filter === 'late' ? 'bg-primary text-white' : 'bg-white text-text-sub-light border border-gray-200'}`}
           >
            Atrasados
          </button>
          <button 
             onClick={() => setFilter('paid')}
             className={`px-5 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap transition-colors ${filter === 'paid' ? 'bg-primary text-white' : 'bg-white text-text-sub-light border border-gray-200'}`}
           >
            Quitados
          </button>
        </div>
      </div>

      <main className="flex-1 px-5 pt-2 pb-32 overflow-y-auto no-scrollbar">
        <div className="space-y-4">
          {filteredLoans.length === 0 && !loading && (
             <div className="text-center text-gray-400 mt-10">
                Nenhum empréstimo encontrado.
             </div>
          )}

          {filteredLoans.map((loan) => {
            const lateDate = getOldestLateInstallmentDate(loan);
            const isLate = lateDate !== null || loan.status === 'late';
            const displayStatus = isLate ? 'late' : loan.status;
            
            // Format date for display
            const formatDate = (dateString: string | Date) => {
                if (!dateString) return '';
                const date = new Date(dateString);
                // Adjust for timezone offset to display correct local date
                const userTimezoneOffset = date.getTimezoneOffset() * 60000;
                const adjustedDate = new Date(date.getTime() + userTimezoneOffset);
                return adjustedDate.toLocaleDateString('pt-BR');
            };

            const lateDateDisplay = lateDate ? lateDate.toLocaleDateString('pt-BR') : (loan.due_date ? formatDate(loan.due_date) : '');

            return (
            <div 
                key={loan.id} 
                onClick={() => onLoanSelect?.(loan.id)}
                className="bg-card-light dark:bg-card-dark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98] transform duration-150"
            >
              
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-gray-200 overflow-hidden`}>
                    {loan.client?.avatar_url ? (
                        <img src={loan.client.avatar_url} alt="Client" className="w-full h-full rounded-full object-cover" />
                    ) : (
                        <span>{loan.client?.name?.substring(0, 2).toUpperCase() || 'CX'}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm">{loan.client?.name || 'Cliente'}</h3>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Contrato #{loan.id.substring(0,6)}</p>
                  </div>
                </div>
                
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                    displayStatus === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                    displayStatus === 'late' ? 'bg-red-50 text-red-700 border-red-200' :
                    displayStatus === 'paid' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                    'bg-orange-50 text-orange-700 border-orange-200'
                }`}>
                    {displayStatus === 'active' ? 'Em dia' : displayStatus === 'late' ? 'Em atraso' : displayStatus === 'paid' ? 'Pago' : 'Pendente'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                    <p className="text-xs text-gray-500 mb-0.5">Valor Original</p>
                    <p className="font-bold text-gray-900 dark:text-white">R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-gray-500 mb-0.5">Saldo Devedor</p>
                    <p className="font-bold text-gray-900 dark:text-white">R$ {Number(loan.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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

              <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                {displayStatus === 'pending' ? (
                     <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Hourglass className="w-3.5 h-3.5" />
                        <span>Aguardando Aprovação</span>
                     </div>
                ) : displayStatus === 'late' ? (
                    <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Venceu: {lateDateDisplay}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Vencimento: {formatDate(loan.due_date)}</span>
                    </div>
                )}
                
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>

            </div>
          )})}
        </div>
      </main>
    </div>
  );
};