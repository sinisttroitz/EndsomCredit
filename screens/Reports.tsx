import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, TrendingUp, DollarSign, Users, AlertTriangle, Download, Calendar, Filter, Phone, CheckCircle, Clock, ArrowDown, Wallet, PieChart as PieIcon, Info, Search, Bell, Share2, Zap, Layers, RefreshCw, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan, Client } from '../types';
import { generateInstallments } from '../utils/loanUtils';
import { processRecurringInterest } from '../utils/interestUtils';
import { Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import * as XLSX from 'xlsx';
import { ShareReportModal } from '../components/ShareReportModal';
import { openWhatsApp } from '../utils/whatsappUtils';

interface ReportsProps {
    onBack: () => void;
    onLoanSelect?: (id: string) => void;
}

export const Reports: React.FC<ReportsProps> = ({ onBack, onLoanSelect }) => {
    const [loading, setLoading] = useState(true);
    const [loans, setLoans] = useState<any[]>([]);
    const [amortizations, setAmortizations] = useState<any[]>([]);
    const [fines, setFines] = useState<any[]>([]);
    const [showReportModal, setShowReportModal] = useState(false);

    // Filters
    const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | 'week' | 'month'>('all');
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'paid' | 'late'>('all');
    const [filterClient, setFilterClient] = useState('');
    const [filterFrequency, setFilterFrequency] = useState<'all' | 'Diária' | 'Quinzenal' | 'Mensal'>('all');

    const [alertModal, setAlertModal] = useState<{
        open: boolean;
        title: string;
        message: string;
        onConfirm?: () => void;
        confirmText?: string;
    }>({ open: false, title: '', message: '' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: loansData, error: loansError } = await supabase
                .from('loans')
                .select('*, client:clients(name, phone)');

            if (loansError) throw loansError;

            // Process recurring interest before calculating summary (Sync with Dashboard)
            const updated = await processRecurringInterest(loansData || []);

            let finalLoansData = loansData;
            if (updated) {
                const { data: freshLoans } = await supabase
                    .from('loans')
                    .select('*, client:clients(name, phone)');
                finalLoansData = freshLoans;
            }

            const { data: amortData, error: amortError } = await supabase
                .from('loan_amortizations')
                .select('*')
                .order('created_at', { ascending: true });

            if (amortError) throw amortError;

            const { data: finesData } = await supabase
                .from('installment_fines')
                .select('*');

            setLoans(finalLoansData || []);
            setAmortizations(amortData || []);
            setFines(finesData || []);
        } catch (error) {
            console.error("Erro ao buscar dados do relatório:", error);
        } finally {
            setLoading(false);
        }
    };

    // --- PROCESSAMENTO DE DADOS COM FILTROS ---
    const filteredLoans = useMemo(() => {
        return loans.filter(loan => {
            if (filterStatus !== 'all' && loan.status !== filterStatus) return false;
            if (filterFrequency !== 'all' && loan.frequency !== filterFrequency) return false;
            if (filterClient && !loan.client?.name?.toLowerCase().includes(filterClient.toLowerCase())) return false;
            return true;
        });
    }, [loans, filterStatus, filterFrequency, filterClient]);

    // Radiografia Comparativa por Modalidade (Diária, Quinzenal, Mensal)
    const frequencyBreakdown = useMemo(() => {
        const modalities: { key: 'Diária' | 'Quinzenal' | 'Mensal'; label: string }[] = [
            { key: 'Diária', label: 'Diárias' },
            { key: 'Quinzenal', label: 'Quinzenais' },
            { key: 'Mensal', label: 'Mensais' }
        ];

        return modalities.map(mod => {
            const freqLoans = loans.filter(l => l.frequency === mod.key);
            const activeLoans = freqLoans.filter(l => l.status === 'active' || l.status === 'late');

            let capitalLent = 0;
            let totalContractual = 0;
            let amountPaid = 0;
            let balanceOpen = 0;
            let lateSum = 0;
            const activeClients = new Set();

            freqLoans.forEach(loan => {
                const cap = Number(loan.amount) || 0;
                const bal = Number(loan.balance) || 0;
                const instVal = Number(loan.installment_value) || 0;
                const instCount = Number(loan.installments) || 1;
                const totalDebt = instVal * instCount;
                const paid = loan.amount_paid !== undefined && loan.amount_paid !== null
                    ? Number(loan.amount_paid)
                    : Math.max(0, totalDebt - bal);

                capitalLent += cap;
                amountPaid += paid;
                balanceOpen += bal;
                totalContractual += (totalDebt > 0 ? totalDebt : cap);

                if (loan.status !== 'paid') {
                    activeClients.add(loan.client_id);
                }

                const insts = generateInstallments(loan);
                insts.forEach(inst => {
                    if (inst.status === 'late') {
                        lateSum += inst.value;
                    }
                });
            });

            const totalInterest = Math.max(0, totalContractual - capitalLent);
            const yieldRate = capitalLent > 0 ? (totalInterest / capitalLent) * 100 : 0;
            const progress = totalContractual > 0 ? Math.round((amountPaid / totalContractual) * 100) : 0;

            return {
                ...mod,
                count: freqLoans.length,
                activeCount: activeLoans.length,
                activeClientsCount: activeClients.size,
                capitalLent,
                totalContractual,
                totalInterest,
                amountPaid,
                balanceOpen,
                lateSum,
                yieldRate,
                progress
            };
        });
    }, [loans]);

    // Resumo Cards
    const summary = useMemo(() => {
        let totalLent = 0;
        let totalReceived = 0;
        let totalToReceive = 0;
        let totalPrincipalOpen = 0;
        let lateAmount = 0;
        let activeClients = new Set();
        let totalInterestReceived = 0;
        let interestFromPaidLoans = 0;
        let interestFromRenewals = 0;
        let interestFromActiveExceeded = 0;
        let totalInterestPending = 0;
        let totalPrincipalReceived = 0;
        let activeContractualCapital = 0;
        let activeContractualInterest = 0;

        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        // Map para busca rápida de empréstimos
        const loanMap = new Map();
        filteredLoans.forEach(loan => loanMap.set(loan.id, loan));

        filteredLoans.forEach(loan => {
            const installmentValue = Number(loan.installment_value) || 0;
            const installmentsCount = Number(loan.installments) || 1;
            const totalDebt = installmentValue * installmentsCount;
            const amount = Number(loan.amount) || 0;
            const balance = Number(loan.balance) || 0;

            // Logica do Dashboard para "Total Recebido" (Dívida Abatida)
            let loanReceived = 0;
            // Usamos a condição exata do Dashboard: se existe amount_paid, usa ele. Se não, calcula.
            if (loan.amount_paid !== undefined && loan.amount_paid !== null) {
                loanReceived = Number(loan.amount_paid);
            } else {
                if (totalDebt > 0) {
                    loanReceived = Math.max(0, totalDebt - balance);
                } else {
                    loanReceived = Math.max(0, amount - balance);
                }
                // Fallback logic missed interest paid during renewals
                loanReceived += (Number(loan.total_interest_paid) || 0);
            }
            totalReceived += loanReceived;

            // Nova Logica Categorica (Sincronizada com Dashboard)
            const isCapitalCovered = loan.status === 'paid' || (loanReceived >= amount && amount > 0);

            if (isCapitalCovered) {
                totalPrincipalReceived += amount;
            } else {
                totalPrincipalOpen += amount;
            }

            if (loan.status !== 'paid') {
                // Carteira Ativa: Valor Total do Contrato (O que já entrou + O que falta entrar + Multas Pendentes)
                // Usamos loanReceived (que já inclui juros e multas pagos) + balance (contratual pendente)
                // + multas pendentes na tabela installment_fines
                const loanFines = fines.filter(f => f.loan_id === loan.id);
                const totalPendingFines = loanFines.reduce((sum, f) => sum + (Number(f.fine_value) || 0), 0);

                totalToReceive += (loanReceived + balance + totalPendingFines);
                activeClients.add(loan.client_id);

                const contractTotal = totalDebt > 0 ? totalDebt : amount;
                activeContractualCapital += amount;
                activeContractualInterest += Math.max(0, contractTotal - amount);
            }

            totalLent += amount;

            const insts = generateInstallments(loan);
            insts.forEach(inst => {
                if (inst.status === 'late') {
                    lateAmount += inst.value;
                }
            });

            // Juros Logic (Sync with Dashboard & Fix for Renewals)
            const renewalsInt = Number(loan.total_interest_paid) || 0;
            const exceededCapital = Math.max(0, loanReceived - amount);
            const currentExceededProfit = Math.max(0, exceededCapital - renewalsInt);
            const currentLoanProfitReceived = renewalsInt + currentExceededProfit;

            totalInterestReceived += currentLoanProfitReceived;
            interestFromRenewals += renewalsInt;

            if (loan.status === 'paid') {
                interestFromPaidLoans += currentLoanProfitReceived;
            } else {
                interestFromActiveExceeded += currentExceededProfit;

                // Juros Pendentes: O que falta receber (Saldo + Multas) menos o capital de base que ainda não entrou
                const principalAlreadyPaid = Math.max(0, loanReceived - renewalsInt);
                const remainingPrincipal = Math.max(0, amount - principalAlreadyPaid);
                const loanFinesValue = fines.filter(f => f.loan_id === loan.id).reduce((s, f) => s + (Number(f.fine_value) || 0), 0);

                const pendingProfit = Math.max(0, (balance + loanFinesValue) - remainingPrincipal);
                totalInterestPending += pendingProfit;
            }
        });

        // Calculamos a inadimplência como a fatia do saldo devedor que está atrasada
        const defaultRate = totalToReceive > 0 ? (lateAmount / totalToReceive) * 100 : 0;

        const portfolioYield = activeContractualCapital > 0
            ? (activeContractualInterest / activeContractualCapital) * 100
            : (totalLent > 0 ? ((totalInterestReceived + totalInterestPending) / totalLent) * 100 : 0);

        return {
            totalLent,
            totalReceived,
            totalToReceive,
            totalPrincipalOpen,
            lateAmount,
            activeClientsCount: activeClients.size,
            defaultRate,
            totalInterestReceived,
            interestFromPaidLoans,
            interestFromRenewals,
            interestFromActiveExceeded,
            totalInterestPending,
            totalPrincipalReceived,
            portfolioYield
        };
    }, [filteredLoans, amortizations, filterPeriod]);

    // Installments List
    const allInstallments = useMemo(() => {
        let list: any[] = [];
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const endOfWeek = new Date(now);
        endOfWeek.setDate(now.getDate() - now.getDay() + 6);

        filteredLoans.forEach(loan => {
            const insts = generateInstallments(loan);
            insts.forEach(inst => {
                if (filterPeriod !== 'all') {
                    const d = inst.date;
                    if (filterPeriod === 'today' && d.toDateString() !== now.toDateString()) return;
                    if (filterPeriod === 'week' && (d < startOfWeek || d > endOfWeek)) return;
                    if (filterPeriod === 'month' && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) return;
                }
                list.push({
                    ...inst,
                    loan,
                    client: loan.client
                });
            });
        });
        return list.sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [filteredLoans, filterPeriod]);

    // Clientes Inadimplentes
    const lateClients = useMemo(() => {
        const clientMap = new Map();
        allInstallments.forEach(inst => {
            if (inst.status === 'late') {
                const cId = inst.loan.client_id;
                if (!clientMap.has(cId)) {
                    clientMap.set(cId, {
                        client: inst.client,
                        loanId: inst.loan.id,
                        frequency: inst.loan?.frequency || 'Mensal',
                        lateAmount: 0,
                        lateInstallments: 0,
                        maxDaysLate: 0
                    });
                }
                const data = clientMap.get(cId);
                data.lateAmount += inst.value;
                data.lateInstallments += 1;

                const daysLate = Math.floor((new Date().getTime() - inst.date.getTime()) / (1000 * 3600 * 24));
                if (daysLate > data.maxDaysLate) data.maxDaysLate = daysLate;
            }
        });
        return Array.from(clientMap.values()).sort((a, b) => b.lateAmount - a.lateAmount);
    }, [allInstallments]);



    // Data for Status Pie Chart
    const statusData = useMemo(() => {
        let active = 0, paid = 0, late = 0;
        filteredLoans.forEach(l => {
            if (l.status === 'active') active++;
            else if (l.status === 'paid') paid++;
            else if (l.status === 'late') late++;
        });
        return [
            { name: 'Ativos', value: active, color: '#3B82F6' },
            { name: 'Quitados', value: paid, color: '#10B981' },
            { name: 'Atrasados', value: late, color: '#EF4444' }
        ];
    }, [filteredLoans]);

    const handleWhatsApp = (phone: string, name: string, amount: number) => {
        if (!phone) {
            setAlertModal({
                open: true,
                title: 'Telefone Ausente',
                message: 'Cliente não possui telefone cadastrado.'
            });
            return;
        }
        const text = `Olá ${name}, identificamos pendências em seu empréstimo no valor de R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Gostaríamos de conversar para regularizar sua situação.`;
        openWhatsApp(phone, text);
    };

    const exportToExcel = () => {
        const data = allInstallments.map(i => ({
            Cliente: i.client?.name || 'N/A',
            Modalidade: i.loan?.frequency || 'Mensal',
            Parcela: i.number,
            Vencimento: i.date.toLocaleDateString('pt-BR'),
            Valor: i.value,
            Status: i.status === 'late' ? 'Atrasada' : i.status === 'paid' ? 'Paga' : 'Pendente'
        }));
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Parcelas");
        XLSX.writeFile(workbook, `Relatorio_Parcelas_${filterFrequency}.xlsx`);
    };

    const exportToCSV = () => {
        const headers = ["Cliente", "Modalidade", "Parcela", "Vencimento", "Valor", "Status"];
        const rows = allInstallments.map(i => [
            i.client?.name || 'N/A',
            i.loan?.frequency || 'Mensal',
            i.number,
            i.date.toLocaleDateString('pt-BR'),
            i.value,
            i.status === 'late' ? 'Atrasada' : i.status === 'paid' ? 'Paga' : 'Pendente'
        ]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Relatorio_Parcelas_${filterFrequency}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-gray-900 pb-20 md:pb-0">
            {/* Header Mobile */}
            <header className="md:hidden bg-black text-white px-6 pt-8 pb-5 rounded-b-[40px] relative z-10 sticky top-0">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowReportModal(true)}
                            className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition border border-emerald-500/30 active:scale-95"
                            title="Relatório WhatsApp"
                        >
                            <Share2 className="w-5 h-5" />
                        </button>
                        <button onClick={exportToExcel} className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition" title="Exportar Excel">
                            <Download className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Filtro de Modalidade Mobile */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                    {[
                        { id: 'all', label: 'Todas' },
                        { id: 'Diária', label: 'Diárias' },
                        { id: 'Quinzenal', label: 'Quinzenais' },
                        { id: 'Mensal', label: 'Mensais' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setFilterFrequency(tab.id as any)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                                filterFrequency === tab.id
                                    ? 'bg-white text-black shadow-md'
                                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </header>

            {loading ? (
                <div className="flex-1 flex items-center justify-center p-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : (
                <>
                    {/* --- MOBILE VIEW --- */}
                    <main className="md:hidden flex-1 px-4 pt-6 overflow-y-auto space-y-6 w-full">

                        {/* 1 - CARDS DE RESUMO FINANCEIRO (REDESIGNED STYLE) */}
                        <section className="space-y-4">
                            {/* 1.1 - Carteira Ativa (Main Card) */}
                            <div className="bg-gray-900 dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-800 dark:border-gray-700 text-white">
                                <div>
                                    <div className="flex items-center gap-1.5 mb-2 group/tooltip">
                                        <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Carteira Ativa</p>
                                        <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                                        {/* Tooltip Content */}
                                        <div className="absolute top-8 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-0 w-64 sm:w-72 p-3 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl text-xs font-normal text-gray-200 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-[100] pointer-events-none">
                                            Soma total de todo o capital emprestado + juros previstos que ainda não foram pagos pelos clientes.
                                            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-4 w-3 h-3 bg-gray-900 border-t border-l border-gray-700 rotate-45"></div>
                                        </div>
                                    </div>
                                    <div className="flex items-baseline gap-2 mb-4">
                                        <span className="text-lg font-bold opacity-70">R$</span>
                                        <h2 className="text-3xl font-black tracking-tight leading-none whitespace-nowrap">
                                            {summary.totalToReceive.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </h2>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs font-medium text-gray-400 pt-3 border-t border-gray-800 dark:border-gray-700">
                                        <PieIcon className="w-3.5 h-3.5" />
                                        <span>Capital + Juros Totais Previstos</span>
                                    </div>
                                </div>
                            </div>

                            {/* 1.2 - Em Atraso & Inadimplência (Grid) */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* Em Atraso */}
                                <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 relative">
                                    <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mb-3">
                                        <Clock className="w-5 h-5 text-amber-500" />
                                    </div>
                                    <div className="flex items-center gap-1 mb-1 group/tooltip">
                                        <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Em Atraso</p>
                                        <Info className="w-3 h-3 text-gray-300 dark:text-gray-600 cursor-help" />
                                        {/* Tooltip Content */}
                                        <div className="absolute top-8 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-0 w-48 p-3 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl text-xs font-normal text-gray-200 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-[100] pointer-events-none">
                                            Somatório de todas as parcelas que já venceram e ainda não foram pagas.
                                            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-4 w-3 h-3 bg-gray-900 border-t border-l border-gray-700 rotate-45"></div>
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-black text-gray-900 dark:text-white mb-2">
                                        R$ {summary.lateAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </h3>

                                </div>

                                {/* Inadimplência */}
                                <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 relative">
                                    <div className="w-10 h-10 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mb-3">
                                        <AlertTriangle className="w-5 h-5 text-rose-500" />
                                    </div>
                                    <div className="flex items-center gap-1 mb-1 group/tooltip">
                                        <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Inadimplência</p>
                                        <Info className="w-3 h-3 text-gray-300 dark:text-gray-600 cursor-help" />
                                        {/* Tooltip Content */}
                                        <div className="absolute top-8 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-auto sm:right-0 w-48 p-3 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl text-xs font-normal text-gray-200 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-[100] pointer-events-none">
                                            Porcentagem da sua carteira total (saldo devedor) que está em risco por atraso.
                                            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-auto sm:right-4 w-3 h-3 bg-gray-900 border-t border-l border-gray-700 rotate-45"></div>
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-black text-gray-900 dark:text-white mb-2">
                                        {summary.defaultRate.toFixed(2)}%
                                    </h3>
                                    <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mt-3">
                                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(100, summary.defaultRate)}%` }}></div>
                                    </div>
                                </div>
                            </div>



                            {/* 1.4 - Clientes (Horizontal) */}
                            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gray-50 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                                        <Users className="w-6 h-6 text-gray-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-black text-gray-900 dark:text-white leading-none">CLIENTES ATIVOS</h3>
                                    </div>
                                </div>
                                <span className="text-3xl font-black text-blue-600">{summary.activeClientsCount}</span>
                            </div>
                        </section>
                        {/* GRÁFICOS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* 3 - GRÁFICO DE STATUS (REDESIGNED) */}
                            <section className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 col-span-full">
                                <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6">STATUS DA CARTEIRA</h2>

                                <div className="flex flex-row items-center justify-center max-w-2xl mx-auto gap-10 sm:gap-16">
                                    {/* O Gráfico */}
                                    <div className="h-32 w-32 sm:h-48 sm:w-48 relative flex-shrink-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={statusData}
                                                    innerRadius={35}
                                                    outerRadius={55}
                                                    paddingAngle={8}
                                                    cornerRadius={10}
                                                    dataKey="value"
                                                    stroke="none"
                                                    className="sm:hidden"
                                                >
                                                    {statusData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Pie
                                                    data={statusData}
                                                    innerRadius={60}
                                                    outerRadius={80}
                                                    paddingAngle={10}
                                                    cornerRadius={10}
                                                    dataKey="value"
                                                    stroke="none"
                                                    className="hidden sm:block"
                                                >
                                                    {statusData.map((entry, index) => (
                                                        <Cell key={`cell-lg-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        {/* Centro do Donut */}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-[8px] sm:text-xs text-gray-400 font-bold uppercase">Total</span>
                                            <span className="text-sm sm:text-xl font-black text-gray-900 dark:text-white">
                                                {statusData.reduce((a, b) => a + b.value, 0)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Legendas Estilo Conceito */}
                                    <div className="flex flex-col gap-3 flex-1">
                                        {statusData.map((item, idx) => (
                                            <div key={idx} className="flex items-center gap-2 sm:gap-3">
                                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }}></div>
                                                <div className="min-w-0">
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="text-base sm:text-lg font-black text-gray-900 dark:text-white">{item.value}</span>
                                                        <span className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase truncate">Empréstimos</span>
                                                    </div>
                                                    <p className="text-[10px] sm:text-xs text-gray-500 font-medium truncate">{item.name}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* 6 & 7 - RELATÓRIOS DE CAPITAL E JUROS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Capital Emprestado */}
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                                <h2 className="text-sm font-black text-gray-800 dark:text-white mb-4">Capital Emprestado</h2>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center group/item pt-2 border-t border-gray-50 dark:border-gray-700/50">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Capital Total</span>
                                        <span className="text-base font-black text-gray-900 dark:text-white">R$ {summary.totalLent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Já Devolvido (Principal)</span>
                                        <span className="text-base font-black text-emerald-600">R$ {summary.totalPrincipalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Capital em Aberto</span>
                                        <span className="text-base font-black text-blue-600">R$ {summary.totalPrincipalOpen.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </div>
                            <section className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4 border-b pb-2 dark:border-gray-700">Rendimento (Juros)</h2>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center bg-emerald-50/50 dark:bg-emerald-900/10 p-2 rounded-lg">
                                        <span className="text-sm font-bold text-emerald-800 dark:text-emerald-400">Juros Recebidos (Total)</span>
                                        <span className="font-black text-emerald-600">R$ {summary.totalInterestReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="pl-2 space-y-2 border-l-2 border-emerald-100 dark:border-emerald-900/30 ml-1">
                                        <div className="flex justify-between items-center text-[11px] uppercase tracking-wider">
                                            <span className="text-gray-400 font-bold">Juros de quitados</span>
                                            <span className="text-gray-600 dark:text-gray-300 font-black">R$ {summary.interestFromPaidLoans.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[11px] uppercase tracking-wider">
                                            <span className="text-gray-400 font-bold">Juros de renovações</span>
                                            <span className="text-gray-600 dark:text-gray-300 font-black">R$ {summary.interestFromRenewals.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[11px] uppercase tracking-wider">
                                            <span className="text-gray-400 font-bold">Lucro de ativos</span>
                                            <span className="text-gray-600 dark:text-gray-300 font-black">R$ {summary.interestFromActiveExceeded.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                    <div className="w-full h-px bg-gray-50 dark:bg-gray-700"></div>
                                    <div className="flex justify-between items-center bg-yellow-50/50 dark:bg-yellow-900/10 p-2 rounded-lg">
                                        <span className="text-sm font-bold text-yellow-800 dark:text-yellow-400">Juros Pendentes</span>
                                        <span className="font-black text-yellow-600">
                                            R$ {summary.totalInterestPending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* 5 - CLIENTES INADIMPLENTES */}
                        <section>
                            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">Maiores Inadimplentes</h2>
                            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden divide-y divide-gray-50 dark:divide-gray-700 max-h-80 overflow-y-auto">
                                {lateClients.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-gray-400">Nenhum cliente inadimplente. Ótimo trabalho!</div>
                                ) : (
                                    lateClients.map((item, idx) => (
                                        <div key={idx} className="p-4 flex items-center justify-between">
                                            <div>
                                                <p className="font-bold text-sm text-gray-900 dark:text-white">{item.client?.name || 'Cliente'}</p>
                                                <p className="text-xs text-red-500 font-medium">
                                                    {item.lateInstallments} parcelas • {item.maxDaysLate} dias atraso
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-black text-red-600">R$ {item.lateAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                <button
                                                    onClick={() => handleWhatsApp(item.client?.phone, item.client?.name, item.lateAmount)}
                                                    className="p-2 bg-green-50 text-green-600 rounded-full hover:bg-green-100 transition"
                                                >
                                                    <Phone className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>



                    </main>

                    {/* --- DESKTOP VIEW --- */}
                    <main className="hidden md:flex flex-col flex-1 p-8 overflow-y-auto no-scrollbar bg-gray-50 dark:bg-[#0B0B0F]">
                        <div className="max-w-[1400px] w-full mx-auto space-y-8" style={{ zoom: 0.8 }}>
                            {/* Header Desktop */}
                            <div className="flex flex-col gap-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Dashboard</h1>
                                            {filterFrequency !== 'all' && (
                                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                                                    <span>{filterFrequency}</span>
                                                    <button onClick={() => setFilterFrequency('all')} className="text-gray-400 hover:text-gray-900 dark:hover:text-white ml-0.5" title="Limpar filtro">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium text-gray-500 mt-1">Acompanhe a saúde financeira da sua carteira em tempo real.</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setShowReportModal(true)}
                                            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm active:scale-95"
                                        >
                                            <Share2 className="w-4 h-4" /> Fechamento WhatsApp
                                        </button>
                                        <button
                                            onClick={exportToExcel}
                                            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-bold rounded-xl transition-all border border-gray-200 dark:border-gray-700 shadow-sm"
                                            title="Exportar Planilha Excel"
                                        >
                                            <Download className="w-4 h-4" /> Exportar
                                        </button>
                                        <button className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors relative opacity-60">
                                            <Bell className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Barra de Filtros Segmentada Neutra (Estilo AGICRED) */}
                                <div className="flex items-center justify-between gap-4 flex-wrap">
                                    {/* Modalidades */}
                                    <div className="bg-gray-200/80 dark:bg-gray-800 p-1 rounded-xl flex items-center border border-gray-300/80 dark:border-gray-700">
                                        {[
                                            { id: 'all', label: 'Todas', count: loans.length },
                                            { id: 'Diária', label: 'Diária', count: loans.filter(l => l.frequency === 'Diária').length },
                                            { id: 'Quinzenal', label: 'Quinzenal', count: loans.filter(l => l.frequency === 'Quinzenal').length },
                                            { id: 'Mensal', label: 'Mensal', count: loans.filter(l => l.frequency === 'Mensal').length }
                                        ].map((opt) => (
                                            <button
                                                key={opt.id}
                                                onClick={() => setFilterFrequency(opt.id as any)}
                                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                                    filterFrequency === opt.id
                                                        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm'
                                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                                }`}
                                            >
                                                <span>{opt.label}</span>
                                                <span className="text-[10px] font-semibold opacity-60">({opt.count})</span>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Período */}
                                    <div className="bg-gray-200/80 dark:bg-gray-800 p-1 rounded-xl flex items-center border border-gray-300/80 dark:border-gray-700">
                                        {[
                                            { id: 'all', label: 'Todo Período' },
                                            { id: 'today', label: 'Hoje' },
                                            { id: 'week', label: 'Semana' },
                                            { id: 'month', label: 'Mês' }
                                        ].map((p) => (
                                            <button
                                                key={p.id}
                                                onClick={() => setFilterPeriod(p.id as any)}
                                                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                                                    filterPeriod === p.id
                                                        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm'
                                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                                }`}
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Top Insight Cards */}
                            <div className="grid grid-cols-5 gap-4 lg:gap-5">
                                <div className="bg-white dark:bg-gray-800 p-5 xl:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
                                    <div className="flex items-center gap-1.5 mb-4 group/tooltip relative z-10 w-fit">
                                        <div className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                                            {filterFrequency === 'all' ? 'Carteira Ativa' : `Carteira (${filterFrequency})`}
                                        </div>
                                        <Info className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 cursor-help" />
                                        <div className="absolute left-0 top-6 w-60 p-3 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl text-xs font-normal text-gray-200 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none">
                                            Soma de todo o capital emprestado + juros previstos que aguardam pagamento.
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className="text-xl lg:text-2xl xl:text-[26px] 2xl:text-3xl font-black text-gray-900 dark:text-white whitespace-nowrap tracking-tight">R$ {summary.totalToReceive.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
                                        <p className="text-xs font-medium text-gray-400 mt-2 truncate">Capital + Juros a receber</p>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-gray-800 p-5 xl:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
                                    <div className="flex items-center gap-1.5 mb-4 group/tooltip relative z-10 w-fit">
                                        <div className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Total Recebido</div>
                                        <Info className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 cursor-help" />
                                        <div className="absolute left-0 top-6 w-60 p-3 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl text-xs font-normal text-gray-200 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none">
                                            Somatório de todos os pagamentos (principal, juros e multas) já liquidados.
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className="text-xl lg:text-2xl xl:text-[26px] 2xl:text-3xl font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap tracking-tight">R$ {summary.totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
                                        <p className="text-xs font-medium text-gray-400 mt-2 truncate">Capital que já voltou</p>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-gray-800 p-5 xl:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
                                    <div className="flex items-center gap-1.5 mb-4 group/tooltip relative z-10 w-fit">
                                        <div className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Em Atraso</div>
                                        <Info className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 cursor-help" />
                                        <div className="absolute left-0 top-6 w-60 p-3 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl text-xs font-normal text-gray-200 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none">
                                            Somatório de todas as parcelas que já venceram e ainda não foram pagas.
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className="text-xl lg:text-2xl xl:text-[26px] 2xl:text-3xl font-black text-rose-600 dark:text-rose-400 whitespace-nowrap tracking-tight">R$ {summary.lateAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
                                        <p className="text-xs font-medium text-gray-400 mt-2 truncate">Valores vencidos pendentes</p>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-gray-800 p-5 xl:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
                                    <div className="flex items-center gap-1.5 mb-4 group/tooltip relative z-10 w-fit">
                                        <div className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Juros Recebidos</div>
                                        <Info className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 cursor-help" />
                                        <div className="absolute right-0 sm:-right-8 top-6 w-60 p-3 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl text-xs font-normal text-gray-200 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none">
                                            Total acumulado de rendimentos (juros e multas) que foram efetivamente recebidos.
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className="text-xl lg:text-2xl xl:text-[26px] 2xl:text-3xl font-black text-gray-900 dark:text-white whitespace-nowrap tracking-tight">R$ {summary.totalInterestReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
                                        <p className="text-xs font-medium text-gray-400 mt-2 truncate">Lucro líquido recebido</p>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-gray-800 p-5 xl:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col justify-between">
                                    <div className="flex items-center gap-1.5 mb-4 group/tooltip relative z-10 w-fit">
                                        <div className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Rentab. Média</div>
                                        <Info className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 cursor-help" />
                                        <div className="absolute right-0 sm:-right-8 top-6 w-60 p-3 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl text-xs font-normal text-gray-200 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none">
                                            Taxa de retorno médio ponderado sobre o capital emprestado na carteira ativa.
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className="text-xl lg:text-2xl xl:text-[26px] 2xl:text-3xl font-black text-gray-900 dark:text-white whitespace-nowrap tracking-tight">
                                            {summary.portfolioYield.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                        </h2>
                                        <p className="text-xs font-medium text-gray-400 mt-2 truncate">Retorno médio da carteira</p>
                                    </div>
                                </div>
                            </div>

                            {/* Resumo Comparativo por Modalidade (Visível quando em 'Todas') */}
                            {filterFrequency === 'all' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">
                                            Resumo por Modalidade
                                        </h3>
                                        <span className="text-xs text-gray-400 font-medium">
                                            {loans.length} contratos cadastrados
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                        {frequencyBreakdown.map((item) => (
                                            <div
                                                key={item.key}
                                                onClick={() => setFilterFrequency(item.key)}
                                                className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors shadow-sm cursor-pointer group flex flex-col justify-between"
                                            >
                                                <div>
                                                    {/* Header do Card */}
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div>
                                                            <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">{item.label}</h4>
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{item.activeCount} ativos • {item.activeClientsCount} clientes</span>
                                                        </div>
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                                                            {item.yieldRate.toFixed(1)}% rentab.
                                                        </span>
                                                    </div>

                                                    {/* Métricas Financeiras */}
                                                    <div className="space-y-2 mb-4 text-xs">
                                                        <div className="flex justify-between items-baseline">
                                                            <span className="text-gray-500 dark:text-gray-400 font-medium">Capital Emprestado</span>
                                                            <span className="font-bold text-gray-900 dark:text-white">R$ {item.capitalLent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                        <div className="flex justify-between items-baseline">
                                                            <span className="text-gray-500 dark:text-gray-400 font-medium">Carteira Total</span>
                                                            <span className="font-black text-gray-900 dark:text-white">R$ {item.totalContractual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                        <div className="flex justify-between items-baseline">
                                                            <span className="text-gray-500 dark:text-gray-400 font-medium">Já Recebido</span>
                                                            <span className="font-bold text-emerald-600 dark:text-emerald-400">R$ {item.amountPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                        <div className="flex justify-between items-baseline">
                                                            <span className="text-gray-500 dark:text-gray-400 font-medium">Saldo em Aberto</span>
                                                            <span className="font-bold text-gray-700 dark:text-gray-300">R$ {item.balanceOpen.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                        {item.lateSum > 0 && (
                                                            <div className="flex justify-between items-baseline pt-1.5 border-t border-gray-100 dark:border-gray-700">
                                                                <span className="text-rose-500 font-bold">Em Atraso</span>
                                                                <span className="font-black text-rose-600 dark:text-rose-400">R$ {item.lateSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Barra de Progresso */}
                                                    <div>
                                                        <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-1">
                                                            <span>Amortização</span>
                                                            <span>{item.progress}% quitado</span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full transition-all duration-500 bg-gray-900 dark:bg-white" style={{ width: `${Math.min(100, item.progress)}%` }}></div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Footer do Card */}
                                                <div className="pt-3 mt-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-[11px] font-bold text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                                                    <span>Filtrar {item.label}</span>
                                                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {/* Middle Section: Status & Rendimentos */}
                            <div className="grid grid-cols-12 gap-6">
                                {/* Left Col: Status da Carteira (Donut) */}
                                <div className="col-span-4 space-y-6">
                                    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6 rounded-2xl shadow-sm flex flex-col items-center h-full">
                                        <h3 className="font-bold text-gray-900 dark:text-white mb-6 w-full text-left text-base">Status da Carteira</h3>
                                        <div className="relative h-60 w-full flex items-center justify-center">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={statusData} innerRadius={80} outerRadius={105} paddingAngle={5} cornerRadius={6} dataKey="value" stroke="none">
                                                        {statusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                                    </Pie>
                                                    <Tooltip contentStyle={{ borderRadius: '12px', backgroundColor: 'var(--tw-colors-gray-900)', border: 'none', color: '#FFF' }} itemStyle={{ color: '#FFF' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Total</span>
                                                <span className="text-3xl font-black text-gray-900 dark:text-white">{statusData.reduce((a, b) => a + b.value, 0)}</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 mt-6 w-full">
                                            {statusData.map((item, idx) => (
                                                <div key={idx} className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700/50 text-center flex flex-col items-center justify-center">
                                                    <div className="w-2.5 h-2.5 rounded-full mb-2" style={{ backgroundColor: item.color }}></div>
                                                    <p className="text-lg font-black text-gray-900 dark:text-white leading-none mb-1">{item.value}</p>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{item.name}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Col: Rendimentos & Capital */}
                                <div className="col-span-8 flex flex-col gap-6">
                                    {/* Top Header Block */}
                                    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-6 shadow-sm flex items-center justify-between">
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white text-base">Distribuição de Rendimentos</h3>
                                            <p className="text-xs text-gray-400 mt-1">Análise detalhada entre juros captados e fluxos de capital.</p>
                                        </div>
                                        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center text-gray-500 dark:text-gray-400">
                                            <TrendingUp className="w-5 h-5" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6 flex-1">
                                        {/* Column 1: Rendimentos Breakdown */}
                                        <div className="space-y-6 flex flex-col h-full">
                                            {/* Juros Recebidos Card */}
                                            <div className="h-full bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col">
                                                <div className="flex justify-between items-center mb-6">
                                                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                                        <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Juros Efetivados
                                                    </h4>
                                                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">R$ {summary.totalInterestReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                </div>
                                                <div className="space-y-3 flex-1 flex flex-col justify-end">
                                                    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-700/50">
                                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">De Quitados</span>
                                                        <span className="text-sm font-bold text-gray-900 dark:text-white">R$ {summary.interestFromPaidLoans.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-700/50">
                                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">De Renovações</span>
                                                        <span className="text-sm font-bold text-gray-900 dark:text-white">R$ {summary.interestFromRenewals.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-700/50">
                                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Lucro Ativos</span>
                                                        <span className="text-sm font-bold text-gray-900 dark:text-white">R$ {summary.interestFromActiveExceeded.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Column 2: Capital & Juros Pendentes */}
                                        <div className="space-y-6 flex flex-col h-full">
                                            {/* Distribuição de Capital Box */}
                                            <div className="flex-1 bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col">
                                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-6 border-b border-gray-100 dark:border-gray-700 pb-3">Capital Base</h4>
                                                <div className="space-y-3 flex-1 flex flex-col justify-end">
                                                    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-700/50">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                                                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Distribuído</span>
                                                        </div>
                                                        <span className="text-sm font-bold text-gray-900 dark:text-white">R$ {summary.totalLent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-700/50">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Recuperado</span>
                                                        </div>
                                                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">R$ {summary.totalPrincipalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-700/50">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Em Aberto</span>
                                                        </div>
                                                        <span className="text-sm font-bold text-gray-900 dark:text-white">R$ {summary.totalPrincipalOpen.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Juros Pendentes Box */}
                                            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between cursor-help" title="Valor calculado em cima de multas e capital futuro dos empréstimos.">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700/60 rounded-xl flex items-center justify-center shrink-0 text-gray-500 dark:text-gray-400">
                                                        <Clock className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Juros a Receber</h4>
                                                        <p className="text-xs text-gray-400">Futuros e Multas</p>
                                                    </div>
                                                </div>
                                                <span className="text-xl font-black text-gray-900 dark:text-white">R$ {summary.totalInterestPending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Maiores Inadimplentes Table */}
                            <div className="bg-white dark:bg-gray-800 p-6 xl:p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400">
                                            <AlertTriangle className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                                                Inadimplentes Críticos {filterFrequency !== 'all' ? `(${filterFrequency === 'Diária' ? 'Diárias' : filterFrequency === 'Quinzenal' ? 'Quinzenais' : 'Mensais'})` : ''}
                                            </h3>
                                            <p className="text-xs text-gray-400">
                                                {filterFrequency === 'all' 
                                                    ? 'Atenção necessária aos maiores devedores do sistema em todas as modalidades.' 
                                                    : `Clientes com parcelas em atraso específicas da modalidade selecionada.`}
                                            </p>
                                        </div>
                                    </div>
                                    {filterFrequency !== 'all' && (
                                        <button
                                            onClick={() => setFilterFrequency('all')}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 transition"
                                        >
                                            Ver de Todas as Modalidades
                                        </button>
                                    )}
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-gray-100 dark:border-gray-700 text-gray-400 text-[10px] font-bold uppercase tracking-wider">
                                                <th className="pb-3 pl-3">Cliente / Contato</th>
                                                <th className="pb-3 px-3 text-center">Status Atraso</th>
                                                <th className="pb-3 px-3 text-center">Risco</th>
                                                <th className="pb-3 px-3 text-right">Montante Devido</th>
                                                <th className="pb-3 pr-3 text-right">Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                                            {lateClients.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="py-12 text-center">
                                                        <div className="flex flex-col items-center justify-center gap-2">
                                                            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 rounded-full flex items-center justify-center mb-1">
                                                                <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                                                            </div>
                                                            <p className="text-gray-900 dark:text-white font-bold text-base">Carteira Saudável</p>
                                                            <p className="text-gray-400 text-xs max-w-sm">
                                                                {filterFrequency === 'all'
                                                                    ? 'Nenhum cliente possui parcelas pendentes com atraso em sua carteira.'
                                                                    : `Nenhum cliente possui parcelas em atraso na modalidade ${filterFrequency}.`}
                                                            </p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                lateClients.slice(0, 10).map((item, idx) => (
                                                    <tr key={idx} onClick={() => onLoanSelect && onLoanSelect(item.loanId)} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group cursor-pointer">
                                                        <td className="py-4 pl-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center font-bold text-xs border border-gray-200 dark:border-gray-600 overflow-hidden">
                                                                    {item.client?.avatar_url && !item.client.avatar_url.includes('ui-avatars.com') ? (
                                                                        <img src={item.client.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <span>{item.client?.name?.substring(0, 2).toUpperCase() || 'CL'}</span>
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-semibold text-sm text-gray-900 dark:text-white">
                                                                            {item.client?.name || 'Cliente Sem Nome'}
                                                                        </span>
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                                                                            {item.frequency || 'Mensal'}
                                                                        </span>
                                                                    </div>
                                                                    <span className="text-xs text-gray-400">{item.client?.phone || 'Sem contato'}</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-3 text-center">
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-800/40 rounded-lg text-xs font-bold">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                                                {item.lateInstallments} parcela(s)
                                                            </span>
                                                        </td>
                                                        <td className="py-4 px-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-sm text-gray-700 dark:text-gray-300 font-bold">{item.maxDaysLate}</span>
                                                                <span className="text-[10px] text-gray-400 font-medium uppercase">Dias Máx</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-3 text-right">
                                                            <span className="text-sm font-bold text-rose-600 dark:text-rose-400">R$ {item.lateAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        </td>
                                                        <td className="py-4 pr-3 text-right">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleWhatsApp(item.client?.phone, item.client?.name, item.lateAmount); }} 
                                                                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-gray-100 hover:bg-emerald-50 dark:bg-gray-700 dark:hover:bg-emerald-900/30 text-gray-700 hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400 border border-gray-200 dark:border-gray-600 font-bold text-xs rounded-lg transition-colors"
                                                            >
                                                                <Phone className="w-3.5 h-3.5" /> Cobrar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </main>
                </>
            )}

            {/* Alert Modal */}
            {alertModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
            {/* Modal de Compartilhamento / Relatório WhatsApp */}
            <ShareReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
            />
        </div>
    );
};
