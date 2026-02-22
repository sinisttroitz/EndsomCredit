import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, ChevronRight, AlertTriangle, Calendar, Hourglass, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan } from '../types';

interface LoansProps {
    onLoanSelect?: (loanId: string) => void;
}

export const Loans: React.FC<LoansProps> = ({ onLoanSelect }) => {
    const [filter, setFilter] = useState<'all' | 'pending' | 'late'>('all');
    const [loans, setLoans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchLoans();
    }, []);

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

    const filteredLoans = loans.filter(loan => {
        if (filter !== 'all' && loan.status !== filter) return false;
        
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
          <button onClick={fetchLoans} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20">
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <SlidersHorizontal className="w-5 h-5" />}
          </button>
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
             onClick={() => setFilter('all')}
             className={`px-5 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap transition-colors ${filter === 'all' ? 'bg-primary text-white' : 'bg-white text-text-sub-light border border-gray-200'}`}
           >
            Todos
          </button>
          <button 
             onClick={() => setFilter('pending')}
             className={`px-5 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap transition-colors ${filter === 'pending' ? 'bg-primary text-white' : 'bg-white text-text-sub-light border border-gray-200'}`}
           >
            Pendentes
          </button>
          <button 
             onClick={() => setFilter('late')}
             className={`px-5 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap transition-colors ${filter === 'late' ? 'bg-primary text-white' : 'bg-white text-text-sub-light border border-gray-200'}`}
           >
            Atrasados
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

          {filteredLoans.map((loan) => (
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
                    loan.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                    loan.status === 'late' ? 'bg-red-50 text-red-700 border-red-200' :
                    loan.status === 'paid' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                    'bg-orange-50 text-orange-700 border-orange-200'
                }`}>
                    {loan.status === 'active' ? 'Em dia' : loan.status === 'late' ? 'Em atraso' : loan.status === 'paid' ? 'Pago' : 'Pendente'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                    <p className="text-xs text-gray-500 mb-0.5">Valor Original</p>
                    <p className="font-bold text-gray-900 dark:text-white">R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-gray-500 mb-0.5">Saldo Devedor</p>
                    <p className="font-bold text-gray-900 dark:text-white">R$ {Number(loan.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-500">Progresso</span>
                    <span className="font-medium text-gray-900">{loan.progress}%</span>
                </div>
                <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div 
                        className={`h-full rounded-full ${loan.status === 'late' ? 'bg-red-500' : loan.status === 'pending' ? 'bg-gray-400' : 'bg-green-500'}`} 
                        style={{ width: `${loan.progress}%` }}
                    ></div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                {loan.status === 'pending' ? (
                     <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Hourglass className="w-3.5 h-3.5" />
                        <span>Aguardando Aprovação</span>
                     </div>
                ) : loan.status === 'late' ? (
                    <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Venceu: {loan.due_date}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Vencimento: {loan.due_date}</span>
                    </div>
                )}
                
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>

            </div>
          ))}
        </div>
      </main>
    </div>
  );
};