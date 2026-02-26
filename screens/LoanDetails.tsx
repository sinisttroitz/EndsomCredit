import React, { useEffect, useState } from 'react';
import { ChevronLeft, MoreHorizontal, Check, Clock, Circle, Share2, FileText, X, PlusCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan } from '../types';

interface LoanDetailsProps {
    loanId: string | null;
    onBack: () => void;
    onNewLoan?: (data: any) => void;
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
    const [showAllInstallments, setShowAllInstallments] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    
    // Batch Payment State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedInstallments, setSelectedInstallments] = useState<number[]>([]);

    useEffect(() => {
        if (loanId) {
            fetchLoanData();
        }
    }, [loanId]);

    // ... (existing fetchLoanData)

    // Helper to count overdue installments
    const overdueCount = installmentsList.filter(i => i.status === 'late').length;

    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedInstallments([]);
    };

    const toggleInstallmentSelection = (number: number) => {
        setSelectedInstallments(prev => {
            if (prev.includes(number)) {
                return prev.filter(n => n !== number);
            } else {
                return [...prev, number];
            }
        });
    };

    const selectAllOverdue = () => {
        const overdueNumbers = installmentsList
            .filter(i => i.status === 'late')
            .map(i => i.number);
        setSelectedInstallments(overdueNumbers);
    };

    const handleBatchPayment = async () => {
        if (!loan || selectedInstallments.length === 0) return;

        if (selectedInstallments.length > 1) {
            const confirmed = window.confirm(`Marcar ${selectedInstallments.length} parcelas como pagas?`);
            if (!confirmed) return;
        }

        setProcessing(true);
        try {
            // Calculate total value of selected installments
            const selectedValue = installmentsList
                .filter(i => selectedInstallments.includes(i.number))
                .reduce((acc, curr) => acc + curr.value, 0);

            const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
            
            let newBalance = Number(loan.balance) - selectedValue;
            if (newBalance < 0.01) newBalance = 0;
            
            const newProgress = Math.min(100, Math.round(((totalDebt - newBalance) / totalDebt) * 100));
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
            
            setIsSelectionMode(false);
            setSelectedInstallments([]);
            await fetchLoanData(); 
            
        } catch (error) {
            console.error(error);
            alert("Erro ao registrar pagamento em lote.");
        } finally {
            setProcessing(false);
        }
    };

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
        const startDate = loanData.due_date ? new Date(loanData.due_date) : new Date(loanData.created_at || Date.now());
        
        // Simple logic to determine how many paid based on balance
        // Total Debt = installment_value * installments
        const totalDebt = (loanData.installment_value || 0) * (loanData.installments || 1);
        const totalPaid = totalDebt - Number(loanData.balance);
        const list: Installment[] = [];

        // ... (rest of generateInstallments remains same, just ensuring totalPaid is correct)
        
        let paidAccumulator = 0;
        let dailyDateTracker = new Date(startDate);

        for (let i = 0; i < count; i++) {
            let date: Date;

            if (loanData.frequency === 'Diária') {
                if (i === 0) {
                    date = new Date(startDate);
                } else {
                    date = new Date(dailyDateTracker);
                    date.setDate(date.getDate() + 1);
                    
                    while (true) {
                        const day = date.getDay();
                        if (loanData.skip_saturday && day === 6) {
                            date.setDate(date.getDate() + 1);
                            continue;
                        }
                        if (loanData.skip_sunday && day === 0) {
                            date.setDate(date.getDate() + 1);
                            continue;
                        }
                        break;
                    }
                }
                dailyDateTracker = new Date(date);
            } else {
                date = new Date(startDate);
                if (loanData.frequency === 'Semanal') {
                    date.setDate(startDate.getDate() + (i * 7));
                } else {
                    date.setMonth(startDate.getMonth() + i);
                }
            }
            
            let status: 'paid' | 'pending' | 'late' | 'future' = 'future';
            
            // Check if this installment is "covered" by the totalPaid amount
            // Use a small epsilon for float comparison
            if (paidAccumulator + (installmentValue * 0.99) < totalPaid) {
                status = 'paid';
                paidAccumulator += installmentValue;
            } else {
                 // Not paid
                 const today = new Date();
                 // Reset time part for accurate date comparison
                 const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                 const dateZero = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                 
                 if (dateZero < todayZero) status = 'late';
                 else if (dateZero.getTime() === todayZero.getTime()) status = 'pending';
                 else status = 'future';
                 
                 // Do NOT increase paidAccumulator, so next installments also fall into this block
            }

            if (loanData.balance <= 0) status = 'paid';

            list.push({
                number: i + 1,
                date: date,
                value: installmentValue,
                status: status
            });
        }
        setInstallmentsList(list);
    };

    const handleConfirmPayment = async () => {
        if (!loan || loan.balance <= 0) return;
        
        setProcessing(true);
        try {
            const installmentValue = loan.installment_value || (loan.amount / (loan.installments || 1));
            const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
            
            let newBalance = Number(loan.balance) - Number(installmentValue);
            // Avoid negative balance due to floating point errors
            if (newBalance < 0.01) newBalance = 0;
            
            // Calculate progress based on Total Debt, not Principal Amount
            const newProgress = Math.min(100, Math.round(((totalDebt - newBalance) / totalDebt) * 100));
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
            
            setShowPaymentModal(false);
            await fetchLoanData(); 
            
        } catch (error) {
            console.error(error);
            alert("Erro ao registrar pagamento.");
        } finally {
            setProcessing(false);
        }
    };

    const handleGenerateReceipt = async (type: 'last' | 'full') => {
        if (!loan) return;

        const paidInstallments = installmentsList.filter(i => i.status === 'paid');

        if (paidInstallments.length === 0) {
            alert("Nenhum pagamento registrado para este empréstimo.");
            return;
        }

        let text = "";
        const now = new Date().toLocaleString('pt-BR');

        if (type === 'last') {
            const lastPaid = paidInstallments[paidInstallments.length - 1];
            text = `
🧾 *COMPROVANTE DE PAGAMENTO*
--------------------------------
📅 Data: ${now}
👤 Cliente: ${loan.client?.name}
📄 Contrato: #${loan.id.substring(0, 6)}
--------------------------------
💰 *Parcela #${lastPaid.number}*
💲 Valor: R$ ${lastPaid.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
📆 Vencimento: ${lastPaid.date.toLocaleDateString('pt-BR')}
✅ Status: PAGO
--------------------------------
Autenticação: ${Math.random().toString(36).substring(7).toUpperCase()}
`.trim();
        } else {
            text = `
📑 *EXTRATO DE PAGAMENTOS*
--------------------------------
📅 Emissão: ${now}
👤 Cliente: ${loan.client?.name}
📄 Contrato: #${loan.id.substring(0, 6)}
--------------------------------
*Histórico de Pagamentos:*

${paidInstallments.map(i => 
`🔹 Parc. #${i.number} - ${i.date.toLocaleDateString('pt-BR')} - R$ ${i.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
).join('\n')}

--------------------------------
💵 Total Pago: R$ ${paidInstallments.reduce((acc, curr) => acc + curr.value, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
📉 Saldo Devedor: R$ ${Number(loan.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
--------------------------------
`.trim();
        }

        // Share logic
        if (navigator.share) {
            try {
                await navigator.share({
                    title: type === 'last' ? 'Comprovante de Pagamento' : 'Extrato de Empréstimo',
                    text: text
                });
            } catch (error) {
                console.log('Error sharing:', error);
            }
        } else {
            navigator.clipboard.writeText(text);
            alert("Comprovante copiado para a área de transferência!");
        }
        
        setShowReceiptModal(false);
    };

    const handleNewLoan = () => {
        if (!loan || !onNewLoan) return;
        
        onNewLoan({
            clientId: loan.client_id,
            amount: loan.amount,
            interestRate: loan.interest_rate,
            installments: loan.installments,
            frequency: loan.frequency,
            skipSaturday: loan.skip_saturday,
            skipSunday: loan.skip_sunday
        });
    };

    if (loading || !loan) {
        return <div className="h-full flex items-center justify-center bg-background-light dark:bg-background-dark text-primary dark:text-white">Carregando...</div>;
    }

    const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
    const totalPaid = totalDebt - Number(loan.balance);
    const percentage = loan.progress || 0;
    const paidCount = installmentsList.filter(i => i.status === 'paid').length;
    const totalCount = installmentsList.length;
    
    // Determine display status based on installments
    const isLate = installmentsList.some(i => i.status === 'late');
    const displayStatus = isLate ? 'late' : loan.status;

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
            <header className={`bg-primary dark:bg-black text-white rounded-b-b-header px-6 pt-12 pb-16 shadow-lg relative z-10 transition-colors duration-300 ${isSelectionMode ? 'bg-gray-900' : ''}`}>
                <div className="flex items-center justify-between mb-4">
                    {isSelectionMode ? (
                        <>
                            <button onClick={toggleSelectionMode} className="w-10 h-10 flex items-center justify-start active:opacity-70">
                                <X className="w-6 h-6" />
                            </button>
                            <div className="flex flex-col items-center">
                                <span className="text-lg font-bold">{selectedInstallments.length} selecionadas</span>
                                <button onClick={selectAllOverdue} className="text-xs text-accent-blue font-medium mt-0.5 active:opacity-70">
                                    Selecionar vencidas
                                </button>
                            </div>
                            <div className="w-10 h-10"></div>
                        </>
                    ) : (
                        <>
                            <button onClick={onBack} className="w-10 h-10 flex items-center justify-start active:opacity-70">
                                <ChevronLeft className="w-6 h-6" />
                            </button>
                            <h1 className="text-lg font-semibold">Detalhes do Empréstimo</h1>
                            <div className="w-10 h-10"></div>
                        </>
                    )}
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
                                displayStatus === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' :
                                displayStatus === 'late' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' :
                                displayStatus === 'paid' ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700' :
                                'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800'
                            }`}>
                                {displayStatus === 'active' ? 'EM DIA' : displayStatus === 'late' ? 'ATRASADO' : displayStatus === 'paid' ? 'QUITADO' : 'PENDENTE'}
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
                                background: `radial-gradient(closest-side, var(--bg-card) 82%, transparent 80% 100%), conic-gradient(${displayStatus === 'late' ? '#EF4444' : '#10B981'} ${percentage}%, #E5E7EB 0)`
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
                        <p className="font-bold text-gray-900 dark:text-white">
                            {loan.interest_rate}% {loan.frequency === 'Semanal' ? 'a.s.' : loan.frequency === 'Diária' ? 'a.d.' : 'a.m.'}
                        </p>
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
                        {!isSelectionMode && (
                            <span 
                                className="text-xs text-accent-blue font-medium cursor-pointer"
                                onClick={() => setShowAllInstallments(!showAllInstallments)}
                            >
                                {showAllInstallments ? 'Ver menos' : 'Ver tudo'}
                            </span>
                        )}
                    </div>
                    <div className="relative space-y-6">
                        <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-100 dark:bg-gray-700"></div>
                        
                        {(showAllInstallments || isSelectionMode ? installmentsList : installmentsList.slice(0, 5)).map((inst) => (
                            <div 
                                key={inst.number} 
                                className={`relative flex items-center gap-4 transition-all duration-200 ${isSelectionMode && inst.status !== 'paid' ? 'cursor-pointer active:scale-[0.99]' : ''}`}
                                onClick={() => {
                                    if (isSelectionMode && inst.status !== 'paid') {
                                        toggleInstallmentSelection(inst.number);
                                    }
                                }}
                            >
                                {isSelectionMode ? (
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                                        inst.status === 'paid' ? 'border-gray-200 bg-gray-100 opacity-50' :
                                        selectedInstallments.includes(inst.number) ? 'border-primary bg-primary text-white' : 'border-gray-300'
                                    }`}>
                                        {inst.status === 'paid' ? <Check className="w-4 h-4 text-gray-400" /> : 
                                         selectedInstallments.includes(inst.number) && <Check className="w-4 h-4" />}
                                    </div>
                                ) : (
                                    <div className={`z-10 w-8 h-8 rounded-full flex items-center justify-center text-white ring-4 ring-white dark:ring-card-dark ${
                                        inst.status === 'paid' ? 'bg-secondary' :
                                        inst.status === 'late' ? 'bg-danger' :
                                        inst.status === 'pending' ? 'bg-accent-blue' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                                    }`}>
                                        {inst.status === 'paid' ? <Check className="w-4 h-4" /> :
                                         inst.status === 'future' ? <Circle className="w-4 h-4" /> :
                                         <Clock className="w-4 h-4" />}
                                    </div>
                                )}
                                
                                <div className={`flex-1 flex justify-between items-center ${inst.status === 'future' && !isSelectionMode ? 'opacity-60' : ''}`}>
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
                    {isSelectionMode ? (
                        <>
                            <button 
                                onClick={handleBatchPayment}
                                disabled={processing || selectedInstallments.length === 0}
                                className="w-full bg-primary dark:bg-white text-white dark:text-primary py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 transition active:scale-[0.98] disabled:opacity-70"
                            >
                                {processing ? 'Processando...' : `Marcar como pagas (${selectedInstallments.length})`}
                            </button>
                            <button 
                                onClick={toggleSelectionMode}
                                className="w-full bg-transparent border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 py-3 rounded-2xl font-bold transition active:scale-[0.98] text-sm"
                            >
                                Cancelar
                            </button>
                        </>
                    ) : (
                        <>
                            {loan.status !== 'paid' && (
                                <button 
                                    onClick={() => setShowPaymentModal(true)}
                                    disabled={processing}
                                    className="w-full bg-primary dark:bg-white text-white dark:text-primary py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 transition active:scale-[0.98] disabled:opacity-70"
                                >
                                    Registrar Pagamento
                                </button>
                            )}
                            
                            {/* Batch Payment Button - Always visible if not paid */}
                            {loan.status !== 'paid' && (
                                <button 
                                    onClick={toggleSelectionMode}
                                    className="w-full bg-white dark:bg-gray-800 text-primary dark:text-white border border-gray-200 dark:border-gray-700 py-3 rounded-2xl font-bold transition active:scale-[0.98] text-sm"
                                >
                                    Pagamento em lote
                                </button>
                            )}

                            <button 
                                onClick={() => setShowReceiptModal(true)}
                                className="w-full bg-transparent border-2 border-primary dark:border-white text-primary dark:text-white py-4 rounded-2xl font-bold transition active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                <Share2 className="w-5 h-5" />
                                Gerar Comprovante
                            </button>

                            {loan.status === 'paid' && (
                                <button 
                                    onClick={handleNewLoan}
                                    className="w-full bg-secondary/10 border border-secondary text-secondary py-4 rounded-2xl font-bold transition active:scale-[0.98] flex items-center justify-center gap-2 mt-2"
                                >
                                    <PlusCircle className="w-5 h-5" />
                                    Novo Empréstimo para este Cliente
                                </button>
                            )}
                        </>
                    )}
                </div>

            </main>

            {/* Payment Confirmation Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-4">
                                <Check className="w-8 h-8 text-green-600 dark:text-green-500" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Confirmar Pagamento?</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Você está prestes a registrar o pagamento de uma parcela no valor de <span className="font-bold text-gray-900 dark:text-white">R$ {(loan.installment_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={() => setShowPaymentModal(false)}
                                className="py-3 px-4 rounded-xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleConfirmPayment}
                                disabled={processing}
                                className="py-3 px-4 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20 flex items-center justify-center gap-2 disabled:opacity-70 transition-colors"
                            >
                                {processing ? 'Processando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Receipt Modal */}
            {showReceiptModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowReceiptModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Gerar Comprovante</h3>
                            <button onClick={() => setShowReceiptModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <button 
                                onClick={() => handleGenerateReceipt('last')}
                                className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                            >
                                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400">
                                    <Check className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 dark:text-white">Última Parcela Paga</h4>
                                    <p className="text-xs text-gray-500">Comprovante do pagamento mais recente</p>
                                </div>
                            </button>

                            <button 
                                onClick={() => handleGenerateReceipt('full')}
                                className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                            >
                                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                                    <FileText className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 dark:text-white">Resumo Completo</h4>
                                    <p className="text-xs text-gray-500">Extrato de todos os pagamentos</p>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};