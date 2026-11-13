import React, { useState, useEffect, useMemo } from 'react';
import { X, Copy, Check, MessageSquare, Calendar, ChevronLeft, ChevronRight, TrendingUp, AlertTriangle, Wallet, Users, Share2, Sparkles, Clock } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Loan } from '../types';
import { generateInstallments } from '../utils/loanUtils';
import { openWhatsApp } from '../utils/whatsappUtils';

interface ShareReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: 'daily' | 'general';
}

export const ShareReportModal: React.FC<ShareReportModalProps> = ({
    isOpen,
    onClose,
    initialTab = 'daily'
}) => {
    const [activeTab, setActiveTab] = useState<'daily' | 'general'>(initialTab);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [loans, setLoans] = useState<any[]>([]);
    const [amortizations, setAmortizations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [includeDetails, setIncludeDetails] = useState(true);

    useEffect(() => {
        if (isOpen) {
            fetchReportData();
            setSelectedDate(new Date());
            setCopied(false);
        }
    }, [isOpen]);

    const fetchReportData = async () => {
        setLoading(true);
        try {
            const [loansRes, amortRes] = await Promise.all([
                supabase
                    .from('loans')
                    .select(`
                        *,
                        client:clients (name, phone, avatar_url),
                        installment_fines (*)
                    `)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('loan_amortizations')
                    .select('*')
                    .order('created_at', { ascending: false })
            ]);

            if (loansRes.error) throw loansRes.error;
            setLoans(loansRes.data || []);
            setAmortizations(amortRes.data || []);
        } catch (err) {
            console.error('Error fetching report data:', err);
        } finally {
            setLoading(false);
        }
    };

    const isSameDay = (d1: Date, d2: Date) => {
        return (
            d1.getDate() === d2.getDate() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getFullYear() === d2.getFullYear()
        );
    };

    // --- CÁLCULOS DO RELATÓRIO DIÁRIO ---
    const dailyData = useMemo(() => {
        const targetZero = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        const dayInstallments: {
            loan: Loan;
            installment: any;
            clientName: string;
            status: 'paid' | 'pending' | 'late';
            value: number;
        }[] = [];

        loans.forEach(loan => {
            const insts = generateInstallments(loan, loan.installment_fines || []);
            insts.forEach(inst => {
                const instDateZero = new Date(inst.date.getFullYear(), inst.date.getMonth(), inst.date.getDate());
                if (instDateZero.getTime() === targetZero.getTime()) {
                    dayInstallments.push({
                        loan,
                        installment: inst,
                        clientName: loan.client?.name || 'Cliente',
                        status: inst.status === 'paid' ? 'paid' : (inst.status === 'late' ? 'late' : 'pending'),
                        value: inst.value
                    });
                }
            });
        });

        // Pagamentos do dia registrados em amortizações
        const dayAmortizations = amortizations.filter(a => {
            const pDate = new Date(a.payment_date || a.created_at);
            return isSameDay(pDate, selectedDate);
        });
        const totalAmortizedToday = dayAmortizations.reduce((acc, curr) => acc + (Number(curr.amount_paid) || 0), 0);

        const totalScheduled = dayInstallments.reduce((acc, curr) => acc + curr.value, 0);
        const countScheduled = dayInstallments.length;

        const paidList = dayInstallments.filter(i => i.status === 'paid');
        const pendingList = dayInstallments.filter(i => i.status !== 'paid');

        const totalPaidScheduled = paidList.reduce((acc, curr) => acc + curr.value, 0);
        const totalPendingScheduled = pendingList.reduce((acc, curr) => acc + curr.value, 0);

        // Se houve amortizações registradas hoje, podemos usá-las como referência real de entrada
        const totalReceived = Math.max(totalPaidScheduled, totalAmortizedToday);
        const effectiveness = totalScheduled > 0
            ? Math.min(100, (totalPaidScheduled / totalScheduled) * 100)
            : (totalReceived > 0 ? 100 : 0);

        return {
            totalScheduled,
            countScheduled,
            paidCount: paidList.length,
            pendingCount: pendingList.length,
            totalReceived,
            totalPendingScheduled,
            effectiveness,
            items: dayInstallments
        };
    }, [loans, amortizations, selectedDate]);

    // --- CÁLCULOS DO RELATÓRIO GERAL ---
    const generalData = useMemo(() => {
        let totalCapital = 0;
        let totalToReceive = 0;
        let activeInterest = 0;
        let lateAmount = 0;
        let lateContractsCount = 0;
        const activeClients = new Set<string>();
        const activeLoansList: any[] = [];

        loans.forEach(loan => {
            if (loan.status === 'paid') return;

            const amount = Number(loan.amount) || 0;
            const balance = Number(loan.balance) || 0;
            const installmentValue = Number(loan.installment_value) || 0;
            const count = Number(loan.installments) || 1;
            const totalDebt = installmentValue * count;

            let loanReceived = 0;
            if (loan.amount_paid !== undefined && loan.amount_paid !== null) {
                loanReceived = Number(loan.amount_paid);
            } else {
                loanReceived = totalDebt > 0 ? Math.max(0, totalDebt - balance) : Math.max(0, amount - balance);
                loanReceived += (Number(loan.total_interest_paid) || 0);
            }

            const contractTotal = totalDebt > 0 ? totalDebt : amount;
            totalCapital += amount;
            totalToReceive += (balance > 0 ? balance : Math.max(0, contractTotal - loanReceived));
            activeInterest += Math.max(0, contractTotal - amount);

            if (loan.client_id) activeClients.add(loan.client_id);

            const insts = generateInstallments(loan, loan.installment_fines || []);
            const hasLate = insts.some(i => i.status === 'late');
            const lateVal = insts.filter(i => i.status === 'late').reduce((s, i) => s + i.value, 0);

            if (hasLate || loan.status === 'late') {
                lateContractsCount++;
                lateAmount += lateVal;
            }

            activeLoansList.push({
                clientName: loan.client?.name || 'Cliente',
                amount,
                balance,
                frequency: loan.frequency || 'Mensal',
                installments: count,
                isLate: hasLate || loan.status === 'late'
            });
        });

        const portfolioYield = totalCapital > 0 ? (activeInterest / totalCapital) * 100 : 0;
        const defaultRate = totalToReceive > 0 ? (lateAmount / totalToReceive) * 100 : 0;

        return {
            activeClientsCount: activeClients.size,
            activeLoansCount: activeLoansList.length,
            totalCapital,
            totalToReceive,
            activeInterest,
            portfolioYield,
            lateAmount,
            lateContractsCount,
            defaultRate,
            activeLoansList
        };
    }, [loans]);

    // --- FORMATAÇÃO DO TEXTO PARA WHATSAPP ---
    const formattedDailyMessage = useMemo(() => {
        const dateStr = selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const weekday = selectedDate.toLocaleDateString('pt-BR', { weekday: 'long' });
        const capWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);

        let msg = `📊 *FECHAMENTO DIÁRIO - ${dateStr}*\n`;
        msg += `🗓️ _${capWeekday}_\n`;
        msg += `────────────────────────────\n`;
        msg += `🎯 *Cobranças previstas:* ${dailyData.countScheduled} (R$ ${dailyData.totalScheduled.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})\n`;
        msg += `✅ *Recebidas hoje:* ${dailyData.paidCount} (R$ ${dailyData.totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})\n`;
        msg += `⏳ *Pendentes:* ${dailyData.pendingCount} (R$ ${dailyData.totalPendingScheduled.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})\n`;
        msg += `📈 *Efetividade do Dia:* *${dailyData.effectiveness.toFixed(1)}%*\n`;

        if (includeDetails && dailyData.items.length > 0) {
            msg += `────────────────────────────\n`;
            msg += `*Detalhamento de Cobranças:*\n`;
            dailyData.items.forEach(item => {
                const icon = item.status === 'paid' ? '🟢' : (item.status === 'late' ? '🔴' : '🟡');
                const statusLabel = item.status === 'paid' ? 'Pago' : (item.status === 'late' ? 'Atrasado' : 'Pendente');
                msg += `${icon} *${item.clientName}*: R$ ${item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} _(${statusLabel})_\n`;
            });
        } else if (dailyData.items.length === 0) {
            msg += `────────────────────────────\n`;
            msg += `ℹ️ _Nenhuma parcela tinha vencimento previsto nesta data._\n`;
        }

        msg += `────────────────────────────\n`;
        msg += `🚀 *AgiCred* • _Gestão Inteligente de Carteira_`;
        return msg;
    }, [dailyData, selectedDate, includeDetails]);

    const formattedGeneralMessage = useMemo(() => {
        const todayStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

        let msg = `📋 *RESUMO GERAL DA CARTEIRA*\n`;
        msg += `📅 *Posição em:* ${todayStr}\n`;
        msg += `────────────────────────────\n`;
        msg += `👥 *Clientes Ativos:* ${generalData.activeClientsCount}\n`;
        msg += `📄 *Contratos Ativos:* ${generalData.activeLoansCount}\n`;
        msg += `💼 *Capital na Rua:* R$ ${generalData.totalCapital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        msg += `📈 *Total a Receber:* R$ ${generalData.totalToReceive.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        msg += `💵 *Lucro Previsto (Juros):* R$ ${generalData.activeInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        msg += `📊 *Rentabilidade Média:* *${generalData.portfolioYield.toFixed(2)}%*\n`;
        msg += `⚠️ *Total em Atraso:* R$ ${generalData.lateAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;

        if (includeDetails && generalData.activeLoansList.length > 0) {
            msg += `────────────────────────────\n`;
            msg += `*Contratos em Aberto (${generalData.activeLoansList.length}):*\n`;
            generalData.activeLoansList.slice(0, 40).forEach(c => {
                const icon = c.isLate ? '🔴' : '🟢';
                const statusStr = c.isLate ? 'Atrasado' : 'Em dia';
                msg += `${icon} *${c.clientName}*: R$ ${c.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - ${c.frequency} _(${statusStr})_\n`;
            });
            if (generalData.activeLoansList.length > 40) {
                msg += `_... e mais ${generalData.activeLoansList.length - 40} contratos na carteira._\n`;
            }
        }

        msg += `────────────────────────────\n`;
        msg += `🚀 *AgiCred* • _Gestão Inteligente de Carteira_`;
        return msg;
    }, [generalData, includeDetails]);

    const activeMessage = activeTab === 'daily' ? formattedDailyMessage : formattedGeneralMessage;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(activeMessage);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            const textArea = document.createElement('textarea');
            textArea.value = activeMessage;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleShareWhatsApp = () => {
        openWhatsApp(undefined, activeMessage);
    };

    const changeDate = (days: number) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + days);
        setSelectedDate(d);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}></div>

            {/* Modal Box */}
            <div className="relative bg-white dark:bg-[#16161A] border border-gray-100 dark:border-white/10 rounded-3xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-gray-50/50 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                            <Share2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-gray-900 dark:text-white leading-tight">
                                Relatórios & Fechamento
                            </h3>
                            <p className="text-xs text-gray-400">
                                Copie ou compartilhe resumos formatados no WhatsApp
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-5 pt-3">
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-100 dark:bg-white/5 rounded-2xl">
                        <button
                            onClick={() => setActiveTab('daily')}
                            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                activeTab === 'daily'
                                    ? 'bg-white dark:bg-card-dark text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                        >
                            <Calendar className="w-4 h-4 text-emerald-500" />
                            Fechamento do Dia
                        </button>
                        <button
                            onClick={() => setActiveTab('general')}
                            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                activeTab === 'general'
                                    ? 'bg-white dark:bg-card-dark text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                        >
                            <TrendingUp className="w-4 h-4 text-blue-500" />
                            Posição da Carteira
                        </button>
                    </div>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 no-scrollbar">
                    {/* Controles do Tab Diário */}
                    {activeTab === 'daily' && (
                        <div className="space-y-3">
                            {/* Seletor de Data */}
                            <div className="flex items-center justify-between bg-gray-50 dark:bg-white/[0.03] p-2 rounded-2xl border border-gray-100 dark:border-white/5">
                                <button
                                    onClick={() => changeDate(-1)}
                                    className="p-1.5 rounded-xl hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 transition-colors"
                                    title="Dia anterior"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <div className="text-center">
                                    <span className="text-xs font-black text-gray-900 dark:text-white block">
                                        {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                    </span>
                                    <span className="text-[10px] text-gray-400 capitalize block">
                                        {isSameDay(selectedDate, new Date()) ? 'Hoje • ' : ''}
                                        {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long' })}
                                    </span>
                                </div>
                                <button
                                    onClick={() => changeDate(1)}
                                    className="p-1.5 rounded-xl hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 transition-colors"
                                    title="Próximo dia"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Mini KPIs */}
                            <div className="grid grid-cols-4 gap-2">
                                <div className="bg-gray-50 dark:bg-white/[0.03] p-2.5 rounded-xl border border-gray-100 dark:border-white/5 text-center">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Previsto</span>
                                    <span className="text-xs font-black text-gray-900 dark:text-white block mt-0.5">
                                        R$ {dailyData.totalScheduled.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                    </span>
                                    <span className="text-[8px] text-gray-400 font-semibold">{dailyData.countScheduled} cobranças</span>
                                </div>

                                <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-center">
                                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Recebido</span>
                                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 block mt-0.5">
                                        R$ {dailyData.totalReceived.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                    </span>
                                    <span className="text-[8px] text-emerald-600/70 dark:text-emerald-400/70 font-semibold">{dailyData.paidCount} pagas</span>
                                </div>

                                <div className="bg-amber-50/50 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/30 text-center">
                                    <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">Pendente</span>
                                    <span className="text-xs font-black text-amber-600 dark:text-amber-400 block mt-0.5">
                                        R$ {dailyData.totalPendingScheduled.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                    </span>
                                    <span className="text-[8px] text-amber-600/70 dark:text-amber-400/70 font-semibold">{dailyData.pendingCount} abertas</span>
                                </div>

                                <div className="bg-blue-50/50 dark:bg-blue-950/20 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/30 text-center">
                                    <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">Efetividade</span>
                                    <span className="text-xs font-black text-blue-600 dark:text-blue-400 block mt-0.5">
                                        {dailyData.effectiveness.toFixed(0)}%
                                    </span>
                                    <span className="text-[8px] text-blue-600/70 dark:text-blue-400/70 font-semibold">da meta</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Controles do Tab Geral */}
                    {activeTab === 'general' && (
                        <div className="grid grid-cols-4 gap-2">
                            <div className="bg-gray-50 dark:bg-white/[0.03] p-2.5 rounded-xl border border-gray-100 dark:border-white/5 text-center">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Clientes</span>
                                <span className="text-xs font-black text-gray-900 dark:text-white block mt-0.5">
                                    {generalData.activeClientsCount}
                                </span>
                                <span className="text-[8px] text-gray-400 font-semibold">{generalData.activeLoansCount} contratos</span>
                            </div>

                            <div className="bg-gray-50 dark:bg-white/[0.03] p-2.5 rounded-xl border border-gray-100 dark:border-white/5 text-center">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Capital Rua</span>
                                <span className="text-xs font-black text-gray-900 dark:text-white block mt-0.5">
                                    R$ {generalData.totalCapital.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                </span>
                                <span className="text-[8px] text-gray-400 font-semibold">emprestado</span>
                            </div>

                            <div className="bg-teal-50/50 dark:bg-teal-950/20 p-2.5 rounded-xl border border-teal-100 dark:border-teal-900/30 text-center">
                                <span className="text-[9px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block">A Receber</span>
                                <span className="text-xs font-black text-teal-600 dark:text-teal-400 block mt-0.5">
                                    R$ {generalData.totalToReceive.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                </span>
                                <span className="text-[8px] text-teal-600/70 dark:text-teal-400/70 font-semibold">total previsto</span>
                            </div>

                            <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-center">
                                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Rentabilidade</span>
                                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 block mt-0.5">
                                    {generalData.portfolioYield.toFixed(2)}%
                                </span>
                                <span className="text-[8px] text-emerald-600/70 dark:text-emerald-400/70 font-semibold">média carteira</span>
                            </div>
                        </div>
                    )}

                    {/* Toggle: incluir detalhamento */}
                    <div className="flex items-center justify-between px-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={includeDetails}
                                onChange={(e) => setIncludeDetails(e.target.checked)}
                                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                            />
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                Incluir lista de contratos/clientes na mensagem
                            </span>
                        </label>
                    </div>

                    {/* WhatsApp Preview Box */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5 text-emerald-500" /> Prévia da Mensagem (WhatsApp)
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono">
                                {activeMessage.length} caracteres
                            </span>
                        </div>
                        <div className="bg-[#EFEAE2] dark:bg-[#0C1317] p-3.5 rounded-2xl border border-[#D1D7DB] dark:border-[#222E35] font-mono text-[11px] leading-relaxed text-[#111B21] dark:text-[#E9EDEF] whitespace-pre-wrap max-h-56 overflow-y-auto no-scrollbar shadow-inner">
                            {activeMessage}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="px-5 py-4 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02] flex items-center gap-3">
                    <button
                        onClick={handleCopy}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold transition-all border shadow-sm active:scale-95 ${
                            copied
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700'
                                : 'bg-white dark:bg-card-dark text-gray-800 dark:text-white border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
                        }`}
                    >
                        {copied ? (
                            <>
                                <Check className="w-4 h-4 text-emerald-500" /> Copiado com Sucesso!
                            </>
                        ) : (
                            <>
                                <Copy className="w-4 h-4" /> Copiar Mensagem
                            </>
                        )}
                    </button>

                    <button
                        onClick={handleShareWhatsApp}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#25D366] hover:bg-[#20BD5A] text-white text-xs font-bold rounded-2xl transition-all shadow-md active:scale-95"
                    >
                        <MessageSquare className="w-4 h-4" fill="currentColor" />
                        Abrir no WhatsApp
                    </button>
                </div>
            </div>
        </div>
    );
};

