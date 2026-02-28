import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Plus, Minus, Calendar, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Client } from '../types';

interface NewLoanProps {
  onBack: () => void;
  onSuccess: () => void;
  preSelectedClientId: string | null;
  initialData?: {
    amount?: number;
    interestRate?: number;
    installments?: number;
    frequency?: string;
    skipSaturday?: boolean;
    skipSunday?: boolean;
  };
}

export const NewLoan: React.FC<NewLoanProps> = ({ onBack, onSuccess, preSelectedClientId, initialData }) => {
  const getDueDateByFrequency = (freq: string) => {
    const date = new Date();
    switch (freq) {
        case 'Diária':
            date.setDate(date.getDate() + 1);
            break;
        case 'Semanal':
            date.setDate(date.getDate() + 7);
            break;
        case 'Quinzenal':
            date.setDate(date.getDate() + 15);
            break;
        case 'Mensal':
            date.setDate(date.getDate() + 30);
            break;
        default:
            date.setDate(date.getDate() + 30);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [clientId, setClientId] = useState<string | null>(preSelectedClientId);
  const [frequency, setFrequency] = useState(initialData?.frequency || 'Diária');
  const [skipSaturday, setSkipSaturday] = useState(initialData?.skipSaturday || false);
  const [skipSunday, setSkipSunday] = useState(initialData?.skipSunday || false);
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '5000');
  const [interestRate, setInterestRate] = useState(initialData?.interestRate?.toString() || '30');
  const [installments, setInstallments] = useState(initialData?.installments || 12);
  const [dueDate, setDueDate] = useState(getDueDateByFrequency(initialData?.frequency || 'Diária'));
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [selectedClientName, setSelectedClientName] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  // Load pre-selected client if any
  useEffect(() => {
    if (preSelectedClientId) {
        supabase.from('clients').select('*').eq('id', preSelectedClientId).single()
        .then(({ data }) => {
            if (data) {
                setSelectedClientName(data.name);
                setSearchQuery(data.name);
            }
        });
    }
  }, [preSelectedClientId]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
        if (searchQuery.length > 2 && !clientId) {
            setSearching(true);
            const { data } = await supabase
                .from('clients')
                .select('*')
                .ilike('name', `%${searchQuery}%`)
                .limit(5);
            setSearchResults(data || []);
            setSearching(false);
        } else {
            setSearchResults([]);
        }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, clientId]);

  const selectClient = (client: Client) => {
    setClientId(client.id);
    setSelectedClientName(client.name);
    setSearchQuery(client.name);
    setSearchResults([]);
  };

  const clearClient = () => {
    setClientId(null);
    setSelectedClientName('');
    setSearchQuery('');
  };

  // Calculations
  const principal = parseFloat(amount.replace(/\./g, '').replace(',', '.')) || 0;
  const rate = parseFloat(interestRate) || 0;
  
  // Nova lógica: Juros simples aplicados uma única vez sobre o principal
  // juros = valor_principal × (taxa_juros / 100)
  const totalInterest = principal * (rate / 100);
  
  // total = valor_principal + juros
  const totalAmount = principal + totalInterest;
  
  // valor_parcela = total / numero_parcelas
  const monthlyPayment = installments > 0 ? totalAmount / installments : 0;

  const handleSave = async () => {
    if (!clientId) return alert("Selecione um cliente");
    
    setLoading(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No user");

        const { error } = await supabase.from('loans').insert([{
            client_id: clientId,
            user_id: user.id,
            amount: principal,
            balance: totalAmount, // Starts with full debt
            interest_rate: rate,
            installments: installments,
            installment_value: monthlyPayment,
            due_date: dueDate,
            status: 'active',
            frequency: frequency,
            skip_saturday: skipSaturday,
            skip_sunday: skipSunday,
            progress: 0
        }]);

        if (error) throw error;
        onSuccess();
    } catch (e) {
        console.error(e);
        alert("Erro ao criar empréstimo");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <header className="bg-primary dark:bg-black text-white rounded-b-b-header px-6 pt-12 pb-8 shadow-lg relative z-10">
        <div className="flex items-center mb-6">
          <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 mr-4 hover:bg-white/20 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold tracking-tight">Novo Empréstimo</h1>
        </div>
        <p className="text-gray-300 text-sm pl-1">Preencha os dados abaixo para simular e criar um novo contrato.</p>
      </header>

      <main className="flex-1 px-5 pt-6 pb-8 overflow-y-auto space-y-6 no-scrollbar">
        <section className="relative">
          <label className="block text-sm font-semibold text-text-main-light dark:text-text-main-dark mb-2 pl-1">Cliente</label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {clientId ? <Check className="text-green-500 w-5 h-5" /> : <Search className="text-gray-400 w-5 h-5" />}
              </div>
              <input 
                className={`w-full pl-10 pr-4 py-3 rounded-xl bg-card-light dark:bg-card-dark border focus:ring-2 focus:ring-primary dark:focus:ring-white focus:border-transparent outline-none transition-shadow shadow-sm text-sm ${clientId ? 'border-green-500 text-green-700 font-bold' : 'border-gray-200 dark:border-gray-700'}`}
                placeholder="Buscar cliente..." 
                type="text" 
                value={searchQuery}
                onChange={(e) => {
                    if(clientId) clearClient();
                    setSearchQuery(e.target.value);
                }}
              />
            </div>
          </div>
          
          {/* Search Results Dropdown */}
          {searchResults.length > 0 && !clientId && (
            <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-800 rounded-xl shadow-xl mt-2 z-50 border border-gray-100 dark:border-gray-700 overflow-hidden">
                {searchResults.map(client => (
                    <div 
                        key={client.id}
                        onClick={() => selectClient(client)}
                        className="p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-50 dark:border-gray-700/50 last:border-0"
                    >
                        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs">
                            {client.name.substring(0,2).toUpperCase()}
                        </div>
                        <div>
                            <p className="font-bold text-sm text-gray-800 dark:text-gray-200">{client.name}</p>
                            <p className="text-xs text-gray-400">{client.cpf || 'Sem CPF'}</p>
                        </div>
                    </div>
                ))}
            </div>
          )}
        </section>

        <section className="bg-card-light dark:bg-card-dark p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wide mb-4 flex items-center gap-2">
             DETALHES FINANCEIROS
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-sub-light dark:text-text-sub-dark mb-1.5">Valor do Empréstimo</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-text-sub-light dark:text-text-sub-dark font-medium">R$</span>
                </div>
                <input 
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-1 focus:ring-primary dark:focus:ring-white focus:border-primary dark:focus:border-white outline-none transition-all font-semibold text-lg text-primary dark:text-white" 
                    type="number" 
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-sub-light dark:text-text-sub-dark mb-1.5">Taxa de Juros (%)</label>
                <input 
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-1 focus:ring-primary dark:focus:ring-white outline-none transition-all font-semibold text-primary dark:text-white" 
                    type="number" 
                    value={interestRate}
                    onChange={e => setInterestRate(e.target.value)}
                />
              </div>
              {frequency !== 'Mensal' && (
              <div>
                <label className="block text-xs font-medium text-text-sub-light dark:text-text-sub-dark mb-1.5">Nº de Parcelas</label>
                <div className="relative flex items-center">
                  <button onClick={() => setInstallments(Math.max(1, installments - 1))} className="absolute left-1 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-primary dark:hover:text-white">
                    <Minus className="w-4 h-4" />
                  </button>
                  <input 
                    className="w-full px-10 py-3 text-center rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-1 focus:ring-primary dark:focus:ring-white outline-none transition-all font-semibold text-primary dark:text-white appearance-none" 
                    type="number" 
                    value={installments}
                    onChange={e => setInstallments(parseInt(e.target.value) || 1)}
                  />
                  <button onClick={() => setInstallments(installments + 1)} className="absolute right-1 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-primary dark:hover:text-white">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              )}
            </div>
          </div>
        </section>

        <section className="bg-card-light dark:bg-card-dark p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="mb-5">
            <label className="block text-xs font-medium text-text-sub-light dark:text-text-sub-dark mb-2">Frequência</label>
            <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
              {['Diária', 'Semanal', 'Quinzenal', 'Mensal'].map((freq) => (
                 <label key={freq} className="flex-1 cursor-pointer" onClick={() => {
                     setFrequency(freq);
                     if (freq === 'Mensal') setInstallments(1);
                     setDueDate(getDueDateByFrequency(freq));
                 }}>
                    <input 
                        type="radio" 
                        name="frequency" 
                        className="hidden" 
                        checked={frequency === freq} 
                        onChange={() => {
                            setFrequency(freq);
                            if (freq === 'Mensal') setInstallments(1);
                            setDueDate(getDueDateByFrequency(freq));
                        }}
                    />
                    <div className={`text-center py-2 rounded-lg text-sm font-medium transition-all duration-200 border border-transparent 
                        ${frequency === freq ? 'bg-primary text-white shadow-sm' : 'text-text-sub-light hover:text-primary'}`}>
                        {freq}
                    </div>
                 </label>
              ))}
            </div>
            {frequency === 'Diária' && (
                <div className="mt-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                        <span className="text-sm font-medium text-text-main-light dark:text-text-main-dark">Pular Sábado</span>
                        <div 
                            onClick={() => setSkipSaturday(!skipSaturday)}
                            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${skipSaturday ? 'bg-secondary' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${skipSaturday ? 'translate-x-6' : 'translate-x-0'}`}></div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                        <span className="text-sm font-medium text-text-main-light dark:text-text-main-dark">Pular Domingo</span>
                        <div 
                            onClick={() => setSkipSunday(!skipSunday)}
                            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${skipSunday ? 'bg-secondary' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${skipSunday ? 'translate-x-6' : 'translate-x-0'}`}></div>
                        </div>
                    </div>
                </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-text-sub-light dark:text-text-sub-dark mb-1.5">Primeiro Vencimento</label>
            <div className="relative">
              <input 
                className="w-full pl-4 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-1 focus:ring-primary dark:focus:ring-white outline-none transition-all font-medium text-primary dark:text-white" 
                type="date" 
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                <Calendar className="w-5 h-5 text-gray-400" />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-2xl border border-blue-100 dark:border-blue-900/40 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-100 dark:bg-blue-800/20 rounded-full blur-2xl"></div>
            <h2 className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-4 relative z-10 flex items-center gap-2">
                Prévia do Resultado
            </h2>
            <div className="space-y-3 relative z-10">
                <div className="flex justify-between items-center pb-3 border-b border-blue-200 dark:border-blue-800/30 border-dashed">
                    <span className="text-sm text-blue-700 dark:text-blue-300">Valor da Parcela</span>
                    <span className="text-lg font-bold text-blue-900 dark:text-white">R$ {monthlyPayment.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-xs text-blue-600 dark:text-blue-400">Total de Juros</span>
                    <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">R$ {totalInterest.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-xs text-blue-600 dark:text-blue-400">Valor Total Final</span>
                    <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">R$ {totalAmount.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
            </div>
        </section>

        <div className="pt-4 pb-12">
            <button 
                onClick={handleSave}
                disabled={loading}
                className="w-full bg-primary dark:bg-white text-white dark:text-primary py-4 rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-70"
            >
                {loading ? 'Processando...' : 'Gerar Empréstimo'}
            </button>
        </div>
      </main>
    </div>
  );
};