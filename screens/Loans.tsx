import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, ChevronRight, AlertTriangle, Calendar, Hourglass, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan } from '../types';
import { generateInstallments } from '../utils/loanUtils';

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
        
        if (searchTerm) {
             const clientName = loan.client?.name?.toLowerCase() || '';
             return clientName.includes(searchTerm.toLowerCase());
        }
        return true;
    });

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <header className="bg-primary dark:bg-black text-white rounded-b-b-header px-6 pt-12 pb-8 shadow-lg relative z-10 md:rounded-none md:pt-6 md:pb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 md:mb-0">
          <h1 className="text-3xl font-bold tracking-tight">Empréstimos</h1>
          
          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            <div className="relative w-full md:w-64">
                <input 
                    className="w-full py-3.5 pl-12 pr-4 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-white/30 transition shadow-sm bg-white/10 backdrop-blur-sm border border-white/20 md:py-2" 
                    placeholder="Buscar por cliente..." 
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)} 
                />
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="text-gray-300 w-5 h-5" />
                </div>
            </div>

            <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-2 md:pb-0">
                <button 
                    onClick={() => setFilter('active')}
                    className={`px-5 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap transition-colors ${filter === 'active' ? 'bg-white text-primary font-bold' : 'bg-white/10 text-white border border-white/20 hover:bg-white/20'}`}
                >
                    Ativos
                </button>
                <button 
                    onClick={() => setFilter('late')}
                    className={`px-5 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap transition-colors ${filter === 'late' ? 'bg-white text-primary font-bold' : 'bg-white/10 text-white border border-white/20 hover:bg-white/20'}`}
                >
                    Atrasados
                </button>
                <button 
                    onClick={() => setFilter('paid')}
                    className={`px-5 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap transition-colors ${filter === 'paid' ? 'bg-white text-primary font-bold' : 'bg-white/10 text-white border border-white/20 hover:bg-white/20'}`}
                >
                    Quitados
                </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Filters (Hidden on Desktop) */}
      <div className="px-6 mt-6 mb-2 md:hidden">
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
                                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold overflow-hidden">
                                            {loan.client?.avatar_url ? (
                                                <img src={loan.client.avatar_url} alt="Client" className="w-full h-full object-cover" />
                                            ) : (
                                                <span>{loan.client?.name?.substring(0, 2).toUpperCase() || 'CX'}</span>
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 dark:text-white text-sm">{loan.client?.name || 'Cliente'}</p>
                                            <p className="text-[10px] text-gray-400">#{loan.id.substring(0,6)}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4 text-sm text-gray-600 dark:text-gray-300">
                                    R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="p-4 text-sm font-bold text-gray-900 dark:text-white">
                                    R$ {outstandingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                                        displayStatus === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
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

              <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                {displayStatus === 'pending' ? (
                     <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Hourglass className="w-3.5 h-3.5" />
                        <span>Aguardando Aprovação</span>
                     </div>
                ) : displayStatus === 'late' ? (
                    <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Venceu: {dateDisplayStr}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Vencimento: {dateDisplayStr}</span>
                    </div>
                )}
                
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>

            </div>
          )})}
          </div>
        </div>
      </main>
    </div>
  );
};