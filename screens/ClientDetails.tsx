import React, { useEffect, useState } from 'react';
import { ArrowLeft, MoreVertical, ShieldCheck, CreditCard, Phone, Mail, PlusCircle, Edit, AlertCircle, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Client, Loan } from '../types';

interface ClientDetailsProps {
    clientId: string | null;
    onBack: () => void;
    onNewLoan: () => void;
    onEdit: () => void;
    onLoanSelect: (id: string) => void;
}

export const ClientDetails: React.FC<ClientDetailsProps> = ({ clientId, onBack, onNewLoan, onEdit, onLoanSelect }) => {
    const [client, setClient] = useState<Client | null>(null);
    const [loans, setLoans] = useState<Loan[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if(clientId) {
            fetchClientData(clientId);
        }
    }, [clientId]);

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

    const fetchClientData = async (id: string) => {
        setLoading(true);
        try {
            const { data: clientData, error: clientError } = await supabase
                .from('clients')
                .select('*')
                .eq('id', id)
                .single();
            
            if (clientError) throw clientError;

            const { data: loansData, error: loansError } = await supabase
                .from('loans')
                .select('*')
                .eq('client_id', id)
                .order('created_at', { ascending: false });

            if (loansError) throw loansError;

            // Calculate debt
            const debt = loansData.reduce((acc: number, curr: any) => acc + Number(curr.balance), 0);
            const overdueStats = loansData.reduce((acc: { count: number, amount: number }, curr: any) => {
                const stats = calculateOverdueStats(curr);
                return { count: acc.count + stats.count, amount: acc.amount + stats.amount };
            }, { count: 0, amount: 0 });

            setClient({ ...clientData, debt, overdueStats });
            setLoans(loansData || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const isLoanLate = (loan: Loan): boolean => {
        if (loan.status === 'paid') return false;
        if (loan.status === 'late') return true;
    
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

    if (loading || !client) {
        return <div className="h-full flex items-center justify-center bg-background-light dark:bg-background-dark">Carregando...</div>;
    }

    const isClientLate = loans.some(loan => isLoanLate(loan));

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
            <header className="bg-primary dark:bg-black text-white rounded-b-b-header px-6 pt-12 pb-16 shadow-lg relative z-10">
                <div className="flex items-center justify-between mb-8">
                    <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 active:scale-95 transition-transform hover:bg-white/20">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-lg font-semibold">Perfil do Cliente</h1>
                    <div className="w-10 h-10"></div>
                </div>
                <div className="flex items-center gap-5">
                    <div className="w-20 h-20 rounded-3xl border-4 border-white/10 overflow-hidden bg-gray-200 flex-shrink-0 relative">
                        {client.avatar_url ? (
                            <img alt="Perfil" className="w-full h-full object-cover" src={client.avatar_url} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-primary text-xl font-bold bg-white">{client.name.substring(0,2).toUpperCase()}</div>
                        )}
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">{client.name}</h2>
                        <p className="text-white/60 text-sm font-medium">Cliente desde {new Date(client.created_at || Date.now()).toLocaleDateString()}</p>
                        <div className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                            isClientLate 
                            ? 'bg-red-500/20 text-red-200 border-red-500/30' 
                            : 'bg-secondary/20 text-secondary border-secondary/30'
                        }`}>
                            {isClientLate ? 'Irregular' : (client.status === 'active' ? 'Ativo' : client.status)}
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-6 -mt-8 relative z-20">
                <div className="bg-card-light dark:bg-card-dark rounded-2xl p-5 shadow-xl shadow-black/5 flex justify-between items-center border border-gray-100 dark:border-gray-800">
                    <div className="flex flex-col">
                        <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium mb-1">Total Devido</span>
                        <span className="text-xl font-bold text-primary dark:text-white">R$ {client.debt?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        {(client as any).overdueStats?.count > 0 && (
                            <span className="text-[10px] text-red-500 font-medium mt-1">
                                Parcelas Atrasadas: {(client as any).overdueStats.count} de R$ {((client as any).overdueStats.amount / (client as any).overdueStats.count).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        )}
                    </div>
                    <div className="h-10 w-px bg-gray-100 dark:bg-gray-800"></div>
                    <div className="flex flex-col items-end">
                        <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium mb-1">Status Geral</span>
                        {!isClientLate && (client.status === 'active' || client.status === 'paid') ? (
                            <div className="flex items-center gap-1.5 text-secondary font-bold text-sm">
                                <ShieldCheck className="w-4 h-4" />
                                <span>Regular</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 text-danger font-bold text-sm">
                                <AlertCircle className="w-4 h-4" />
                                <span>Irregular</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <main className="flex-1 px-6 pt-6 pb-32 space-y-6 overflow-y-auto no-scrollbar">
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-primary dark:text-white uppercase tracking-wider">Dados Pessoais</h3>
                    </div>
                    <div className="bg-card-light dark:bg-card-dark rounded-2xl p-5 border border-gray-100 dark:border-gray-800 space-y-4 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-primary dark:text-white">
                                <CreditCard className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold tracking-tight">CPF</p>
                                <p className="text-sm font-semibold text-gray-800 dark:text-white">{client.cpf || 'Não informado'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-primary dark:text-white">
                                <Phone className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold tracking-tight">Telefone</p>
                                <p className="text-sm font-semibold text-gray-800 dark:text-white">{client.phone || 'Não informado'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-primary dark:text-white">
                                <Mail className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold tracking-tight">E-mail</p>
                                <p className="text-sm font-semibold text-gray-800 dark:text-white">{client.email || 'Não informado'}</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-primary dark:text-white uppercase tracking-wider">Documentos Anexados</h3>
                        {client.documents && client.documents.length > 0 && <span className="text-[10px] bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-500">{client.documents.length}</span>}
                    </div>
                    {client.documents && client.documents.length > 0 ? (
                        <div className="grid grid-cols-3 gap-3">
                            {client.documents.map((docUrl, index) => (
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
                                            // Fallback simples para arquivos que não são imagens
                                            (e.target as HTMLImageElement).style.display = 'none';
                                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                        }}
                                    />
                                    {/* Fallback Icon for non-images */}
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
                        <div className="bg-card-light dark:bg-card-dark rounded-2xl p-6 border border-dashed border-gray-300 dark:border-gray-700 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
                            <FileText className="w-8 h-8 opacity-20" />
                            <span>Nenhum documento anexado.</span>
                        </div>
                    )}
                </section>

                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-primary dark:text-white uppercase tracking-wider">Histórico de Empréstimos</h3>
                        <span className="text-[10px] font-bold text-accent-blue bg-accent-blue/10 px-2 py-0.5 rounded">{loans.length} CONTRATOS</span>
                    </div>
                    <div className="space-y-3">
                        {loans.map(loan => {
                            const isLate = isLoanLate(loan);
                            const displayStatus = isLate ? 'late' : loan.status;
                            
                            // Calculate correct paid amount based on Total Debt
                            const installmentValue = Number(loan.installment_value) || 0;
                            const installments = Number(loan.installments) || 1;
                            const totalDebt = installmentValue * installments;
                            
                            let totalPaid = 0;
                            // If totalDebt is valid (greater than 0), use it. Otherwise fallback to amount (principal)
                            // This handles cases where installment data might be missing
                            if (totalDebt > 0) {
                                totalPaid = totalDebt - Number(loan.balance);
                            } else {
                                totalPaid = Number(loan.amount) - Number(loan.balance);
                            }
                            
                            // Ensure we don't show negative paid amount due to data inconsistencies
                            if (totalPaid < 0) totalPaid = 0;

                            return (
                            <div 
                                key={loan.id} 
                                onClick={() => onLoanSelect(loan.id)}
                                className={`bg-card-light dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm active:scale-[0.98] transition-transform cursor-pointer hover:shadow-md ${loan.status === 'paid' ? 'opacity-80' : ''}`}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <p className="text-[10px] font-bold text-text-sub-light dark:text-text-sub-dark uppercase">Contrato #{loan.id.substring(0,6)}</p>
                                        <p className="font-bold text-gray-900 dark:text-white">R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase ${
                                        displayStatus === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' :
                                        displayStatus === 'paid' ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700' :
                                        'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                                    }`}>
                                        {displayStatus === 'active' ? 'Ativo' : displayStatus === 'paid' ? 'Quitado' : 'Atrasado'}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 mb-2">
                                    <div 
                                        className={`h-1.5 rounded-full ${
                                            displayStatus === 'active' ? 'bg-secondary' : 
                                            displayStatus === 'paid' ? 'bg-gray-400' : 
                                            'bg-danger'
                                        }`} 
                                        style={{ width: `${loan.progress}%` }}
                                    ></div>
                                </div>
                                <div className="flex justify-between text-[10px] font-medium text-text-sub-light dark:text-text-sub-dark">
                                    <span>Pago: R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    <span>{loan.progress}%</span>
                                </div>
                            </div>
                        )})}
                    </div>
                </section>

                <div className="grid grid-cols-2 gap-3 pt-2">
                    <button 
                        onClick={onNewLoan}
                        className="bg-primary dark:bg-white dark:text-primary text-white py-3.5 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                    >
                        <PlusCircle className="w-5 h-5" />
                        Novo Empréstimo
                    </button>
                    <button 
                        onClick={onEdit}
                        className="bg-white dark:bg-card-dark text-primary dark:text-white border border-gray-200 dark:border-gray-700 py-3.5 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform"
                    >
                        <Edit className="w-5 h-5" />
                        Editar Cadastro
                    </button>
                </div>
            </main>
        </div>
    );
};