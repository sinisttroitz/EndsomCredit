import React, { useEffect, useState } from 'react';
import { ChevronLeft, MoreHorizontal, Check, Clock, Circle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan } from '../types';

interface LoanDetailsProps {
    loanId: string | null;
    onBack: () => void;
}

interface Installment {
    number: number;
    date: Date;
    value: number;
    status: 'paid' | 'pending' | 'late' | 'future';
}

export const LoanDetails: React.FC<LoanDetailsProps> = ({ loanId, onBack }) => {
    const [loan, setLoan] = useState<Loan | null>(null);
    const [installmentsList, setInstallmentsList] = useState<Installment[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (loanId) {
            fetchLoanData();
        }
    }, [loanId]);

    const fetchLoanData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('loans')
                .select('*, client:clients(name)')
                .eq('id', loanId)
                .single();
            
            if (error) throw error;
            setLoan(data);
            generateInstallments(data);
        } catch (error) {
            console.error("Error fetching loan details", error);
        } finally {
            setLoading(false);
        }
    };

    const generateInstallments = (loanData: Loan) => {
        const count = loanData.installments || 1;
        const installmentValue = loanData.installment_value || (loanData.amount / count);
        const startDate = new Date(loanData.created_at || Date.now());
        // Simple logic to determine how many paid based on balance
        const totalPaid = Number(loanData.amount) - Number(loanData.balance);
        const list: Installment[] = [];

        // Note: This is an estimation since we don't have an 'installments' table yet.
        // In a real app with 'installments' table, we would just fetch them.
        let paidAccumulator = 0;

        for (let i = 1; i <= count; i++) {
            const date = new Date(startDate);
            date.setMonth(startDate.getMonth() + i);
            
            let status: 'paid' | 'pending' | 'late' | 'future' = 'future';
            
            // Check if this installment is "covered" by the totalPaid amount
            if (paidAccumulator + (installmentValue * 0.99) < totalPaid) {
                status = 'paid';
                paidAccumulator += installmentValue;
            } else if (paidAccumulator < totalPaid + (installmentValue * 0.1)) {
                 // This is the current active installment roughly
                 const today = new Date();
                 if (date < today && loanData.status !== 'paid') status = 'late';
                 else status = 'pending';
                 // We only mark one as pending/late, subsequent are future
                 paidAccumulator += 99999999; // Stop marking others as paid
            } else {
                status = 'future';
            }

            // Force override if loan is fully paid
            if (loanData.balance <= 0) status = 'paid';

            list.push({
                number: i,
                date: date,
                value: installmentValue,
                status: status
            });
        }
        setInstallmentsList(list);
    };

    const handleRegisterPayment = async () => {
        if (!loan || loan.balance <= 0) return;
        
        const confirm = window.confirm("Confirmar pagamento da próxima parcela?");
        if (!confirm) return;

        setProcessing(true);
        try {
            const installmentValue = loan.installment_value || (loan.amount / (loan.installments || 1));
            let newBalance = Number(loan.balance) - Number(installmentValue);
            if (newBalance < 0) newBalance = 0;
            
            const newProgress = Math.round(((Number(loan.amount) - newBalance) / Number(loan.amount)) * 100);
            const newStatus = newBalance === 0 ? 'paid' : 'active';

            const { error } = await supabase
                .from('loans')
                .update({ 
                    balance: newBalance,
                    progress: newProgress,
                    status: newStatus
                })
                .eq('id', loan.id);

            if (error) throw error;
            
            await fetchLoanData(); // Refresh UI
            
        } catch (error) {
            console.error(error);
            alert("Erro ao registrar pagamento.");
        } finally {
            setProcessing(false);
        }
    };

    if (loading || !loan) {
        return <div className="h-full flex items-center justify-center bg-background-light dark:bg-background-dark text-primary dark:text-white">Carregando...</div>;
    }

    const totalPaid = Number(loan.amount) - Number(loan.balance);
    const percentage = loan.progress || 0;
    const paidCount = installmentsList.filter(i => i.status === 'paid').length;
    const totalCount = installmentsList.length;

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
            <header className="bg-primary dark:bg-black text-white rounded-b-b-header px-6 pt-12 pb-16 shadow-lg relative z-10">
                <div className="flex items-center justify-between mb-4">
                    <button onClick={onBack} className="w-10 h-10 flex items-center justify-start active:opacity-70">
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-lg font-semibold">Detalhes do Empréstimo</h1>
                    <button className="w-10 h-10 flex items-center justify-end active:opacity-70">
                        <MoreHorizontal className="w-6 h-6" />
                    </button>
                </div>
            </header>
            
            <main className="flex-1 px-5 -mt-8 pb-32 relative z-20 overflow-y-auto no-scrollbar">
                
                {/* Summary Card */}
                <div className="bg-card-light dark:bg-card-dark p-6 rounded-3xl shadow-md border border-gray-100 dark:border-gray-800 mb-6">
                    <div className="flex flex-col items-center text-center">
                        <span className="text-[10px] font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-[0.2em] mb-1">Contrato #{loan.id.substring(0,6)}</span>
                        <p className="text-xs text-text-sub-light dark:text-text-sub-dark mb-1">Saldo Devedor</p>
                        <h2 className="text-4xl font-bold text-primary dark:text-white mb-2 tracking-tight">R$ {Number(loan.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
                        <div className="flex items-center gap-2 mt-2">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold border uppercase ${
                                loan.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' :
                                loan.status === 'late' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' :
                                loan.status === 'paid' ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700' :
                                'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800'
                            }`}>
                                {loan.status === 'active' ? 'EM DIA' : loan.status === 'late' ? 'ATRASADO' : loan.status === 'paid' ? 'QUITADO' : 'PENDENTE'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Progress Card */}
                <div className="bg-card-light dark:bg-card-dark p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 mb-6">
                    <h3 className="text-sm font-bold text-primary dark:text-white mb-6">Status do Pagamento</h3>
                    <div className="flex items-center justify-between gap-6">
                        <div 
                            className="w-28 h-28 rounded-full flex items-center justify-center relative shadow-inner"
                            style={{
                                background: `radial-gradient(closest-side, var(--bg-card) 82%, transparent 80% 100%), conic-gradient(${loan.status === 'late' ? '#EF4444' : '#10B981'} ${percentage}%, #E5E7EB 0)`
                            } as React.CSSProperties}
                        >
                            <div className="absolute inset-0 rounded-full bg-card-light dark:bg-card-dark m-[10%] flex items-center justify-center">
                                <span className="text-2xl font-bold text-primary dark:text-white">{percentage}%</span>
                            </div>
                        </div>
                        <div className="flex-1 space-y-3">
                            <div>
                                <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-semibold">Total Amortizado</p>
                                <p className="text-lg font-bold text-primary dark:text-white">R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-semibold">Parcelas Pagas</p>
                                <p className="text-lg font-bold text-primary dark:text-white">{paidCount}/{totalCount}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Grid Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold mb-1">Valor Original</p>
                        <p className="font-bold text-gray-900 dark:text-white">R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold mb-1">Total Pago</p>
                        <p className="font-bold text-secondary">R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold mb-1">Taxa de Juros</p>
                        <p className="font-bold text-gray-900 dark:text-white">{loan.interest_rate}% a.m.</p>
                    </div>
                    <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold mb-1">Próximo Venc.</p>
                        <p className="font-bold text-accent-blue">
                            {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '-'}
                        </p>
                    </div>
                </div>

                {/* History */}
                <div className="bg-card-light dark:bg-card-dark p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 mb-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold text-primary dark:text-white">Histórico de Parcelas</h3>
                        <span className="text-xs text-accent-blue font-medium cursor-pointer">Ver tudo</span>
                    </div>
                    <div className="relative space-y-6">
                        <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-100 dark:bg-gray-700"></div>
                        
                        {installmentsList.slice(0, 5).map((inst) => (
                            <div key={inst.number} className="relative flex items-center gap-4">
                                <div className={`z-10 w-8 h-8 rounded-full flex items-center justify-center text-white ring-4 ring-white dark:ring-card-dark ${
                                    inst.status === 'paid' ? 'bg-secondary' :
                                    inst.status === 'late' ? 'bg-danger' :
                                    inst.status === 'pending' ? 'bg-accent-blue' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                                }`}>
                                    {inst.status === 'paid' ? <Check className="w-4 h-4" /> :
                                     inst.status === 'future' ? <Circle className="w-4 h-4" /> :
                                     <Clock className="w-4 h-4" />}
                                </div>
                                <div className={`flex-1 flex justify-between items-center ${inst.status === 'future' ? 'opacity-60' : ''}`}>
                                    <div>
                                        <p className="text-sm font-bold text-primary dark:text-white">Parcela #{String(inst.number).padStart(2, '0')}</p>
                                        <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark">
                                            {inst.status === 'paid' ? `Paga` : 
                                             inst.status === 'late' ? `Venceu em ${inst.date.toLocaleDateString()}` :
                                             inst.status === 'pending' ? `Vence em ${inst.date.toLocaleDateString()}` :
                                             `Prevista para ${inst.date.toLocaleDateString()}`}
                                        </p>
                                    </div>
                                    <p className={`text-sm font-bold ${
                                        inst.status === 'paid' ? 'text-secondary' :
                                        inst.status === 'late' ? 'text-danger' :
                                        inst.status === 'pending' ? 'text-accent-blue' : 'text-gray-500'
                                    }`}>
                                        R$ {inst.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-3 mb-8">
                    {loan.status !== 'paid' && (
                        <button 
                            onClick={handleRegisterPayment}
                            disabled={processing}
                            className="w-full bg-primary dark:bg-white text-white dark:text-primary py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 transition active:scale-[0.98] disabled:opacity-70"
                        >
                            {processing ? 'Registrando...' : 'Registrar Pagamento'}
                        </button>
                    )}
                    <button 
                        onClick={() => alert("Funcionalidade de PDF em desenvolvimento.")}
                        className="w-full bg-transparent border-2 border-primary dark:border-white text-primary dark:text-white py-4 rounded-2xl font-bold transition active:scale-[0.98]"
                    >
                        Gerar Comprovante
                    </button>
                </div>

            </main>
        </div>
    );
};