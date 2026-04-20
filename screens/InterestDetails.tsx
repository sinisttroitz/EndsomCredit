import React, { useState, useEffect } from 'react';
import { ArrowLeft, MoreVertical, TrendingUp, Calendar, ChevronRight } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan } from '../types';

interface InterestDetailsProps {
    onBack: () => void;
    onLoanSelect: (loanId: string) => void;
}

export const InterestDetails: React.FC<InterestDetailsProps> = ({ onBack, onLoanSelect }) => {
    const [loans, setLoans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'this-month' | 'last-month' | 'all'>('all');
    const [totalInterest, setTotalInterest] = useState(0);

    useEffect(() => {
        fetchInterestData();
    }, [filter]);

    const fetchInterestData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('loans')
                .select(`
                    *,
                    client:clients (name),
                    loan_amortizations (
                        payment_date,
                        interest_paid,
                        created_at
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const filteredLoans = (data || []).map((loan: any) => {
                const amount = Number(loan.amount);
                const installmentValue = Number(loan.installment_value) || 0;
                const installments = Number(loan.installments) || 1;
                const totalDebt = installmentValue * installments;

                // Calculate Interest Received for this loan
                let interestReceived = (Number(loan.total_interest_paid) || 0);

                if (loan.status === 'paid' && totalDebt > 0 && amount > 0) {
                    const interest = totalDebt - amount;
                    interestReceived += interest;
                }

                // Determine the date of interest receipt
                let interestDate = new Date(loan.created_at);

                // Check amortizations for the latest interest payment
                if (loan.loan_amortizations && loan.loan_amortizations.length > 0) {
                    const interestAmortizations = loan.loan_amortizations.filter((a: any) => a.interest_paid > 0);
                    if (interestAmortizations.length > 0) {
                        // Sort by date descending
                        interestAmortizations.sort((a: any, b: any) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
                        interestDate = new Date(interestAmortizations[0].payment_date);
                    } else if (loan.updated_at && interestReceived > 0) {
                        // If no specific amortization but interest was paid (e.g. renewal), use updated_at
                        interestDate = new Date(loan.updated_at);
                    }
                } else if (loan.updated_at && interestReceived > 0) {
                    // Fallback to updated_at if no amortizations but interest exists
                    interestDate = new Date(loan.updated_at);
                }

                return {
                    ...loan,
                    interestReceived,
                    interestDate
                };
            }).filter((loan: any) => {
                if (loan.interestReceived <= 0) return false;

                const loanDate = loan.interestDate;
                const now = new Date();

                if (filter === 'this-month') {
                    return loanDate.getMonth() === now.getMonth() && loanDate.getFullYear() === now.getFullYear();
                } else if (filter === 'last-month') {
                    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    return loanDate.getMonth() === lastMonth.getMonth() && loanDate.getFullYear() === lastMonth.getFullYear();
                }

                return true;
            });

            // Calculate total for the filtered list
            const total = filteredLoans.reduce((acc: number, loan: any) => {
                const amount = Number(loan.amount);
                const installmentValue = Number(loan.installment_value) || 0;
                const installments = Number(loan.installments) || 1;
                const totalDebt = installmentValue * installments;

                let interestReceived = (Number(loan.total_interest_paid) || 0);

                if (loan.status === 'paid' && totalDebt > 0 && amount > 0) {
                    const interest = totalDebt - amount;
                    interestReceived += interest;
                }
                return acc + interestReceived;
            }, 0);

            // Sort by interest date descending
            filteredLoans.sort((a: any, b: any) => b.interestDate.getTime() - a.interestDate.getTime());

            setLoans(filteredLoans);
            setTotalInterest(total);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (date: Date) => {
        if (!date) return '';
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const getPeriodText = () => {
        const now = new Date();
        if (filter === 'this-month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
        } else if (filter === 'last-month') {
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = new Date(now.getFullYear(), now.getMonth(), 0);
            return `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
        }
        return 'Todo o Período';
    };

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
            {/* Header */}
            <header className="bg-black text-white rounded-b-[40px] px-6 pt-12 pb-10 relative z-10">
                <div className="flex items-center justify-between mb-8">
                    <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-lg font-bold tracking-wide">Detalhes de Juros</h1>
                    <button className="w-10 h-10 flex items-center justify-center text-white/80 hover:text-white">
                        <MoreVertical className="w-5 h-5" />
                    </button>
                </div>

                <div className="text-center mb-8">
                    <h2 className="text-4xl font-bold tracking-tight">
                        R$ {totalInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h2>
                </div>

                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 flex items-center justify-between border border-white/10">
                    <div>
                        <p className="text-xs text-blue-100 uppercase tracking-wider mb-1">Período</p>
                        <p className="text-sm font-semibold">{getPeriodText()}</p>
                    </div>
                </div>
            </header>

            {/* Filters */}
            <div className="px-6 mt-6">
                <div className="flex space-x-3 overflow-x-auto no-scrollbar pb-2">
                    <button
                        onClick={() => setFilter('this-month')}
                        className={`px-5 py-2.5 rounded-full text-xs font-bold shadow-sm whitespace-nowrap transition-all ${filter === 'this-month' ? 'bg-primary text-white shadow-primary/30' : 'bg-white dark:bg-card-dark text-gray-500 border border-gray-100 dark:border-gray-800'}`}
                    >
                        Este Mês
                    </button>
                    <button
                        onClick={() => setFilter('last-month')}
                        className={`px-5 py-2.5 rounded-full text-xs font-bold shadow-sm whitespace-nowrap transition-all ${filter === 'last-month' ? 'bg-primary text-white shadow-primary/30' : 'bg-white dark:bg-card-dark text-gray-500 border border-gray-100 dark:border-gray-800'}`}
                    >
                        Mês Passado
                    </button>
                    <button
                        onClick={() => setFilter('all')}
                        className={`px-5 py-2.5 rounded-full text-xs font-bold shadow-sm whitespace-nowrap transition-all ${filter === 'all' ? 'bg-primary text-white shadow-primary/30' : 'bg-white dark:bg-card-dark text-gray-500 border border-gray-100 dark:border-gray-800'}`}
                    >
                        Todo o Período
                    </button>
                </div>
            </div>

            {/* List */}
            <main className="flex-1 px-6 pt-4 pb-8 overflow-y-auto no-scrollbar">
                <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    Histórico de Recebimentos
                </h3>

                <div className="space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-gray-400 text-sm">Carregando...</div>
                    ) : loans.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                            Nenhum registro de juros encontrado para este período.
                        </div>
                    ) : (
                        loans.map((loan) => {
                            const amount = Number(loan.amount);
                            const installmentValue = Number(loan.installment_value) || 0;
                            const installments = Number(loan.installments) || 1;
                            const totalDebt = installmentValue * installments;

                            let interestReceived = (Number(loan.total_interest_paid) || 0);

                            if (loan.status === 'paid' && totalDebt > 0 && amount > 0) {
                                const interest = totalDebt - amount;
                                interestReceived += interest;
                            }

                            return (
                                <div
                                    key={loan.id}
                                    onClick={() => onLoanSelect(loan.id)}
                                    className="bg-white dark:bg-card-dark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]"
                                >
                                    <div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-500 shadow-sm border border-green-100 dark:border-green-900/30">
                                        <TrendingUp className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">{loan.client?.name || 'Cliente Desconhecido'}</h4>
                                        <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                                            <span>Contrato #{loan.id.substring(0, 4)}</span>
                                            <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                            <span>{formatDate(loan.interestDate)}</span>
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-green-600 dark:text-green-400 text-sm">
                                            + R$ {loan.interestReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">JUROS</p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </main>
        </div>
    );
};
