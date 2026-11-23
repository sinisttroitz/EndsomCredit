import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, TrendingUp, DollarSign, Users, AlertTriangle, Download, Calendar, Filter, Phone, CheckCircle, Clock, ArrowDown, Wallet, PieChart as PieIcon, Info, Search, Bell, Share2, Zap, Layers, RefreshCw, X, MessageCircle, ArrowUpRight, Copy, Check } from 'lucide-react';
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
    const [profitSearch, setProfitSearch] = useState('');
    const [profitStatusFilter, setProfitStatusFilter] = useState<'all' | 'active' | 'late' | 'paid'>('active');
    const [copiedProfit, setCopiedProfit] = useState(false);

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
                const isMensal = loan.frequency === 'Mensal';
                const totalDebt = isMensal ? (cap + instVal) : (instVal * instCount);
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
        let activeBalance = 0;

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
            const amount = Number(loan.amount) || 0;
            const balance = Number(loan.balance) || 0;
            const installmentValue = Number(loan.installment_value) || 0;
            const installmentsCount = Number(loan.installments) || 1;
            const isMensal = loan.frequency === 'Mensal';
            const totalDebt = isMensal ? (amount + installmentValue) : (installmentValue * installmentsCount);

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
                activeBalance += balance;
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
            portfolioYield,
            activeCapital: activeContractualCapital,
            activeBalance,
            activeContractualInterest
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

    // Cálculos Operacionais do Dia
    const todayStart = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const todayZero = useMemo(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }, []);

    const receivedToday = useMemo(() => {
        return amortizations
            .filter(a => a.created_at && new Date(a.created_at).getTime() >= todayStart.getTime())
            .reduce((sum, a) => sum + (Number(a.amount_paid) || 0), 0);
    }, [amortizations, todayStart]);

    const todayCharges = useMemo(() => {
        const list: any[] = [];
        loans.forEach(loan => {
            if (loan.status !== 'paid') {
                const loanFines = fines.filter(f => f.loan_id === loan.id);
                const insts = generateInstallments(loan, loanFines);
                const todayInsts = insts.filter(inst => {
                    const instDate = new Date(inst.date);
                    const instDateZero = new Date(instDate.getFullYear(), instDate.getMonth(), instDate.getDate());
                    return instDateZero.getTime() === todayZero.getTime() && inst.status !== 'paid';
                });

                todayInsts.forEach(inst => {
                    list.push({
                        loanId: loan.id,
                        clientId: loan.client_id,
                        clientName: loan.client?.name || 'Cliente',
                        clientPhone: loan.client?.phone,
                        clientAvatar: loan.client?.avatar_url,
                        installmentNumber: inst.number,
                        totalInstallments: loan.installments || 1,
                        amount: inst.value,
                        frequency: loan.frequency || 'Diária'
                    });
                });
            }
        });
        return list;
    }, [loans, fines, todayZero]);

    const enrichedLateLoans = useMemo(() => {
        const list: any[] = [];
        loans.forEach(loan => {
            if (loan.status !== 'paid') {
                const loanFines = fines.filter(f => f.loan_id === loan.id);
                const insts = generateInstallments(loan, loanFines);
                const overdueInsts = insts.filter(inst => inst.status === 'late');
                if (overdueInsts.length > 0 || loan.status === 'late') {
                    const overdueAmount = overdueInsts.reduce((sum, i) => sum + i.value, 0) || Number(loan.balance);
                    const oldestDate = overdueInsts[0]?.date;
                    const daysLate = oldestDate 
                        ? Math.max(1, Math.floor((todayZero.getTime() - new Date(oldestDate).getTime()) / (1000 * 60 * 60 * 24)))
                        : 1;

                    list.push({
                        ...loan,
                        overdueAmount,
                        daysLate,
                        overdueCount: overdueInsts.length
                    });
                }
            }
        });
        return list.sort((a, b) => (b.daysLate || 0) - (a.daysLate || 0));
    }, [loans, fines, todayZero]);

    // Lista detalhada de lucro por cliente e contrato
    const clientProfitList = useMemo(() => {
        return loans.map(loan => {
            const cap = Number(loan.amount) || 0;
            const instVal = Number(loan.installment_value) || 0;
            const instCount = Number(loan.installments) || 1;
            const isMensal = loan.frequency === 'Mensal';
            const isAluguel = loan.frequency === 'Aluguel';

            let contractTotal = 0;
            let expectedProfit = 0;

            if (isMensal) {
                contractTotal = cap + instVal;
                expectedProfit = instVal;
            } else if (isAluguel) {
                contractTotal = cap;
                expectedProfit = Number(loan.total_interest_paid) || 0;
            } else {
                contractTotal = instVal * instCount;
                expectedProfit = Math.max(0, contractTotal - cap);
            }

            const profitMargin = cap > 0 ? (expectedProfit / cap) * 100 : 0;

            let realizedProfit = 0;
            const renewalsInt = Number(loan.total_interest_paid) || 0;
            if (loan.status === 'paid') {
                realizedProfit = expectedProfit;
            } else {
                const paid = Number(loan.amount_paid) || 0;
                if (isMensal) {
                    realizedProfit = renewalsInt;
                } else if (contractTotal > 0 && expectedProfit > 0) {
                    const profitRatio = expectedProfit / contractTotal;
                    realizedProfit = renewalsInt + (paid * profitRatio);
                }
            }

            const pendingProfit = Math.max(0, expectedProfit - realizedProfit);

            return {
                id: loan.id,
                clientId: loan.client_id,
                clientName: loan.client?.name || 'Cliente',
                clientPhone: loan.client?.phone,
                frequency: loan.frequency || 'Diária',
                amount: cap,
                contractTotal,
                expectedProfit,
                profitMargin,
                realizedProfit,
                pendingProfit,
                status: loan.status,
                balance: Number(loan.balance) || 0
            };
        });
    }, [loans]);

    const filteredClientProfitList = useMemo(() => {
        return clientProfitList.filter(item => {
            if (profitStatusFilter !== 'all') {
                if (profitStatusFilter === 'active' && item.status === 'paid') return false;
                if (profitStatusFilter === 'late' && item.status !== 'late') return false;
                if (profitStatusFilter === 'paid' && item.status !== 'paid') return false;
            }
            if (profitSearch && !item.clientName.toLowerCase().includes(profitSearch.toLowerCase())) {
                return false;
            }
            return true;
        });
    }, [clientProfitList, profitStatusFilter, profitSearch]);

    const profitTotals = useMemo(() => {
        return filteredClientProfitList.reduce((acc, item) => {
            acc.amount += item.amount;
            acc.contractTotal += item.contractTotal;
            acc.expectedProfit += item.expectedProfit;
            acc.realizedProfit += item.realizedProfit;
            acc.pendingProfit += item.pendingProfit;
            acc.balance += item.balance;
            return acc;
        }, {
            amount: 0,
            contractTotal: 0,
            expectedProfit: 0,
            realizedProfit: 0,
            pendingProfit: 0,
            balance: 0
        });
    }, [filteredClientProfitList]);

    const handleCopyProfitSummary = () => {
        if (filteredClientProfitList.length === 0) return;
        let text = `📊 *DEMONSTRATIVO DE LUCRO POR CLIENTE (AGICRED)*\n`;
        text += `Data: ${new Date().toLocaleDateString('pt-BR')}\n\n`;
        filteredClientProfitList.forEach(item => {
            const exp = item.expectedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const real = item.realizedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            text += `• *${item.clientName}* (${item.frequency})\n   Lucro Previsto: R$ ${exp} (${item.profitMargin.toFixed(0)}%) | Realizado: R$ ${real}\n`;
        });
        text += `\n-----------------------------\n`;
        text += `💰 *LUCRO TOTAL PREVISTO:* R$ ${profitTotals.expectedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        text += `✅ *LUCRO JÁ REALIZADO:* R$ ${profitTotals.realizedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        text += `⏳ *LUCRO A REALIZAR:* R$ ${profitTotals.pendingProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;

        navigator.clipboard.writeText(text);
        setCopiedProfit(true);
        setTimeout(() => setCopiedProfit(false), 2500);
    };

    const handleSendWhatsAppReminder = (e: React.MouseEvent, clientName: string, phone?: string, amount?: number, type: 'today' | 'late' = 'today', daysLate?: number) => {
        e.stopPropagation();
        if (!phone) {
            setAlertModal({
                open: true,
                title: 'Telefone Ausente',
                message: 'Este cliente não possui telefone cadastrado.'
            });
            return;
        }
        const formattedAmount = (amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        let message = '';
        if (type === 'late') {
            const lateText = daysLate && daysLate > 1 ? `está em atraso há ${daysLate} dias` : 'venceu e encontra-se pendente';
            message = `Olá, ${clientName}! Tudo bem?\nPassando para lembrar que sua parcela de R$ ${formattedAmount} ${lateText}. Poderia nos dar um retorno sobre a previsão de pagamento, por gentileza? Obrigado!`;
        } else {
            message = `Olá, ${clientName}! Tudo bem?\nPassando para lembrar que sua parcela de R$ ${formattedAmount} vence hoje. Segue a chave Pix para pagamento quando puder realizar. Tenha um ótimo dia!`;
        }
        openWhatsApp(phone, message);
    };

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
                    <main className="hidden md:flex flex-col flex-1 p-8 overflow-y-auto no-scrollbar bg-background-light dark:bg-background-dark">
                        <div className="max-w-[1400px] w-full mx-auto space-y-6">
                            {/* Header Desktop */}
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Painel de Controle</h1>
                                            {filterFrequency !== 'all' && (
                                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                                                    <span>{filterFrequency}</span>
                                                    <button onClick={() => setFilterFrequency('all')} className="text-gray-400 hover:text-gray-900 dark:hover:text-white ml-0.5 cursor-pointer" title="Limpar filtro">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-xs font-medium text-gray-500 mt-1">Acompanhe a movimentação de hoje e a saúde financeira da sua carteira em tempo real.</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setShowReportModal(true)}
                                            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 text-sm font-semibold rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer"
                                        >
                                            <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Fechamento WhatsApp
                                        </button>
                                        <button
                                            onClick={exportToExcel}
                                            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-xl transition-all border border-gray-200 dark:border-gray-700 shadow-xs cursor-pointer"
                                            title="Exportar Planilha Excel"
                                        >
                                            <Download className="w-4 h-4" /> Exportar Excel
                                        </button>
                                    </div>
                                </div>

                                {/* Barra de Filtros Segmentada Neutra */}
                                <div className="flex items-center justify-between gap-4 flex-wrap">
                                    <div className="bg-gray-200/60 dark:bg-gray-800/60 p-1 rounded-xl flex items-center border border-gray-200 dark:border-gray-700/60">
                                        {[
                                            { id: 'all', label: 'Todas', count: loans.length },
                                            { id: 'Diária', label: 'Diária', count: loans.filter(l => l.frequency === 'Diária').length },
                                            { id: 'Quinzenal', label: 'Quinzenal', count: loans.filter(l => l.frequency === 'Quinzenal').length },
                                            { id: 'Mensal', label: 'Mensal', count: loans.filter(l => l.frequency === 'Mensal').length }
                                        ].map((opt) => (
                                            <button
                                                key={opt.id}
                                                onClick={() => setFilterFrequency(opt.id as any)}
                                                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                                                    filterFrequency === opt.id
                                                        ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                                                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                                }`}
                                            >
                                                <span>{opt.label}</span>
                                                <span className="text-[10px] opacity-60">({opt.count})</span>
                                            </button>
                                        ))}
                                    </div>

                                    <div className="text-xs font-medium text-gray-400">
                                        {loans.filter(l => l.status !== 'paid').length} contratos ativos na carteira
                                    </div>
                                </div>
                            </div>

                            {/* 1. MOVIMENTAÇÃO DE HOJE (A Janela Operacional do Dia) */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                        Movimentação de Hoje • {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                                    </h2>
                                </div>

                                <div className="grid grid-cols-4 gap-4">
                                    {/* 1.1 A Cobrar Hoje */}
                                    <div className="bg-white dark:bg-card-dark rounded-2xl p-5 border border-gray-200/70 dark:border-gray-800 shadow-xs">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">A Cobrar Hoje</span>
                                            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                                <Clock className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-2xl font-black font-manrope text-gray-900 dark:text-white leading-none block">
                                                R$ {todayCharges.reduce((acc, c) => acc + c.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-1.5">
                                                {todayCharges.length === 0 ? 'Nenhum vencimento para hoje' : `${todayCharges.length} cobranças previstas hoje`}
                                            </span>
                                        </div>
                                    </div>

                                    {/* 1.2 Já Recebido Hoje */}
                                    <div className="bg-white dark:bg-card-dark rounded-2xl p-5 border border-gray-200/70 dark:border-gray-800 shadow-xs">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Já Recebido Hoje</span>
                                            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                                <CheckCircle className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-2xl font-black font-manrope text-emerald-600 dark:text-emerald-400 leading-none block">
                                                R$ {receivedToday.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-1.5">
                                                {receivedToday > 0 ? 'Valores confirmados no caixa' : 'Aguardando primeiros pagamentos'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* 1.3 Total em Atraso */}
                                    <div className={`rounded-2xl p-5 border shadow-xs transition-all ${
                                        summary.lateAmount > 0 
                                            ? 'bg-red-50/40 dark:bg-red-950/20 border-red-200/80 dark:border-red-900/40' 
                                            : 'bg-white dark:bg-card-dark border-gray-200/70 dark:border-gray-800'
                                    }`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total em Atraso</span>
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                                                summary.lateAmount > 0 
                                                    ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' 
                                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                            }`}>
                                                <AlertTriangle className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <div>
                                            <span className={`text-2xl font-black font-manrope leading-none block ${
                                                summary.lateAmount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                                            }`}>
                                                R$ {summary.lateAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className={`text-[11px] block mt-1.5 font-medium ${
                                                summary.lateAmount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                                            }`}>
                                                {enrichedLateLoans.length > 0 ? `${enrichedLateLoans.length} clientes com atraso pendente` : 'Nenhum atraso no momento'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* 1.4 Clientes Ativos */}
                                    <div className="bg-white dark:bg-card-dark rounded-2xl p-5 border border-gray-200/70 dark:border-gray-800 shadow-xs">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Clientes Ativos</span>
                                            <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300">
                                                <Users className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-2xl font-black font-manrope text-gray-900 dark:text-white leading-none block">
                                                {summary.activeClientsCount} Ativos
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-1.5">
                                                {loans.filter(l => l.status !== 'paid').length} contratos em andamento
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 2. SAÚDE DA CARTEIRA ATIVA (Visão Global — Zero Calculadora!) */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                        Saúde da Carteira Ativa (Visão Financeira)
                                    </h2>
                                </div>

                                <div className="grid grid-cols-4 gap-4">
                                    {/* 2.1 Capital Próprio na Praça */}
                                    <div className="bg-white dark:bg-card-dark rounded-2xl p-5 border border-gray-200/70 dark:border-gray-800 shadow-xs">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Capital na Praça</span>
                                            <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300">
                                                <DollarSign className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-2xl font-black font-manrope text-gray-900 dark:text-white leading-none block">
                                                R$ {summary.activeCapital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-1.5">
                                                Capital puro ativo na praça
                                            </span>
                                        </div>
                                    </div>

                                    {/* 2.2 Saldo Devedor a Receber */}
                                    <div className="bg-white dark:bg-card-dark rounded-2xl p-5 border border-gray-200/70 dark:border-gray-800 shadow-xs">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total a Receber</span>
                                            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                                <Wallet className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-2xl font-black font-manrope text-indigo-600 dark:text-indigo-400 leading-none block">
                                                R$ {summary.totalToReceive.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-1.5">
                                                Restam R$ {summary.activeBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} em aberto
                                            </span>
                                        </div>
                                    </div>

                                    {/* 2.3 Lucro Projetado da Carteira */}
                                    <div className="bg-white dark:bg-card-dark rounded-2xl p-5 border border-gray-200/70 dark:border-gray-800 shadow-xs">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Lucro Previsto</span>
                                            <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center text-teal-600 dark:text-teal-400">
                                                <TrendingUp className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-2xl font-black font-manrope text-teal-600 dark:text-teal-400 leading-none block">
                                                R$ {Math.max(0, summary.totalToReceive - summary.activeCapital).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-1.5">
                                                Retorno projetado sobre contratos ativos
                                            </span>
                                        </div>
                                    </div>

                                    {/* 2.4 Lucro Já Realizado */}
                                    <div className="bg-white dark:bg-card-dark rounded-2xl p-5 border border-gray-200/70 dark:border-gray-800 shadow-xs">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Lucro Já Realizado</span>
                                            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                                <ArrowUpRight className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-2xl font-black font-manrope text-emerald-600 dark:text-emerald-400 leading-none block">
                                                R$ {summary.totalInterestReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-1.5">
                                                Juros e taxas já quitados
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 3. COCKPIT OPERACIONAL (Fila de Atrasados & Vencimentos de Hoje) */}
                            <div className="grid grid-cols-12 gap-6">
                                {/* 3.1 Coluna da Esquerda (7 colunas): Fila de Cobrança Urgente */}
                                <div className="col-span-7 bg-white dark:bg-card-dark rounded-2xl p-6 border border-gray-200/70 dark:border-gray-800 shadow-xs flex flex-col">
                                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                                        <div className="flex items-center gap-2.5">
                                            <h3 className="font-bold text-gray-900 dark:text-white text-base">Fila de Cobrança (Atrasados)</h3>
                                            {enrichedLateLoans.length > 0 && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                                                    {enrichedLateLoans.length} pendentes
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-x-auto">
                                        {enrichedLateLoans.length > 0 ? (
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                                                        <th className="pb-3 pl-1">Cliente</th>
                                                        <th className="pb-3">Modalidade</th>
                                                        <th className="pb-3">Valor Vencido</th>
                                                        <th className="pb-3">Atraso</th>
                                                        <th className="pb-3 text-right pr-1">Ação</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                                                    {enrichedLateLoans.slice(0, 8).map((loan: any) => (
                                                        <tr 
                                                            key={loan.id} 
                                                            onClick={() => onLoanSelect?.(loan.id)}
                                                            className="group hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors cursor-pointer"
                                                        >
                                                            <td className="py-3.5 pl-1">
                                                                <div className="flex items-center gap-2.5">
                                                                    <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center justify-center text-xs font-bold border border-zinc-200 dark:border-zinc-700 overflow-hidden shrink-0">
                                                                        {loan.client?.avatar_url && !loan.client.avatar_url.includes('ui-avatars.com') ? (
                                                                            <img src={loan.client.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <span>{loan.client?.name?.substring(0, 2).toUpperCase() || 'CL'}</span>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[140px]">
                                                                        {loan.client?.name || 'Cliente'}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="py-3.5 text-xs text-gray-500 font-medium">
                                                                {loan.frequency || 'Diária'}
                                                            </td>
                                                            <td className="py-3.5 text-sm font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                                                                R$ {Number(loan.overdueAmount || loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="py-3.5">
                                                                <span className="px-2 py-0.5 rounded-md bg-red-100/80 text-red-700 dark:bg-red-950/50 dark:text-red-400 text-[11px] font-bold whitespace-nowrap">
                                                                    {loan.daysLate && loan.daysLate > 1 ? `Há ${loan.daysLate} dias` : 'Venceu ontem'}
                                                                </span>
                                                            </td>
                                                            <td className="py-3.5 text-right pr-1">
                                                                <button
                                                                    onClick={(e) => handleSendWhatsAppReminder(e, loan.client?.name, loan.client?.phone, loan.overdueAmount || loan.amount, 'late', loan.daysLate)}
                                                                    title="Cobrar via WhatsApp"
                                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 dark:text-emerald-400 text-xs font-bold transition-colors cursor-pointer border border-emerald-200 dark:border-emerald-800/60"
                                                                >
                                                                    <MessageCircle className="w-3.5 h-3.5" />
                                                                    Cobrar
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="py-12 flex flex-col items-center justify-center text-center">
                                                <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                                                    <CheckCircle className="w-6 h-6" />
                                                </div>
                                                <h4 className="font-bold text-gray-900 dark:text-white text-sm">Tudo em dia!</h4>
                                                <p className="text-xs text-gray-400 mt-0.5">Nenhum cliente com parcelas atrasadas no momento.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 3.2 Coluna da Direita (5 colunas): Vencimentos de Hoje */}
                                <div className="col-span-5 bg-white dark:bg-card-dark rounded-2xl p-6 border border-gray-200/70 dark:border-gray-800 shadow-xs flex flex-col">
                                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-gray-900 dark:text-white text-base">Vencimentos de Hoje</h3>
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                                                {todayCharges.length} hoje
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto max-h-[360px] space-y-2.5 no-scrollbar pr-1">
                                        {todayCharges.length > 0 ? (
                                            todayCharges.slice(0, 8).map((charge, idx) => (
                                                <div 
                                                    key={`${charge.loanId}-${idx}`}
                                                    onClick={() => onLoanSelect?.(charge.loanId)}
                                                    className="p-3 bg-gray-50/80 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold shrink-0">
                                                            {charge.clientName.substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                                                {charge.clientName}
                                                            </p>
                                                            <p className="text-[11px] text-gray-400">
                                                                {charge.frequency === 'Mensal' ? 'Juros do mês' : `Parcela ${charge.installmentNumber}/${charge.totalInstallments}`} • {charge.frequency}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-sm font-black text-gray-900 dark:text-white">
                                                            R$ {charge.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                        <button
                                                            onClick={(e) => handleSendWhatsAppReminder(e, charge.clientName, charge.clientPhone, charge.amount, 'today')}
                                                            title="Enviar lembrete via WhatsApp"
                                                            className="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center transition-colors cursor-pointer border border-emerald-200 dark:border-emerald-800/50"
                                                        >
                                                            <MessageCircle className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="py-12 flex flex-col items-center justify-center text-center">
                                                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 flex items-center justify-center mb-2">
                                                    <Calendar className="w-6 h-6" />
                                                </div>
                                                <h4 className="font-bold text-gray-900 dark:text-white text-sm">Nenhuma cobrança para hoje</h4>
                                                <p className="text-xs text-gray-400 mt-0.5">As próximas cobranças estão nos dias seguintes.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 4. DEMONSTRATIVO DE LUCRO POR CLIENTE */}
                            <section className="bg-white dark:bg-card-dark rounded-2xl p-6 border border-gray-200/70 dark:border-gray-800 shadow-xs space-y-5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
                                    <div>
                                        <div className="flex items-center gap-2.5">
                                            <h3 className="font-bold text-gray-900 dark:text-white text-lg">Lucro por Cliente</h3>
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                                                Total: R$ {profitTotals.expectedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            Detalhamento do retorno bruto (juros) individual de cada cliente e o somatório geral da carteira.
                                        </p>
                                    </div>

                                    {/* Controles: Busca, Filtro e Copiar */}
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <div className="relative">
                                            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                            <input
                                                type="text"
                                                value={profitSearch}
                                                onChange={(e) => setProfitSearch(e.target.value)}
                                                placeholder="Buscar cliente..."
                                                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary/20 w-44"
                                            />
                                        </div>

                                        <div className="bg-gray-200/60 dark:bg-gray-800/60 p-1 rounded-xl flex items-center border border-gray-200 dark:border-gray-700/60 text-xs">
                                            {[
                                                { id: 'active', label: 'Ativos' },
                                                { id: 'all', label: 'Todos' },
                                                { id: 'late', label: 'Atrasados' },
                                                { id: 'paid', label: 'Quitados' },
                                            ].map(tab => (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => setProfitStatusFilter(tab.id as any)}
                                                    className={`py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer ${
                                                        profitStatusFilter === tab.id
                                                            ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                                                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
                                                    }`}
                                                >
                                                    {tab.label}
                                                </button>
                                            ))}
                                        </div>

                                        <button
                                            onClick={handleCopyProfitSummary}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-xl transition-all cursor-pointer border border-gray-200 dark:border-gray-700"
                                            title="Copiar lista de lucros formatada"
                                        >
                                            {copiedProfit ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                                            {copiedProfit ? 'Copiado!' : 'Copiar Lista'}
                                        </button>
                                    </div>
                                </div>

                                {/* 3 Mini Cards de Resumo */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-gray-50/80 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Lucro Total Previsto</span>
                                        <span className="text-xl font-black font-manrope text-teal-600 dark:text-teal-400 block mt-1">
                                            R$ {profitTotals.expectedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[11px] text-gray-400 block mt-0.5">Juros totais da seleção</span>
                                    </div>
                                    <div className="bg-gray-50/80 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Lucro Já Realizado</span>
                                        <span className="text-xl font-black font-manrope text-emerald-600 dark:text-emerald-400 block mt-1">
                                            R$ {profitTotals.realizedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[11px] text-gray-400 block mt-0.5">Juros já recolhidos no caixa</span>
                                    </div>
                                    <div className="bg-gray-50/80 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Lucro a Realizar</span>
                                        <span className="text-xl font-black font-manrope text-indigo-600 dark:text-indigo-400 block mt-1">
                                            R$ {profitTotals.pendingProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[11px] text-gray-400 block mt-0.5">Juros pendentes a entrar</span>
                                    </div>
                                </div>

                                {/* Tabela Elegante de Lucro */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                                                <th className="pb-3 pl-2">Cliente</th>
                                                <th className="pb-3">Modalidade</th>
                                                <th className="pb-3 text-right">Capital</th>
                                                <th className="pb-3 text-right">Total a Receber</th>
                                                <th className="pb-3 text-right text-teal-600 dark:text-teal-400">Lucro Previsto</th>
                                                <th className="pb-3 text-right text-emerald-600 dark:text-emerald-400">Lucro Realizado</th>
                                                <th className="pb-3 text-right text-indigo-600 dark:text-indigo-400">Lucro Pendente</th>
                                                <th className="pb-3 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60 text-sm">
                                            {filteredClientProfitList.length > 0 ? (
                                                filteredClientProfitList.map((item) => (
                                                    <tr
                                                        key={item.id}
                                                        onClick={() => onLoanSelect?.(item.id)}
                                                        className="group hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors cursor-pointer"
                                                    >
                                                        <td className="py-3 pl-2 font-semibold text-gray-900 dark:text-white">
                                                            {item.clientName}
                                                        </td>
                                                        <td className="py-3 text-xs text-gray-500 font-medium">
                                                            {item.frequency}
                                                        </td>
                                                        <td className="py-3 text-right font-medium text-gray-600 dark:text-gray-300">
                                                            R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="py-3 text-right font-medium text-gray-900 dark:text-white">
                                                            R$ {item.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="py-3 text-right font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap">
                                                            R$ {item.expectedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            <span className="text-[10px] ml-1 opacity-70 font-normal">
                                                                (+{item.profitMargin.toFixed(0)}%)
                                                            </span>
                                                        </td>
                                                        <td className="py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                            R$ {item.realizedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="py-3 text-right font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                                                            R$ {item.pendingProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="py-3 text-center">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                item.status === 'paid'
                                                                    ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                                                    : item.status === 'late'
                                                                        ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'
                                                                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                                                            }`}>
                                                                {item.status === 'paid' ? 'Quitado' : item.status === 'late' ? 'Atrasado' : 'Em dia'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={8} className="py-8 text-center text-xs text-gray-400">
                                                        Nenhum contrato encontrado para este filtro.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        {filteredClientProfitList.length > 0 && (
                                            <tfoot>
                                                <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 font-black text-sm">
                                                    <td className="py-3.5 pl-2 text-gray-900 dark:text-white" colSpan={2}>
                                                        TOTAL ({filteredClientProfitList.length} contratos)
                                                    </td>
                                                    <td className="py-3.5 text-right text-gray-900 dark:text-white font-mono">
                                                        R$ {profitTotals.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-3.5 text-right text-gray-900 dark:text-white font-mono">
                                                        R$ {profitTotals.contractTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-3.5 text-right text-teal-600 dark:text-teal-400 font-mono">
                                                        R$ {profitTotals.expectedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-3.5 text-right text-emerald-600 dark:text-emerald-400 font-mono">
                                                        R$ {profitTotals.realizedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-3.5 text-right text-indigo-600 dark:text-indigo-400 font-mono">
                                                        R$ {profitTotals.pendingProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td></td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </section>
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
