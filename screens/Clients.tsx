import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, ChevronRight, RefreshCw, Plus, Filter, MoreVertical, Mail, Phone, MessageSquare, MapPin, X, ChevronLeft, Calendar as CalendarIcon, DollarSign, User, MessageCircle, CreditCard, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Client, Loan } from '../types';

interface ClientsProps {
    onClientSelect: (clientId: string) => void;
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

export const Clients: React.FC<ClientsProps> = ({ onClientSelect }) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'late'>('all');
  const [clients, setClients] = useState<ExtendedClient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
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
        .select('*, client_id, balance, status, due_date, created_at, installments, installment_value, frequency, skip_saturday, skip_sunday, amount')
        .order('created_at', { ascending: false });

      if (loansError) throw loansError;

      const clientsWithDebt = clientsData.map((client: any) => {
        const clientLoans = loansData.filter((l: any) => l.client_id === client.id);
        const debt = clientLoans.reduce((acc: number, curr: any) => acc + Number(curr.balance), 0);
        
        const isLate = clientLoans.some((loan: any) => isLoanLate(loan));
        const overdueStats = clientLoans.reduce((acc: { count: number, amount: number }, curr: any) => {
            const stats = calculateOverdueStats(curr);
            return { count: acc.count + stats.count, amount: acc.amount + stats.amount };
        }, { count: 0, amount: 0 });

        const contractsCount = clientLoans.filter((l: any) => l.status === 'active' || l.status === 'late').length;
        const lastLoan = clientLoans.length > 0 ? clientLoans[0] : undefined;
        
        return {
            ...client,
            initials: client.name.substring(0, 2).toUpperCase(),
            debt: debt,
            isLate: isLate,
            overdueStats: overdueStats,
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

      {/* Desktop View */}
      <div className="hidden md:flex h-full bg-gray-50 dark:bg-gray-900">
        <div className="flex-1 flex flex-col min-w-0">
            {/* Desktop Header */}
            <header className="px-8 py-6 bg-white dark:bg-card-dark border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestão de Clientes</h1>
                    <span className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-semibold rounded-full">
                        {clients.length} total
                    </span>
                </div>
                <button 
                    onClick={() => onClientSelect('new')} // Assuming 'new' or handling navigation in parent
                    className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Novo Cliente
                </button>
            </header>

            {/* Filters Bar */}
            <div className="px-8 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-card-dark flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Buscar por nome, CPF ou ID..." 
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 mx-2"></div>

                <select 
                    className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:outline-none"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as any)}
                >
                    <option value="all">Status: Todos</option>
                    <option value="active">Status: Ativos</option>
                    <option value="late">Status: Em Atraso</option>
                </select>

                <select className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:outline-none">
                    <option>Data: Últimos 30 dias</option>
                </select>

                <div className="flex-1"></div>

                <button className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-2 text-sm font-medium">
                    <SlidersHorizontal className="w-4 h-4" />
                    Filtros Avançados
                </button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto p-8">
                <div className="bg-white dark:bg-card-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Saldo Ativo</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Data de Cadastro</th>
                                <th className="p-4 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {filteredClients.map((client) => (
                                <tr 
                                    key={client.id} 
                                    className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer ${selectedClientDesktop?.id === client.id ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}
                                    onClick={() => setSelectedClientDesktop(client)}
                                >
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center text-gray-500 font-bold text-xs">
                                                {client.avatar_url ? (
                                                    <img src={client.avatar_url} alt={client.initials} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span>{client.initials}</span>
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-gray-900 dark:text-white">{client.name}</p>
                                                <p className="text-xs text-gray-500">ID: #{client.id.substring(0, 6)}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                            client.isLate 
                                                ? 'bg-red-100 text-red-700' 
                                                : client.status === 'active' 
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-gray-100 text-gray-600'
                                        }`}>
                                            {client.isLate ? 'Inadimplente' : (client.status === 'active' ? 'Ativo' : 'Inativo')}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <p className="font-bold text-sm text-gray-900 dark:text-white">R$ {client.debt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        <p className="text-xs text-gray-500">{client.contractsCount} contratos</p>
                                    </td>
                                    <td className="p-4 text-sm text-gray-600 dark:text-gray-400">
                                        {formatDate(client.created_at)}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button className="text-gray-400 hover:text-gray-600">
                                            <MoreVertical className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredClients.length === 0 && (
                        <div className="p-12 text-center text-gray-400">
                            Nenhum cliente encontrado com os filtros atuais.
                        </div>
                    )}
                </div>
                
                {/* Pagination (Mocked) */}
                <div className="flex justify-end items-center gap-2 mt-4">
                    <button className="w-8 h-8 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs">
                        <ChevronLeft className="w-3 h-3" />
                    </button>
                    <button className="w-8 h-8 flex items-center justify-center rounded bg-black text-white text-xs font-bold">1</button>
                    <button className="w-8 h-8 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs">2</button>
                    <button className="w-8 h-8 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs">3</button>
                    <span className="text-gray-400 text-xs">...</span>
                    <button className="w-8 h-8 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs">125</button>
                    <button className="w-8 h-8 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs">
                        <ChevronRight className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </div>

        {/* Quick View Sidebar */}
        {selectedClientDesktop && (
            <div className="w-96 bg-white dark:bg-card-dark border-l border-gray-200 dark:border-gray-800 flex flex-col shadow-xl z-20">
                <div className="p-6 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
                    <h3 className="font-bold text-gray-900 dark:text-white">Detalhes</h3>
                    <button onClick={() => setSelectedClientDesktop(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="flex flex-col items-center text-center mb-8">
                        <div className="w-24 h-24 rounded-full bg-gray-100 mb-4 overflow-hidden flex items-center justify-center text-gray-400">
                             {selectedClientDesktop.avatar_url ? (
                                <img src={selectedClientDesktop.avatar_url} alt={selectedClientDesktop.initials} className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-10 h-10" />
                            )}
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedClientDesktop.name}</h2>
                        <p className="text-sm text-gray-500">{selectedClientDesktop.email || 'Sem e-mail'}</p>
                        
                        <div className="flex gap-2 mt-4">
                            <button 
                                onClick={() => {
                                    if (selectedClientDesktop.phone) {
                                        window.open(`https://wa.me/55${selectedClientDesktop.phone.replace(/\D/g, '')}`, '_blank');
                                    }
                                }}
                                className="p-2 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 transition-colors flex items-center gap-2 px-3"
                                title="Abrir WhatsApp"
                            >
                                <MessageCircle className="w-4 h-4" />
                                <span className="text-xs font-bold">WhatsApp</span>
                            </button>
                            <button 
                                onClick={() => {
                                    if (selectedClientDesktop.address) {
                                        const addressQuery = `${selectedClientDesktop.address}, ${selectedClientDesktop.number || ''}, ${selectedClientDesktop.city || ''}, ${selectedClientDesktop.state || ''}`;
                                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`, '_blank');
                                    }
                                }}
                                className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors flex items-center gap-2 px-3"
                                title="Ver no Mapa"
                            >
                                <MapPin className="w-4 h-4" />
                                <span className="text-xs font-bold">Mapa</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Situação</span>
                            <p className={`text-lg font-bold mt-1 ${selectedClientDesktop.isLate ? 'text-red-500' : 'text-green-500'}`}>
                                {selectedClientDesktop.isLate ? 'Inadimplente' : 'Em dia'}
                            </p>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Contratos</span>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{selectedClientDesktop.contractsCount.toString().padStart(2, '0')}</p>
                        </div>
                    </div>

                    <div className="mb-8">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Contratos</h4>
                        <div className="space-y-3">
                            {selectedClientDesktop.loans && selectedClientDesktop.loans.length > 0 ? (
                                selectedClientDesktop.loans.map((loan) => (
                                    <div key={loan.id} className="bg-[#1E1E24] text-white p-5 rounded-xl relative overflow-hidden">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <span className="text-[10px] text-gray-400 block uppercase font-bold">Contrato #{loan.id.substring(0, 6)}</span>
                                                <span className="text-xl font-bold">R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                                loan.status === 'active' ? 'bg-green-500/20 text-green-400' : 
                                                loan.status === 'paid' ? 'bg-gray-500/20 text-gray-400' : 
                                                'bg-red-500/20 text-red-400'
                                            }`}>
                                                {loan.status === 'active' ? 'Ativo' : loan.status === 'paid' ? 'Pago' : 'Atrasado'}
                                            </span>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                                <span>Progresso</span>
                                                <span>{loan.installments} parcelas</span>
                                            </div>
                                            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-green-500 rounded-full transition-all duration-500" 
                                                    style={{ width: `${loan.progress || 0}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-sm text-gray-500 italic">Nenhum empréstimo registrado.</div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4 mb-8">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Informações de Contato</h4>
                        <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                            <Phone className="w-4 h-4 mt-0.5 text-gray-400" />
                            <div className="flex-1">
                                <p className="text-[10px] text-gray-400 uppercase font-bold">Telefone</p>
                                <span>{selectedClientDesktop.phone || 'Não informado'}</span>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                            <CreditCard className="w-4 h-4 mt-0.5 text-gray-400" />
                            <div className="flex-1">
                                <p className="text-[10px] text-gray-400 uppercase font-bold">CPF</p>
                                <span>{selectedClientDesktop.cpf || 'Não informado'}</span>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                            <Mail className="w-4 h-4 mt-0.5 text-gray-400" />
                            <div className="flex-1">
                                <p className="text-[10px] text-gray-400 uppercase font-bold">E-mail</p>
                                <span>{selectedClientDesktop.email || 'Não informado'}</span>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                            <MapPin className="w-4 h-4 mt-0.5 text-gray-400" />
                            <div className="flex-1">
                                <p className="text-[10px] text-gray-400 uppercase font-bold">Endereço</p>
                                <span>
                                    {selectedClientDesktop.address ? `${selectedClientDesktop.address}, ${selectedClientDesktop.number || 'S/N'}${selectedClientDesktop.city ? ` - ${selectedClientDesktop.city}/${selectedClientDesktop.state}` : ''}` : 'Não informado'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mb-8">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Documentos Anexados</h4>
                        {selectedClientDesktop.documents && selectedClientDesktop.documents.length > 0 ? (
                            <div className="grid grid-cols-3 gap-3">
                                {selectedClientDesktop.documents.map((docUrl, index) => (
                                    <a 
                                        key={index} 
                                        href={docUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="aspect-square bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden relative group shadow-sm hover:shadow-md transition-all"
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
                                            <FileText className="w-8 h-8 mb-1" />
                                            <span className="text-[10px]">Arquivo</span>
                                        </div>
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ExternalLink className="text-white w-6 h-6" />
                                        </div>
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-dashed border-gray-300 dark:border-gray-700 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
                                <FileText className="w-8 h-8 opacity-20" />
                                <span>Nenhum documento anexado.</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 dark:border-gray-800">
                    <button 
                        onClick={() => onClientSelect(selectedClientDesktop.id)}
                        className="w-full py-3 border border-gray-200 dark:border-gray-700 rounded-xl font-bold text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        Ver Perfil Completo
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};