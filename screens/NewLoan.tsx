import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Search, Plus, Minus, Calendar, Check, AlertTriangle, DollarSign, TrendingUp, Layers } from 'lucide-react';
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

  const [alertModal, setAlertModal] = useState<{
      open: boolean;
      title: string;
      message: string;
      onConfirm?: () => void;
      confirmText?: string;
  }>({ open: false, title: '', message: '' });

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
    if (!clientId) {
        setAlertModal({
            open: true,
            title: 'Aviso',
            message: 'Selecione um cliente para prosseguir com o empréstimo.'
        });
        return;
    }
    
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
            progress: 0,
            amount_paid: 0
        }]);

        if (error) throw error;
        onSuccess();
    } catch (e) {
        console.error(e);
        setAlertModal({
            open: true,
            title: 'Erro',
            message: 'Erro ao criar empréstimo'
        });
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <header className="bg-black text-white px-6 pt-8 pb-8 rounded-b-[40px] relative z-10">
        <div className="flex items-center mb-4">
          <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 mr-4 hover:bg-white/20 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold tracking-tight">Novo Empréstimo</h1>
        </div>
        <p className="text-gray-300 text-[10px] pl-1 font-medium">Preencha os dados abaixo para simular um contrato.</p>
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
                        <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                            {client.avatar_url && !client.avatar_url.includes('ui-avatars.com') ? (
                                <img src={client.avatar_url} alt={client.name} className="w-full h-full object-cover" />
                            ) : (
                                <span>{client.name.substring(0,2).toUpperCase()}</span>
                            )}
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

        {/* === HERO FINTECH VALUE CARD === */}
        <section className="relative overflow-hidden rounded-3xl shadow-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-card-dark">

          <div className="relative z-10 p-6 pt-5">
            {/* Header label */}
            <div className="flex items-center gap-2 mb-6">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Valor do Empréstimo</span>
            </div>
            
            {/* Large value input area */}
            <div className="mb-6">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-400 dark:text-gray-500 select-none">R$</span>
                <input 
                  className="w-full bg-transparent text-5xl font-black text-gray-900 dark:text-white tracking-tight outline-none placeholder-gray-300 dark:placeholder-gray-600 caret-primary appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" 
                  type="number" 
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                />
              </div>
              {/* Animated underline */}
              <div className="mt-2 h-[2px] w-full bg-gray-200 dark:bg-gray-700 rounded-full relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 rounded-full animate-pulse"></div>
              </div>
              <p className="text-[10px] text-gray-500 mt-2 font-medium tracking-wide">
                {principal > 0 ? `${principal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em valor principal` : 'Digite o valor desejado'}
              </p>
            </div>

            {/* Compact secondary fields row */}
            <div className="flex gap-3">
              {/* Interest Rate */}
              <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors group">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-3 h-3 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                  <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-500 transition-colors">Juros %</label>
                </div>
                <input 
                    className="w-full bg-transparent text-2xl font-black text-gray-900 dark:text-white outline-none placeholder-gray-300 dark:placeholder-gray-600 caret-primary appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" 
                    type="number" 
                    value={interestRate}
                    onChange={e => setInterestRate(e.target.value)}
                    placeholder="0"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                />
              </div>

              {/* Installments */}
              {(frequency !== 'Mensal' && frequency !== 'Quinzenal') && (
              <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors group">
                <div className="flex items-center gap-1.5 mb-2">
                  <Layers className="w-3 h-3 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                  <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-500 transition-colors">Parcelas</label>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setInstallments(Math.max(1, installments - 1))} 
                    className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-white hover:border-gray-300 active:scale-95 transition-all"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <input 
                    className="w-full bg-transparent text-2xl font-black text-gray-900 dark:text-white text-center outline-none placeholder-gray-300 dark:placeholder-gray-600 caret-primary appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" 
                    type="number" 
                    value={installments}
                    onChange={e => setInstallments(parseInt(e.target.value) || 1)}
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  />
                  <button 
                    onClick={() => setInstallments(installments + 1)} 
                    className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-white hover:border-gray-300 active:scale-95 transition-all"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-card-dark p-5 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-800">
          <div className="mb-5">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 block">Frequência</span>
            <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl gap-1">
              {['Diária', 'Semanal', 'Quinzenal', 'Mensal'].map((freq) => (
                 <button 
                    key={freq} 
                    onClick={() => {
                        setFrequency(freq);
                        if (freq === 'Mensal' || freq === 'Quinzenal') setInstallments(1);
                        setDueDate(getDueDateByFrequency(freq));
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 
                        ${frequency === freq ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                 >
                    {freq}
                 </button>
              ))}
            </div>
            {frequency === 'Diária' && (
                <div className="mt-4 flex gap-3">
                    <div className="flex-1 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Sáb</span>
                        <div 
                            onClick={() => setSkipSaturday(!skipSaturday)}
                            className={`w-10 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-300 ${skipSaturday ? 'bg-gray-900 dark:bg-white' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                            <div className={`bg-white dark:bg-gray-900 w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${skipSaturday ? 'translate-x-[18px]' : 'translate-x-0'}`}></div>
                        </div>
                    </div>
                    <div className="flex-1 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Dom</span>
                        <div 
                            onClick={() => setSkipSunday(!skipSunday)}
                            className={`w-10 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-300 ${skipSunday ? 'bg-gray-900 dark:bg-white' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                            <div className={`bg-white dark:bg-gray-900 w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${skipSunday ? 'translate-x-[18px]' : 'translate-x-0'}`}></div>
                        </div>
                    </div>
                </div>
            )}
          </div>
          <div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block">Primeiro Vencimento</span>
            <div className="relative">
              <input 
                className="w-full pl-4 pr-12 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 outline-none transition-all font-bold text-gray-900 dark:text-white" 
                type="date" 
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                <Calendar className="w-4 h-4 text-gray-400" />
              </div>
            </div>
          </div>
        </section>

        {/* === TICKET / COMPROVANTE === */}
        <section className="relative">
          {/* Ticket body */}
          <div className="bg-white dark:bg-card-dark rounded-3xl shadow-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
            
            {/* Ticket header strip */}
            <div className="bg-gray-900 dark:bg-gray-800 px-5 py-3 flex items-center justify-between">
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.25em]">Prévia do Contrato</span>
              <span className="text-[9px] font-mono text-gray-500">#{Date.now().toString().slice(-6)}</span>
            </div>

            {/* Main value - ticket hero */}
            <div className="px-5 pt-5 pb-4 text-center">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mb-1">Valor da Parcela</p>
              <p className="text-4xl font-black text-gray-900 dark:text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
                R$ {monthlyPayment.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </p>
              <p className="text-xs text-gray-400 mt-1.5 font-semibold">{installments}x de R$ {monthlyPayment.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            </div>

            {/* Perforated tear line */}
            <div className="relative flex items-center my-1">
              <div className="w-4 h-8 bg-background-light dark:bg-background-dark rounded-r-full -ml-[1px] border-r border-y border-gray-100 dark:border-gray-800"></div>
              <div className="flex-1 border-t-2 border-dashed border-gray-200 dark:border-gray-700 mx-1"></div>
              <div className="w-4 h-8 bg-background-light dark:bg-background-dark rounded-l-full -mr-[1px] border-l border-y border-gray-100 dark:border-gray-800"></div>
            </div>

            {/* Detail rows */}
            <div className="px-5 pb-5 pt-2 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400 font-medium">Capital</span>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 font-mono tracking-tight">
                  R$ {principal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400 font-medium">Juros ({interestRate}%)</span>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 font-mono tracking-tight">
                  + R$ {totalInterest.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </span>
              </div>
              <div className="h-px bg-gray-100 dark:bg-gray-800"></div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">Total</span>
                <span className="text-lg font-black text-gray-900 dark:text-white font-mono">
                  R$ {totalAmount.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </span>
              </div>
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

      {/* Alert Modal */}
      {alertModal.open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAlertModal(prev => ({ ...prev, open: false }))}></div>
              <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                  <div className="flex flex-col items-center text-center mb-6">
                      <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mb-4">
                          <AlertTriangle className="w-8 h-8 text-yellow-600 dark:text-yellow-500" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{alertModal.title}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                          {alertModal.message}
                      </p>
                  </div>
                  <div className="flex gap-3">
                      <button 
                          onClick={() => setAlertModal(prev => ({ ...prev, open: false }))}
                          className={`flex-1 py-3 px-4 rounded-xl font-bold transition-colors ${alertModal.onConfirm ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700' : 'bg-primary text-white hover:bg-primary/90'}`}
                      >
                          Entendi
                      </button>
                      {alertModal.onConfirm && (
                          <button 
                              onClick={alertModal.onConfirm}
                              className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-primary hover:bg-primary/90 transition-colors"
                          >
                              {alertModal.confirmText || 'Confirmar'}
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};