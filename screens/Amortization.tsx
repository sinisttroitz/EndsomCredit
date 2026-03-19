import React, { useState, useEffect } from 'react';
import { ArrowLeft, Wallet, TrendingDown, Calendar, Check, AlertCircle, DollarSign } from 'lucide-react';
import { Loan, Installment } from '../types';

interface AmortizationProps {
    loan: Loan;
    installmentsList: Installment[];
    onBack: () => void;
    onConfirm: (amount: number, breakdown: any) => void;
    processing: boolean;
}

export const Amortization: React.FC<AmortizationProps> = ({ loan, installmentsList, onBack, onConfirm, processing }) => {
    const [amount, setAmount] = useState('');
    const [includeProRata, setIncludeProRata] = useState(true);
    const [includeFines, setIncludeFines] = useState(true);
    const [preview, setPreview] = useState<{
        totalDebt: number;
        breakdown: {
            principal: number;
            monthlyInterestRef: number;
            pastInterest: number;
            fines: number;
            originalFines: number;
            proRata: number;
            originalProRata: number;
        };
        distribution: {
            finesPaid: number;
            pastInterestPaid: number;
            proRataPaid: number;
            principalPaid: number;
        };
        result: {
            capitalAbated: number;
            newBalance: number;
            newDueDate: string;
        };
        daysElapsed: number;
    } | null>(null);

    useEffect(() => {
        calculateValues();
    }, [loan, installmentsList, includeProRata, includeFines]);

    useEffect(() => {
        if (preview && amount) {
            const numAmount = Number(amount);
            if (numAmount > preview.totalDebt + 0.01) {
                setAmount(preview.totalDebt.toFixed(2));
            }
        }
    }, [preview?.totalDebt]);

    useEffect(() => {
        calculateDistribution(amount);
    }, [amount, preview?.breakdown]);

    const calculateValues = () => {
        // 1. Calculate Fines (Manual)
        const originalFines = installmentsList
            .filter(i => i.status !== 'paid' && i.fine)
            .reduce((sum, i) => sum + (i.fine?.fine_value || 0), 0);

        const totalFines = includeFines ? originalFines : 0;

        // 2. Calculate Past Accumulated Interest
        const totalPastInterest = installmentsList
            .filter(i => i.status !== 'paid' && i.accumulatedInterest)
            .reduce((sum, i) => sum + (i.accumulatedInterest || 0), 0);

        // 3. Calculate Base Values from Current Balance
        // loan.balance includes BOTH Unpaid Contract Debt and Past Accumulated Interest!
        const currentBalance = Number(loan.balance);

        // Get true Unpaid Contract Debt by removing Past Interest
        const unpaidContractDebt = Math.max(0, currentBalance - totalPastInterest);

        const rate = Number(loan.interest_rate) / 100;

        // Unpaid Contract Debt = Unpaid Principal * (1 + rate)
        const currentPrincipal = unpaidContractDebt / (1 + rate);
        const contractInterest = unpaidContractDebt - currentPrincipal;

        // 4. Calculate Pro-rata Interest (Current Period)
        let periodDays = 30;
        if (loan.frequency === 'Quinzenal') periodDays = 15;
        if (loan.frequency === 'Semanal') periodDays = 7;
        if (loan.frequency === 'Diária') periodDays = 1;

        const [y, m, d] = loan.due_date.split('-').map(Number);
        const currentDueDate = new Date(y, m - 1, d);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const cycleStartDate = new Date(currentDueDate);

        // If the due date is in the future, we are within a normal cycle, so it started 1 period ago.
        // If it's in the past/today, processRecurringInterest already updated it to the start of the CURRENT late period!
        if (cycleStartDate > today) {
            if (loan.frequency === 'Diária') {
                cycleStartDate.setDate(cycleStartDate.getDate() - 1);
            } else if (loan.frequency === 'Semanal') {
                cycleStartDate.setDate(cycleStartDate.getDate() - 7);
            } else if (loan.frequency === 'Quinzenal') {
                cycleStartDate.setDate(cycleStartDate.getDate() - 15);
            } else {
                cycleStartDate.setMonth(cycleStartDate.getMonth() - 1);
            }
        }

        // Calculate total days elapsed since the start of the current cycle
        const diffTime = today.getTime() - cycleStartDate.getTime();
        const totalDaysElapsed = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

        const monthlyRate = Number(loan.interest_rate) || 0;

        // To be completely mathematically accurate, pro-rata shouldn't exceed the monthly rate if days > 30, 
        // though fullPeriods should always be 0 because processRecurringInterest updates every term.
        const dailyRate = monthlyRate / 30;
        const monthlyInterestRef = currentPrincipal * (monthlyRate / 100);

        // Split into Full Periods (Past Interest) and Remainder (Pro-Rata)
        // Note: Because processRecurringInterest already updates past due dates, fullPeriods should realistically always be 0.
        const fullPeriods = Math.floor(totalDaysElapsed / periodDays);
        const proRataDays = totalDaysElapsed % periodDays;

        const interestFromFullPeriods = fullPeriods * monthlyInterestRef;
        const originalProRataInterest = currentPrincipal * (dailyRate / 100) * proRataDays;
        const proRataInterest = includeProRata ? originalProRataInterest : 0;

        const finalPastInterest = totalPastInterest + interestFromFullPeriods;

        // Total Debt = Unpaid Contract Debt + Past Interest + Fines + Pro-Rata
        // which reduces back to currentBalance + interestFromFullPeriods + totalFines + proRataInterest
        const totalDebt = currentBalance + interestFromFullPeriods + totalFines + proRataInterest;

        setPreview(prev => ({
            ...prev!,
            totalDebt,
            daysElapsed: proRataDays,
            breakdown: {
                principal: currentPrincipal,
                contractInterest,
                monthlyInterestRef,
                pastInterest: finalPastInterest,
                fines: totalFines,
                originalFines,
                proRata: proRataInterest,
                originalProRata: originalProRataInterest
            },
            // Initial distribution is zero until amount is entered
            distribution: prev?.distribution || {
                finesPaid: 0,
                pastInterestPaid: 0,
                proRataPaid: 0,
                principalPaid: 0,
                contractInterestPaid: 0
            },
            result: prev?.result || {
                capitalAbated: 0,
                newBalance: currentBalance,
                newDueDate: loan.due_date
            }
        }));
    };

    const calculateDistribution = (amountStr: string) => {
        if (!preview) return;

        const payAmount = Number(amountStr) || 0;
        let remaining = payAmount;

        // 1. Pay Fines
        const finesPaid = Math.min(remaining, preview.breakdown.fines);
        remaining -= finesPaid;

        // 2. Pay Past Interest
        const pastInterestPaid = Math.min(remaining, preview.breakdown.pastInterest);
        remaining -= pastInterestPaid;

        // 3. Pay Pro-rata Interest
        const proRataPaid = Math.min(remaining, preview.breakdown.proRata);
        remaining -= proRataPaid;

        // 4. Pay Contract Interest
        const contractInterestPaid = Math.min(remaining, preview.breakdown.contractInterest);
        remaining -= contractInterestPaid;

        // 5. Pay Principal
        const principalPaid = remaining; // Can go up to full principal

        // Calculate New State
        // New Balance = Current Balance - (Contract Interest Paid + Principal Paid + Fines + Past Interest + ProRata)
        // Actually, the new debt is what's left unpaid.
        // Current Balance essentially stores Unpaid Contract Debt + Past Interest.
        // Fines and ProRata are NOT saved in loan.balance yet.
        // So newBalance must be: (Unpaid Contract Debt - contractInterestPaid - principalPaid) + (Past Interest - pastInterestPaid)

        // Wait, capitalAbated is defined as what we subtract from the principal/contract interest.
        const balancePaid = contractInterestPaid + principalPaid;

        // The previous balance includes the unpaid past interest.
        // Since we may have paid off some of the past interest, we must reflect that in the new balance.
        // newBalance = Unpaid Contract + Unpaid Past Interest
        const newContractDebt = Math.max(0, (preview.breakdown.principal + preview.breakdown.contractInterest) - balancePaid);
        const newPastInterest = Math.max(0, preview.breakdown.pastInterest - pastInterestPaid);
        
        const unpaidFines = preview.breakdown.fines - finesPaid;
        const unpaidProRata = preview.breakdown.proRata - proRataPaid;

        const newBalance = newContractDebt + newPastInterest + unpaidFines + unpaidProRata;

        const isPaidOff = newBalance <= 0.01;

        let formattedDate = '';

        if (isPaidOff) {
            formattedDate = 'Quitado';
        } else {
            // New Due Date
            const today = new Date();
            const nextDue = new Date(today);
            if (loan.frequency === 'Quinzenal') {
                nextDue.setDate(today.getDate() + 15);
            } else {
                nextDue.setMonth(today.getMonth() + 1);
            }

            // Format date as DD MMM YYYY for display
            const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            formattedDate = `${nextDue.getDate()} ${months[nextDue.getMonth()]} ${nextDue.getFullYear()}`;
        }

        setPreview(prev => ({
            ...prev!,
            distribution: {
                finesPaid,
                pastInterestPaid,
                proRataPaid,
                contractInterestPaid,
                principalPaid
            },
            result: {
                capitalAbated: balancePaid,
                newBalance,
                newDueDate: formattedDate
            }
        }));
    };

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (!preview) return <div>Carregando...</div>;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 px-6 py-4 flex items-center gap-4 shadow-sm sticky top-0 z-10">
                <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6 text-gray-700 dark:text-gray-200" />
                </button>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Abatimento de Capital</h1>
            </div>

            <div className="flex-1 p-6 max-w-3xl mx-auto w-full space-y-6">

                {/* Total Debt Breakdown */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2"></p>

                    <div className="mb-6">
                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">TOTAL DA DÍVIDA ATUALIZADA</p>
                        <h2 className="text-4xl font-bold text-gray-900 dark:text-white">R$ {formatCurrency(preview.totalDebt)}</h2>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Valor Original (Principal)</span>
                            <span className="font-medium text-gray-900 dark:text-white">R$ {formatCurrency(preview.breakdown.principal)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Juros de Contrato</span>
                            <span className="font-medium text-gray-900 dark:text-white">R$ {formatCurrency(preview.breakdown.contractInterest)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Acúmulo de Juros por Atraso</span>
                            <span className={`font-medium ${preview.breakdown.pastInterest > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                                R$ {formatCurrency(preview.breakdown.pastInterest)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600 dark:text-gray-400">Multa Administrativa</span>
                                <button
                                    onClick={() => setIncludeFines(!includeFines)}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${includeFines ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                                >
                                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${includeFines ? 'translate-x-5' : 'translate-x-1'}`} />
                                </button>
                                {!includeFines && <span className="text-xs text-green-600 dark:text-green-400 font-bold">Isento</span>}
                            </div>
                            <div className="flex flex-col items-end">
                                <span className={`font-medium ${!includeFines ? 'text-gray-400 line-through text-xs' : (preview.breakdown.originalFines > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white')}`}>
                                    R$ {formatCurrency(preview.breakdown.originalFines)}
                                </span>
                                {!includeFines && (
                                    <span className="font-bold text-green-600 dark:text-green-400">
                                        R$ 0,00
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600 dark:text-gray-400">Pro-Rata ({preview.daysElapsed} dias)</span>
                                <button
                                    onClick={() => setIncludeProRata(!includeProRata)}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${includeProRata ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                                >
                                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${includeProRata ? 'translate-x-5' : 'translate-x-1'}`} />
                                </button>
                                {!includeProRata && <span className="text-xs text-green-600 dark:text-green-400 font-bold">Isento</span>}
                            </div>
                            <div className="flex flex-col items-end">
                                <span className={`font-medium ${!includeProRata ? 'text-gray-400 line-through text-xs' : 'text-gray-900 dark:text-white'}`}>
                                    R$ {formatCurrency(preview.breakdown.originalProRata)}
                                </span>
                                {!includeProRata && (
                                    <span className="font-bold text-green-600 dark:text-green-400">
                                        R$ 0,00
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Valor a Pagar */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Valor a Pagar</p>
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-4 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                        <span className="text-gray-400 font-bold text-xl">R$</span>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => {
                                const val = e.target.value;
                                const numVal = Number(val);
                                if (preview && numVal > preview.totalDebt) {
                                    setAmount(preview.totalDebt.toFixed(2));
                                } else {
                                    setAmount(val);
                                }
                            }}
                            className="w-full bg-transparent text-3xl font-bold text-gray-900 dark:text-white outline-none"
                            placeholder="0,00"
                        />
                    </div>
                </div>

                {/* Distribuição */}
                {Number(amount) > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Distribuição de Pagamento</p>

                        <div className="space-y-6">
                            {/* Multas */}
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                                    <AlertCircle className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Abatimento de Multa</span>
                                        <span className="text-sm font-bold text-gray-900 dark:text-white">- R$ {formatCurrency(preview.distribution.finesPaid)}</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-600 rounded-full transition-all duration-500"
                                            style={{ width: preview.breakdown.fines > 0 ? `${(preview.distribution.finesPaid / preview.breakdown.fines) * 100}%` : '0%' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Juros (Past + ProRata combined visually or separate? Image shows separate) */}
                            {/* Juros Atrasados */}
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                                    <TrendingDown className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Abatimento de Juros Atrasados</span>
                                        <span className="text-sm font-bold text-gray-900 dark:text-white">- R$ {formatCurrency(preview.distribution.pastInterestPaid)}</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-600 rounded-full transition-all duration-500"
                                            style={{ width: preview.breakdown.pastInterest > 0 ? `${(preview.distribution.pastInterestPaid / preview.breakdown.pastInterest) * 100}%` : '0%' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Pro-Rata */}
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Abatimento Pro-Rata</span>
                                        <span className="text-sm font-bold text-gray-900 dark:text-white">- R$ {formatCurrency(preview.distribution.proRataPaid)}</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-600 rounded-full transition-all duration-500"
                                            style={{ width: preview.breakdown.proRata > 0 ? `${(preview.distribution.proRataPaid / preview.breakdown.proRata) * 100}%` : '0%' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Resumo do Resultado (Blue Card) */}
                <div className="bg-blue-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-600/20">
                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-blue-500/50">
                        <span className="text-sm font-medium text-blue-100 uppercase tracking-wide">Abatimento do Capital</span>
                        <span className="text-2xl font-bold">R$ {formatCurrency(preview.result.capitalAbated)}</span>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-blue-100">Novo Saldo Devedor</span>
                            <span className="font-bold text-white">R$ {formatCurrency(preview.result.newBalance)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-blue-100">Nova Data de Vencimento</span>
                            <span className="font-bold text-white">{preview.result.newDueDate}</span>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 pt-4 pb-32">
                    <button
                        onClick={onBack}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-4 rounded-xl font-bold text-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirm(Number(amount), preview)}
                        disabled={!amount || Number(amount) <= 0 || processing}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:scale-100"
                    >
                        {processing ? 'Processando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    );
};
