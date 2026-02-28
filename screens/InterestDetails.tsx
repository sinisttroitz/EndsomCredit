import React, { useState, useEffect } from 'react';
import { ArrowLeft, MoreVertical, TrendingUp, Calendar, ChevronRight } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan } from '../types';

interface InterestDetailsProps {
    onBack: () => void;
}

export const InterestDetails: React.FC<InterestDetailsProps> = ({ onBack }) => {
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
                    client:clients (name)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const filteredLoans = (data || []).filter((loan: any) => {
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

                if (interestReceived <= 0) return false;

                // Date Filter Logic (using created_at as proxy for now)
                const loanDate = new Date(loan.created_at);
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

            setLoans(filteredLoans);
            setTotalInterest(total);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const getPeriodText = () => {
        const now = new Date();
        if (filter === 'this-month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return `${start.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})} - ${end.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}`;
        } else if (filter === 'last-month') {
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = new Date(now.getFullYear(), now.getMonth(), 0);
            return `${start.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})} - ${end.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}`;
        }
        return 'Todo o Período';
    };

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
            {/* Header */}
            <header className="bg-primary dark:bg-black text-white rounded-b-[2.5rem] px-6 pt-12 pb-10 shadow-lg relative z-10">
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
                    <button className="bg-white text-primary px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-blue-50 transition-colors">
                        Ver Relatório
                    </button>
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
                                <div key={loan.id} className="bg-white dark:bg-card-dark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-4 hover:shadow-md transition-shadow">
                                    <div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-500 shadow-sm border border-green-100 dark:border-green-900/30">
                                        <TrendingUp className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">{loan.client?.name || 'Cliente Desconhecido'}</h4>
                                        <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                                            <span>Contrato #{loan.id.substring(0,4)}</span>
                                            <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                            <span>{formatDate(loan.created_at)}</span>
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-green-600 dark:text-green-400 text-sm">
                                            + R$ {interestReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
