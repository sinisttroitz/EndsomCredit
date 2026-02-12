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
        .select('client_id, balance, status');

      if (loansError) throw loansError;

      const clientsWithDebt = clientsData.map((client: any) => {
        const clientLoans = loansData.filter((l: any) => l.client_id === client.id);
        const debt = clientLoans.reduce((acc: number, curr: any) => acc + Number(curr.balance), 0);
        
        // Determine status based on loans. If any loan is late, client is late.
        // If all loans paid, client is paid (or active if we consider 'customer lifetime')
        // Defaulting to stored status, but updating locally based on debt logic if needed.
        
        return {
            ...client,
            initials: client.name.substring(0, 2).toUpperCase(),
            debt: debt
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
    const matchesFilter = filter === 'all' ? true : client.status === filter;
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <header className="bg-primary dark:bg-black text-white rounded-b-b-header px-6 pt-12 pb-8 shadow-lg relative z-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <button onClick={fetchClients} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 active:bg-white/20">
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <SlidersHorizontal className="w-5 h-5" />}
          </button>
        </div>
        <div className="relative mb-2">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="text-gray-300 w-5 h-5" />
          </div>
          <input 
            className="w-full py-3.5 pl-12 pr-4 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-white/30 transition shadow-sm bg-white/10 backdrop-blur-sm border border-white/20" 
            placeholder="Buscar por nome..." 
            type="text" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
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
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${
                  client.status === 'active' 
                    ? 'bg-green-100 text-green-700 border-green-200' 
                    : client.status === 'late' 
                        ? 'bg-red-100 text-red-700 border-red-200'
                        : 'bg-gray-100 text-gray-700 border-gray-200'
                }`}>
                  {client.status === 'active' ? 'Em dia' : client.status === 'late' ? 'Atrasado' : 'Quitado'}
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