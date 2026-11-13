import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, MoreHorizontal, Check, Clock, Circle, Banknote, FileText, X, PlusCircle, AlertTriangle, Share2, Trash2, QrCode, Copy, Calendar, RefreshCw, Edit2, Plus, Wallet, TrendingDown, ChevronRight, HelpCircle, Info, Calculator, XCircle, Link2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { generatePixPayload } from '../utils/pixUtils';
import { openWhatsApp } from '../utils/whatsappUtils';
import { createPortalLink } from '../utils/portalUtils';
import { supabase } from '../supabaseClient';
import { Loan, Installment, InstallmentFine } from '../types';
import { generateInstallments } from '../utils/loanUtils';
import { processRecurringInterest } from '../utils/interestUtils';
import { Amortization } from './Amortization';
import { ReceiptModal } from '../components/ReceiptModal';
import { ExtractModal } from '../components/ExtractModal';

interface LoanDetailsProps {
    loanId: string | null;
    onBack: () => void;
    onNewLoan?: (data: any) => void;
}

export const LoanDetails: React.FC<LoanDetailsProps> = ({ loanId, onBack, onNewLoan }) => {
    const [loan, setLoan] = useState<Loan | null>(null);
    const [installmentsList, setInstallmentsList] = useState<Installment[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [showAllInstallments, setShowAllInstallments] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showSinglePaymentConfirmModal, setShowSinglePaymentConfirmModal] = useState(false);
    const [showMensalPaymentModal, setShowMensalPaymentModal] = useState(false);
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [receiptData, setReceiptData] = useState<any>(null);
    const [showReceiptImageModal, setShowReceiptImageModal] = useState(false);
    const [extractData, setExtractData] = useState<any>(null);
    const [showExtractImageModal, setShowExtractImageModal] = useState(false);
    const [showAVModal, setShowAVModal] = useState(false);
    const [showAVConfirmModal, setShowAVConfirmModal] = useState(false);
    const [avConfirmData, setAvConfirmData] = useState<{ paidCount: number, remainingCredit: number, paidAmount: number } | null>(null);
    const [showRenewConfirmModal, setShowRenewConfirmModal] = useState(false);
    const [renewConfirmData, setRenewConfirmData] = useState<{ amountToPay: number, nextDueDate: string, nextValue: number, type: 'full' | 'renew' } | null>(null);
    const [avAmount, setAvAmount] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [showChargeOptionsModal, setShowChargeOptionsModal] = useState(false);
    const [showPixModal, setShowPixModal] = useState(false);
    const [showPixTypeSelectionModal, setShowPixTypeSelectionModal] = useState(false);
    const [pixAmount, setPixAmount] = useState('');
    const [pixPayload, setPixPayload] = useState('');
    const [alertModal, setAlertModal] = useState<{
        open: boolean;
        title: string;
        message: string;
        onConfirm?: () => void;
        confirmText?: string;
    }>({ open: false, title: '', message: '' });

    const [showInterestBreakdownModal, setShowInterestBreakdownModal] = useState(false);

    // Fine State
    const [fines, setFines] = useState<InstallmentFine[]>([]);
    const [showFineModal, setShowFineModal] = useState(false);
    const [fineInstallment, setFineInstallment] = useState<Installment | null>(null);
    const [fineFixed, setFineFixed] = useState('');

    // Batch Payment State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedInstallments, setSelectedInstallments] = useState<number[]>([]);

    // Amortization State
    const [showAmortizationPage, setShowAmortizationPage] = useState(false);

    // Portal Link State
    const [showPortalLinkModal, setShowPortalLinkModal] = useState(false);
    const [portalLink, setPortalLink] = useState('');
    const [portalLinkLoading, setPortalLinkLoading] = useState(false);
    const [portalLinkCopied, setPortalLinkCopied] = useState(false);

    // Payment Request Alerts
    const [pendingPaymentRequests, setPendingPaymentRequests] = useState<any[]>([]);
    const [showPaymentRequestModal, setShowPaymentRequestModal] = useState(false);
    const [selectedPaymentRequest, setSelectedPaymentRequest] = useState<any>(null);
    const [processingRequest, setProcessingRequest] = useState(false);

    const handleConfirmAmortization = async (amountPaid: number, preview: any) => {
        if (!loan) return;

        setProcessing(true);
        try {
            const { breakdown, result } = preview;

            // 1. Insert Amortization Record
            const { error: amortError } = await supabase
                .from('loan_amortizations')
                .insert({
                    loan_id: loan.id,
                    amount_paid: amountPaid,
                    interest_paid: breakdown.proRata + breakdown.pastInterest + preview.distribution.contractInterestPaid,
                    principal_paid: preview.distribution.principalPaid,
                    fine_paid: breakdown.fines,
                    previous_balance: loan.balance,
                    new_balance: result.newBalance
                });

            if (amortError) throw amortError;

            // 2. Update Loan
            // result.newDueDate is a formatted string "DD MMM YYYY" which causes Invalid Date if passed to Date constructor directly in some environments.
            // We will rely on the recalculated nextDueISO below.

            const today = new Date();
            const nextDue = new Date(today);
            if (loan.frequency === 'Quinzenal') {
                nextDue.setDate(today.getDate() + 15);
            } else {
                nextDue.setMonth(today.getMonth() + 1);
            }
            const nextDueISO = nextDue.toISOString().split('T')[0];

            // Calculate new totals for Dashboard accuracy
            const currentTotalInterestPaid = Number(loan.total_interest_paid) || 0;
            const currentAmountPaid = Number(loan.amount_paid) || 0;

            // Interest component includes: Past Interest + Pro-Rata + Fines 
            // Contract Interest isn't counted in total_interest_paid (extra profit) because it's part of the base loan structure
            const interestComponentPaid = preview.distribution.pastInterestPaid + preview.distribution.proRataPaid + preview.distribution.finesPaid;

            const newTotalInterestPaid = currentTotalInterestPaid + interestComponentPaid;
            const newAmountPaid = currentAmountPaid + amountPaid;

            const isPaidOff = result.newBalance <= 0.01;

            const { error: loanError } = await supabase
                .from('loans')
                .update({
                    balance: result.newBalance,
                    amount: Math.max(0, Number(loan.amount) - preview.distribution.principalPaid), // Update principal
                    due_date: isPaidOff ? loan.due_date : nextDueISO,
                    status: isPaidOff ? 'paid' : 'active',
                    total_interest_paid: newTotalInterestPaid,
                    amount_paid: newAmountPaid
                })
                .eq('id', loan.id);

            if (loanError) throw loanError;

            // 3. Clear Fines if paid
            if (breakdown.fines > 0) {
                const installmentsWithFines = installmentsList.filter(i => i.fine);
                for (const inst of installmentsWithFines) {
                    if (inst.fine) {
                        await supabase.from('installment_fines').delete().eq('id', inst.fine.id);
                    }
                }
            }

            setShowAmortizationPage(false);
            onBack(); // Go back to refresh or reload
        } catch (error) {
            console.error('Error amortizing:', error);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: 'Erro ao realizar abatimento.'
            });
        } finally {
            setProcessing(false);
        }
    };
    const [confirmationModal, setConfirmationModal] = useState<{
        open: boolean;
        title: string;
        message: string;
        action: () => void;
    }>({ open: false, title: '', message: '', action: () => { } });

    const [selectedInstallmentForDetail, setSelectedInstallmentForDetail] = useState<Installment | null>(null);

    const getStoredPaidDates = (currentLoanId: string): Record<number, string> => {
        try {
            const raw = localStorage.getItem(`agicred_paid_dates_${currentLoanId}`);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    };

    const savePaymentDates = (currentLoanId: string, installmentNumbers: number[], specificDateISO?: string) => {
        try {
            const existing = getStoredPaidDates(currentLoanId);
            const nowISO = specificDateISO || new Date().toISOString();
            installmentNumbers.forEach(num => {
                existing[num] = nowISO;
            });
            localStorage.setItem(`agicred_paid_dates_${currentLoanId}`, JSON.stringify(existing));
        } catch (e) {
            console.error("Erro ao salvar datas reais de pagamento no localStorage:", e);
        }
    };

    const [userSettings, setUserSettings] = useState<{
        pix_key: string;
        pix_beneficiary: string;
        city: string;
        pix_keys?: any[];
    } | null>(null);
    const [selectedPixKeyId, setSelectedPixKeyId] = useState<string>('');

    useEffect(() => {
        if (loanId) {
            fetchLoanData();
            fetchUserSettings();
            fetchPendingPaymentRequests();
        }
    }, [loanId]);

    const fetchPendingPaymentRequests = async () => {
        if (!loanId) return;
        try {
            const { data } = await supabase
                .from('client_payment_requests')
                .select('*')
                .eq('loan_id', loanId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });
            setPendingPaymentRequests(data || []);
        } catch (e) { console.error(e); }
    };

    const handleConfirmPaymentRequest = async (request: any) => {
        if (!loan) return;
        setProcessingRequest(true);
        try {
            // 1. Mark the request as confirmed
            const confirmedDateISO = new Date().toISOString();
            await supabase
                .from('client_payment_requests')
                .update({ status: 'confirmed', resolved_at: confirmedDateISO })
                .eq('id', request.id);

            // 2. Process the actual payment on the loan (same logic as executeBatchPayment)
            const instNumber = request.installment_number;
            savePaymentDates(loan.id, [instNumber], confirmedDateISO);
            const targetInst = installmentsList.find(i => i.number === instNumber);
            
            if (targetInst) {
                const paidValue = targetInst.value;
                const baseValue = targetInst.originalValue || paidValue;
                const extraProfit = Math.max(0, paidValue - baseValue);

                const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
                let newBalance = Number(loan.balance) - baseValue;
                if (newBalance < 0.01) newBalance = 0;

                const newProgress = totalDebt > 0 
                    ? Math.max(0, Math.min(100, Math.round(((totalDebt - newBalance) / totalDebt) * 100)))
                    : 100;
                const newStatus = newBalance === 0 ? 'paid' : 'active';

                const currentTotalInterestPaid = Number(loan.total_interest_paid) || 0;
                const currentAmountPaid = loan.amount_paid !== undefined && loan.amount_paid !== null
                    ? Number(loan.amount_paid)
                    : Math.max(0, totalDebt - Number(loan.balance)) + currentTotalInterestPaid;

                await supabase
                    .from('loans')
                    .update({
                        balance: newBalance,
                        progress: newProgress,
                        status: newStatus,
                        amount_paid: currentAmountPaid + paidValue,
                        total_interest_paid: currentTotalInterestPaid + extraProfit
                    })
                    .eq('id', loan.id);

                // Delete fine for this installment if exists
                if (targetInst.fine) {
                    await supabase.from('installment_fines').delete().eq('id', targetInst.fine.id);
                }
            }

            // 3. Remove from pending list, close modal, refresh loan data
            setPendingPaymentRequests(prev => prev.filter(r => r.id !== request.id));
            setShowPaymentRequestModal(false);
            setSelectedPaymentRequest(null);
            await fetchLoanData();

            setAlertModal({
                open: true,
                title: 'Pagamento Confirmado ✓',
                message: `Parcela #${String(request.installment_number).padStart(2, '0')} no valor de R$ ${Number(request.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} foi confirmada e registrada com sucesso.`,
            });
        } catch (e) { 
            console.error(e);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: 'Erro ao processar pagamento. Tente novamente.',
            });
        }
        finally { setProcessingRequest(false); }
    };

    const handleRejectPaymentRequest = async (request: any) => {
        setProcessingRequest(true);
        try {
            await supabase
                .from('client_payment_requests')
                .update({ status: 'rejected', resolved_at: new Date().toISOString() })
                .eq('id', request.id);
            
            setPendingPaymentRequests(prev => prev.filter(r => r.id !== request.id));
            setShowPaymentRequestModal(false);
            setSelectedPaymentRequest(null);
        } catch (e) { console.error(e); }
        finally { setProcessingRequest(false); }
    };

    const fetchUserSettings = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            let userPixKeys: any[] = [];
            try {
                const { data: dbKeys } = await supabase
                    .from('pix_keys')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('is_default', { ascending: false });
                if (dbKeys && dbKeys.length > 0) userPixKeys = dbKeys;
            } catch (e) { /* ignore */ }

            const { data } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (data) {
                if (userPixKeys.length === 0 && data.pix_keys) {
                    userPixKeys = data.pix_keys;
                }
                setUserSettings({
                    ...data,
                    pix_keys: userPixKeys
                });

                if (userPixKeys.length > 0) {
                    const def = userPixKeys.find((k: any) => k.is_default) || userPixKeys[0];
                    setSelectedPixKeyId(def.id);
                }
            }
        }
    };

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

    const handleBatchPayment = () => {
        if (!loan || selectedInstallments.length === 0) return;

        // 1. Obter todas as parcelas pendentes (não pagas) em ordem cronológica
        const pendingInstallments = installmentsList.filter(i => i.status !== 'paid');
        if (pendingInstallments.length === 0) return;

        const count = selectedInstallments.length;

        // 2. As N primeiras parcelas pendentes que DEVEM ser pagas prioritariamente
        const targetInstallments = pendingInstallments.slice(0, count);
        const targetNumbers = targetInstallments.map(i => i.number);

        // 3. Verificar se o usuário pulou alguma parcela mais antiga
        const selectedSorted = [...selectedInstallments].sort((a, b) => a - b);
        const targetSorted = [...targetNumbers].sort((a, b) => a - b);
        const hasSkipped = selectedSorted.some((num, idx) => num !== targetSorted[idx]);

        // 4. Calcular o total a pagar da seleção reorganizada
        const totalPaidNow = targetInstallments.reduce((acc, curr) => acc + curr.value, 0);

        if (hasSkipped) {
            // Atualiza a seleção visualmente para as parcelas corretas
            setSelectedInstallments(targetNumbers);

            // Identificar quais parcelas mais antigas tinham ficado para trás
            const skippedNumbers = targetNumbers.filter(n => !selectedInstallments.includes(n));
            const skippedStr = skippedNumbers.map(n => `#${String(n).padStart(2, '0')}`).join(', ');

            const rangeStr = targetNumbers.length === 1
                ? `Parcela #${String(targetNumbers[0]).padStart(2, '0')}`
                : `Parcelas #${String(targetNumbers[0]).padStart(2, '0')} a #${String(targetNumbers[targetNumbers.length - 1]).padStart(2, '0')}`;

            setConfirmationModal({
                open: true,
                title: 'Seleção Reorganizada',
                message: `As parcelas mais antigas têm prioridade obrigatória de quitação.\n\nComo a(s) parcela(s) ${skippedStr} não haviam sido marcadas, sua seleção de ${count} parcela(s) foi reorganizada para quitar em ordem cronológica (${rangeStr}).\n\nValor Total: R$ ${totalPaidNow.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\nDeseja confirmar o pagamento?`,
                action: () => executeBatchPayment(targetNumbers)
            });
        } else {
            const rangeStr = targetNumbers.length === 1
                ? `parcela #${String(targetNumbers[0]).padStart(2, '0')}`
                : `${count} parcelas (#${String(targetNumbers[0]).padStart(2, '0')} a #${String(targetNumbers[targetNumbers.length - 1]).padStart(2, '0')})`;

            setConfirmationModal({
                open: true,
                title: 'Confirmar Pagamento em Lote',
                message: `Confirma o pagamento de ${rangeStr}?\n\nValor Total: R$ ${totalPaidNow.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                action: () => executeBatchPayment(targetNumbers)
            });
        }
    };

    const executeBatchPayment = async (targetNumbers?: number[]) => {
        if (!loan) return;
        setConfirmationModal(prev => ({ ...prev, open: false }));
        setProcessing(true);
        try {
            const numbersToPay = targetNumbers && targetNumbers.length > 0 ? targetNumbers : selectedInstallments;
            if (numbersToPay.length === 0) return;

            savePaymentDates(loan.id, numbersToPay);

            const selectedInsts = installmentsList.filter(i => numbersToPay.includes(i.number));
            const totalPaidNow = selectedInsts.reduce((acc, curr) => acc + curr.value, 0);
            const baseValueToAbate = selectedInsts.reduce((acc, curr) => acc + curr.originalValue, 0);
            const extraProfit = Math.max(0, totalPaidNow - baseValueToAbate);

            const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);

            let newBalance = Number(loan.balance) - baseValueToAbate;
            if (newBalance < 0.01) newBalance = 0;

            const newProgress = Math.max(0, Math.min(100, Math.round(((totalDebt - newBalance) / totalDebt) * 100)));
            const newStatus = newBalance === 0 ? 'paid' : 'active';

            const currentTotalInterestPaid = Number(loan.total_interest_paid) || 0;
            const currentAmountPaid = loan.amount_paid !== undefined && loan.amount_paid !== null
                ? Number(loan.amount_paid)
                : Math.max(0, totalDebt - Number(loan.balance)) + currentTotalInterestPaid;

            const { error } = await supabase
                .from('loans')
                .update({
                    balance: newBalance,
                    progress: newProgress,
                    status: newStatus,
                    amount_paid: currentAmountPaid + totalPaidNow,
                    total_interest_paid: currentTotalInterestPaid + extraProfit
                })
                .eq('id', loan.id);

            if (error) throw error;

            // Delete fines for these installments
            for (const inst of selectedInsts) {
                if (inst.fine) {
                    await supabase.from('installment_fines').delete().eq('id', inst.fine.id);
                }
            }

            setIsSelectionMode(false);
            setSelectedInstallments([]);
            await fetchLoanData();

        } catch (error) {
            console.error(error);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: 'Erro ao registrar pagamento em lote.'
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleAVPayment = () => {
        if (!loan || !avAmount) return;

        const avRequestedAmount = Number(avAmount.replace(',', '.'));
        if (isNaN(avRequestedAmount) || avRequestedAmount <= 0) {
            setAlertModal({
                open: true,
                title: 'Valor Inválido',
                message: 'O valor inserido é inválido.'
            });
            return;
        }

        const currentCredit = Number(loan.client?.credit_balance) || 0;
        let totalAvailable = avRequestedAmount + currentCredit;

        // Filter unpaid installments and sort by date (number)
        const unpaidInstallments = installmentsList
            .filter(i => i.status !== 'paid')
            .sort((a, b) => a.number - b.number);

        let paidAmount = 0;
        let avPaidCount = 0;

        // Calculate how many installments can be paid
        for (const inst of unpaidInstallments) {
            // Use a small epsilon for float comparison to avoid issues like 100.00000000001 > 100
            if (totalAvailable >= inst.value - 0.01) {
                totalAvailable -= inst.value;
                paidAmount += inst.value;
                avPaidCount++;
            } else {
                break;
            }
        }

        // Bloqueio conforme solicitado: Não permitir excedente que vira crédito se o empréstimo for quitado
        if (avPaidCount === unpaidInstallments.length && totalAvailable > 0.01) {
            setAlertModal({
                open: true,
                title: "Valor Excedente",
                message: "O valor inserido excede o necessário para quitar o empréstimo. Não é possível gerar crédito excedente em uma quitação total."
            });
            return;
        }

        setAvConfirmData({
            paidCount: avPaidCount,
            remainingCredit: totalAvailable,
            paidAmount: paidAmount
        });
        setShowAVConfirmModal(true);
    };
    const executeAVPayment = async (paidAmount: number, newCreditBalance: number) => {
        if (!loan) return;
        setShowAVConfirmModal(false);
        setAvConfirmData(null);
        setProcessing(true);

        try {
            // Calculate base amount to abate from balance (only original installment values)
            const unpaidInstallments = installmentsList
                .filter(i => i.status !== 'paid')
                .sort((a, b) => a.number - b.number);

            let tempTotal = paidAmount;
            let baseValueToAbate = 0;
            const paidInsts = [];

            for (const inst of unpaidInstallments) {
                if (tempTotal >= inst.value - 0.01) {
                    tempTotal -= inst.value;
                    baseValueToAbate += inst.originalValue;
                    paidInsts.push(inst);
                } else {
                    break;
                }
            }

            const extraProfit = Math.max(0, paidAmount - baseValueToAbate);
            savePaymentDates(loan.id, paidInsts.map(i => i.number));
            const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);

            let newBalance = Number(loan.balance) - baseValueToAbate;
            if (newBalance < 0.01) newBalance = 0;

            const newProgress = Math.max(0, Math.min(100, Math.round(((totalDebt - newBalance) / totalDebt) * 100)));
            const newStatus = newBalance === 0 ? 'paid' : 'active';

            const currentTotalInterestPaid = Number(loan.total_interest_paid) || 0;
            const currentAmountPaid = loan.amount_paid !== undefined && loan.amount_paid !== null
                ? Number(loan.amount_paid)
                : Math.max(0, totalDebt - Number(loan.balance)) + currentTotalInterestPaid;

            const { error: loanError } = await supabase
                .from('loans')
                .update({
                    balance: newBalance,
                    progress: newProgress,
                    status: newStatus,
                    amount_paid: currentAmountPaid + paidAmount,
                    total_interest_paid: currentTotalInterestPaid + extraProfit
                })
                .eq('id', loan.id);

            if (loanError) throw loanError;

            // Delete fines
            for (const inst of paidInsts) {
                if (inst.fine) {
                    await supabase.from('installment_fines').delete().eq('id', inst.fine.id);
                }
            }

            // Update Client Credit Balance
            const { error: clientError } = await supabase
                .from('clients')
                .update({ credit_balance: newCreditBalance })
                .eq('id', loan.client_id);

            if (clientError) throw clientError;

            setShowAVModal(false);
            setAvAmount('');
            await fetchLoanData();

        } catch (error) {
            console.error(error);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: 'Erro ao processar pagamento AV.'
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleCharge = () => {
        if (!loan || !loan.client?.phone) {
            setAlertModal({
                open: true,
                title: "Telefone não cadastrado",
                message: "Este cliente não possui um número de telefone cadastrado para cobrança."
            });
            return;
        }

        const overdueInstallments = installmentsList.filter(i => i.status === 'late');
        const totalOverdue = overdueInstallments.reduce((acc, curr) => acc + curr.value, 0);

        if (totalOverdue <= 0) {
            setAlertModal({
                open: true,
                title: "Cobrança não vencida",
                message: "Esta cobrança não está vencida.",
                confirmText: "Cobrar mesmo assim",
                onConfirm: () => {
                    setAlertModal(prev => ({ ...prev, open: false }));
                    setShowChargeOptionsModal(true);
                }
            });
            return;
        }

        setShowChargeOptionsModal(true);
    };

    const handleWhatsAppCharge = () => {
        if (!loan || !loan.client?.phone) return;

        const overdueInstallments = installmentsList.filter(i => i.status === 'late');

        let message = '';
        if (overdueInstallments.length > 0) {
            const nome = loan.client.name;
            const contrato = loan.id.substring(0, 6);

            if (overdueInstallments.length === 1) {
                const firstUnpaid = overdueInstallments[0];
                const parcela = firstUnpaid.number;
                const valor = firstUnpaid.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const data = (firstUnpaid.originalDate || firstUnpaid.date).toLocaleDateString('pt-BR');

                const extras = [];
                if (firstUnpaid.accumulatedInterest && firstUnpaid.accumulatedInterest > 0.01) {
                    extras.push(`R$ ${firstUnpaid.accumulatedInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de juros por atraso`);
                }
                if (firstUnpaid.fine) {
                    extras.push(`R$ ${firstUnpaid.fine.fine_value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de multa manual`);
                }

                const infoAdicional = extras.length > 0 ? ` (incluindo ${extras.join(' e ')})` : '';

                message = `Olá, ${nome},\n\nConforme consta em nosso sistema, identificamos a seguinte parcela em aberto:\n\nParcela nº: ${parcela}\n\nValor: R$ ${valor}${infoAdicional}\n\nContrato: ${contrato}\n\nVencimento: ${data}\n\nSolicitamos, por gentileza, a regularização do pagamento para evitar a incidência de encargos adicionais.\n\nCaso o pagamento já tenha sido efetuado, pedimos a gentileza de desconsiderar esta mensagem.`;
            } else {
                const totalValue = overdueInstallments.reduce((acc, curr) => acc + curr.value, 0);
                const valorTotalFormatado = totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const parcelasStr = overdueInstallments.map(i => i.number).join(', ');

                let detalhesParcelas = '';
                overdueInstallments.forEach(i => {
                    const data = (i.originalDate || i.date).toLocaleDateString('pt-BR');
                    const valor = i.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                    const extras = [];
                    if (i.accumulatedInterest && i.accumulatedInterest > 0.01) {
                        extras.push(`R$ ${i.accumulatedInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de juros`);
                    }
                    if (i.fine) {
                        extras.push(`R$ ${i.fine.fine_value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de multa`);
                    }
                    const infoAdicional = extras.length > 0 ? ` (inclui ${extras.join(' e ')})` : '';

                    detalhesParcelas += `- Parcela ${i.number}: R$ ${valor} (Vencimento: ${data})${infoAdicional}\n`;
                });

                message = `Olá, ${nome}.\n\nConstam em nosso sistema ${overdueInstallments.length} parcelas em atraso (nº ${parcelasStr}), totalizando R$ ${valorTotalFormatado}, referentes ao contrato ${contrato}.\n\nDetalhes:\n${detalhesParcelas}\nPedimos a regularização para evitar encargos adicionais.\n\nCaso já tenha efetuado o pagamento, favor desconsiderar esta mensagem.`;
            }
        } else {
            const firstUnpaid = installmentsList.find(i => i.status !== 'paid');
            if (firstUnpaid) {
                const nome = loan.client.name;
                const parcela = firstUnpaid.number;
                const valor = firstUnpaid.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const contrato = loan.id.substring(0, 6);
                const data = (firstUnpaid.originalDate || firstUnpaid.date).toLocaleDateString('pt-BR');

                message = `Olá, ${nome}.\n\nLembramos que a parcela nº ${parcela} no valor de R$ ${valor}, referente ao contrato ${contrato}, vence em ${data}.\n\nCaso já tenha efetuado o pagamento, favor desconsiderar esta mensagem.`;
            } else {
                message = `Olá, ${loan.client.name}.\n\nEstamos entrando em contato referente ao seu contrato ${loan.id.substring(0, 6)}.`;
            }
        }

        openWhatsApp(loan.client.phone, message);
        setShowChargeOptionsModal(false);
    };

    const handlePixCharge = () => {
        if (!userSettings?.pix_key) {
            setAlertModal({
                open: true,
                title: 'Configuração Necessária',
                message: 'Você precisa configurar sua chave PIX no perfil antes de usar esta função.'
            });
            return;
        }
        setShowChargeOptionsModal(false);

        if (loan?.frequency === 'Mensal') {
            setShowPixTypeSelectionModal(true);
        } else {
            setShowPixModal(true);

            // Pre-fill with overdue amount if any
            const overdueInstallments = installmentsList.filter(i => i.status === 'late');
            const totalOverdue = overdueInstallments.reduce((acc, curr) => acc + curr.value, 0);
            if (totalOverdue > 0) {
                setPixAmount(totalOverdue.toFixed(2));
                generatePix(totalOverdue.toFixed(2));
            } else {
                setPixAmount('');
                setPixPayload('');
            }
        }
    };

    const handleSelectPixType = (type: 'full' | 'renew' | 'manual') => {
        if (!loan) return;
        setShowPixTypeSelectionModal(false);
        setShowPixModal(true);

        if (type === 'manual') {
            setPixAmount('');
            setPixPayload('');
            return;
        }

        let amount = 0;
        if (type === 'full') {
            amount = Number(loan.balance);
        } else if (type === 'renew') {
            const principal = Number(loan.amount);
            amount = principal * (Number(loan.interest_rate) / 100);
        }

        setPixAmount(amount.toFixed(2));
        generatePix(amount.toFixed(2));
    };

    const generatePix = (amountStr: string, customKey?: string, customBeneficiary?: string) => {
        const chosenItem = selectedPixKeyId && userSettings?.pix_keys
            ? userSettings.pix_keys.find(k => k.id === selectedPixKeyId)
            : null;

        const keyToUse = customKey || chosenItem?.pix_key || chosenItem?.key || userSettings?.pix_key;
        if (!keyToUse) return;

        const beneficiaryToUse = customBeneficiary || chosenItem?.holder_name || chosenItem?.beneficiary || userSettings?.pix_beneficiary || 'Recebedor';

        const amount = parseFloat(amountStr.replace(',', '.'));
        if (isNaN(amount) || amount <= 0) {
            setPixPayload('');
            return;
        }

        const payload = generatePixPayload(
            keyToUse,
            beneficiaryToUse,
            userSettings?.city || 'Cidade',
            amount,
            loan?.id ? loan.id.replace(/-/g, '').substring(0, 25) : '***'
        );
        setPixPayload(payload);
    };

    const handleDeleteLoan = async () => {
        if (!deletePassword) {
            setAlertModal({
                open: true,
                title: 'Senha Necessária',
                message: 'Por favor, informe sua senha.'
            });
            return;
        }

        setProcessing(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || !user.email) throw new Error("Usuário não autenticado");

            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: deletePassword
            });

            if (signInError) {
                setAlertModal({
                    open: true,
                    title: 'Senha Incorreta',
                    message: 'A senha informada está incorreta.'
                });
                setProcessing(false);
                return;
            }

            const { error: deleteError } = await supabase
                .from('loans')
                .delete()
                .eq('id', loanId);

            if (deleteError) throw deleteError;

            setAlertModal({
                open: true,
                title: 'Sucesso',
                message: 'Empréstimo excluído com sucesso.'
            });
            onBack();
        } catch (error) {
            console.error(error);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: 'Erro ao excluir empréstimo.'
            });
        } finally {
            setProcessing(false);
            setShowDeleteModal(false);
            setDeletePassword('');
        }
    };

    const fetchLoanData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('loans')
                .select('*, client:clients(name, credit_balance, phone)')
                .eq('id', loanId)
                .single();

            if (error) throw error;

            // Process recurring interest for this loan
            const updated = await processRecurringInterest([data]);

            let finalData = data;
            if (updated) {
                const { data: freshData } = await supabase
                    .from('loans')
                    .select('*, client:clients(name, credit_balance, phone)')
                    .eq('id', loanId)
                    .single();
                finalData = freshData;
            }

            // Fetch Fines
            const { data: finesData } = await supabase
                .from('installment_fines')
                .select('*')
                .eq('loan_id', loanId);

            const finesList = finesData || [];
            setFines(finesList);

            setLoan(finalData);
            const list = generateInstallments(finalData, finesList);

            // Fetch confirmed client payment requests to recover exact confirmed payment timestamps
            let confirmedRequests: any[] = [];
            try {
                const { data: reqs } = await supabase
                    .from('client_payment_requests')
                    .select('installment_number, resolved_at, created_at')
                    .eq('loan_id', loanId)
                    .eq('status', 'confirmed');
                if (reqs) confirmedRequests = reqs;
            } catch (e) { /* ignore */ }

            const storedDates = getStoredPaidDates(loanId);
            const mergedDates: Record<number, string> = { ...storedDates };

            confirmedRequests.forEach((req: any) => {
                if (req.installment_number && !mergedDates[req.installment_number]) {
                    mergedDates[req.installment_number] = req.resolved_at || req.created_at;
                }
            });

            const today = new Date();
            const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());

            const enrichedList = list.map(inst => {
                if (inst.status === 'paid') {
                    const savedDateStr = mergedDates[inst.number];
                    let paidDate: Date;
                    const dueZero = new Date(inst.date.getFullYear(), inst.date.getMonth(), inst.date.getDate());

                    if (savedDateStr) {
                        paidDate = new Date(savedDateStr);
                    } else if (dueZero.getTime() > todayZero.getTime()) {
                        // PARCELA ANTECIPADA: Se a data de vencimento está no futuro (ex: dia 16) e já consta como paga,
                        // a quitação foi feita na data de hoje (ou no momento em que foi baixada)
                        paidDate = today;
                    } else {
                        // Parcela no passado ou hoje
                        paidDate = new Date(inst.date);
                    }

                    return {
                        ...inst,
                        paidAt: paidDate
                    };
                }
                return inst;
            });

            setInstallmentsList(enrichedList);
        } catch (error) {
            console.error("Error fetching loan details", error);
        } finally {
            setLoading(false);
        }
    };



    const handleSaveFine = async () => {
        if (!loan || !fineInstallment) return;

        setProcessing(true);
        try {
            let fineValue = 0;
            const fineType: 'percent' | 'fixed' = 'fixed';

            if (fineFixed) {
                const fixed = parseFloat(fineFixed.replace(',', '.'));
                if (isNaN(fixed) || fixed <= 0) {
                    setAlertModal({
                        open: true,
                        title: 'Valor Inválido',
                        message: 'Falta informar ou o valor da multa é inválido.'
                    });
                    setProcessing(false);
                    return;
                }
                fineValue = fixed;
            } else {
                setAlertModal({
                    open: true,
                    title: 'Informe a Multa',
                    message: 'É necessário informar o valor da multa.'
                });
                setProcessing(false);
                return;
            }

            if (fineInstallment.status !== 'late' && !fineInstallment.fine) {
                setAlertModal({
                    open: true,
                    title: 'Operação Inválida',
                    message: 'Só é possível aplicar multa em parcelas em atraso.'
                });
                setProcessing(false);
                return;
            }

            if (fineInstallment.fine) {
                // Update existing fine
                const { error } = await supabase
                    .from('installment_fines')
                    .update({
                        fine_value: fineValue
                    })
                    .eq('loan_id', loan.id)
                    .eq('installment_number', fineInstallment.number);

                if (error) throw error;
            } else {
                // Insert new fine
                const { error } = await supabase
                    .from('installment_fines')
                    .insert({
                        loan_id: loan.id,
                        installment_number: fineInstallment.number,
                        fine_value: fineValue,
                        fine_type: fineType
                    });

                if (error) throw error;
            }

            setShowFineModal(false);
            setFineFixed('');
            setFineInstallment(null);
            await fetchLoanData();

        } catch (error) {
            console.error("Error saving fine", error);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: 'Erro ao salvar multa.'
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleRemoveFine = () => {
        if (!loan || !fineInstallment) return;

        setAlertModal({
            open: true,
            title: 'Remover Multa',
            message: 'Tem certeza que deseja remover a multa desta parcela?',
            confirmText: 'Sim, remover',
            onConfirm: executeRemoveFine
        });
    };

    const executeRemoveFine = async () => {
        setAlertModal(prev => ({ ...prev, open: false }));
        if (!loan || !fineInstallment) return;

        setProcessing(true);
        try {
            const { error } = await supabase
                .from('installment_fines')
                .delete()
                .eq('loan_id', loan.id)
                .eq('installment_number', fineInstallment.number);

            if (error) throw error;

            setShowFineModal(false);
            setFineFixed('');
            setFineInstallment(null);
            await fetchLoanData();
        } catch (error) {
            console.error("Error removing fine:", error);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: 'Erro ao remover multa.'
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleConfirmPayment = async () => {
        if (!loan || loan.balance <= 0) return;

        setProcessing(true);
        try {
            // Find the first unpaid installment to check for fines/late interest
            const firstUnpaid = installmentsList.find(i => i.status !== 'paid');
            if (!firstUnpaid) throw new Error("Nenhuma parcela pendente encontrada.");

            savePaymentDates(loan.id, [firstUnpaid.number]);

            const installmentBaseValue = loan.installment_value || (loan.amount / (loan.installments || 1));
            const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);

            // Valor total pago nesta transação (Parcela + Juros de Atraso + Multas)
            const totalPaidNow = firstUnpaid.value;
            const extraProfit = Math.max(0, totalPaidNow - installmentBaseValue);

            let newBalance = Number(loan.balance) - Number(installmentBaseValue);
            if (newBalance < 0.01) newBalance = 0;

            const newProgress = Math.max(0, Math.min(100, Math.round(((totalDebt - newBalance) / totalDebt) * 100)));
            const newStatus = newBalance === 0 ? 'paid' : 'active';

            const currentTotalInterestPaid = Number(loan.total_interest_paid) || 0;
            const currentAmountPaid = loan.amount_paid !== undefined && loan.amount_paid !== null
                ? Number(loan.amount_paid)
                : Math.max(0, totalDebt - Number(loan.balance)) + currentTotalInterestPaid;

            const { error } = await supabase
                .from('loans')
                .update({
                    balance: newBalance,
                    progress: newProgress,
                    status: newStatus,
                    amount_paid: currentAmountPaid + totalPaidNow,
                    total_interest_paid: currentTotalInterestPaid + extraProfit
                })
                .eq('id', loan.id);

            if (error) throw error;

            // Delete fine if paid
            if (firstUnpaid.fine) {
                await supabase
                    .from('installment_fines')
                    .delete()
                    .eq('id', firstUnpaid.fine.id);
            }

            setShowSinglePaymentConfirmModal(false);
            await fetchLoanData();

        } catch (error) {
            console.error(error);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: 'Erro ao registrar pagamento.'
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleMensalPayment = (type: 'full' | 'renew') => {
        if (!loan) return;

        const totalFines = fines.reduce((acc, curr) => acc + curr.fine_value, 0);

        if (type === 'renew') {
            // Calculate renewal details for the message
            let currentDue: Date;
            if (loan.due_date) {
                const [y, m, d] = loan.due_date.split('-').map(Number);
                currentDue = new Date(y, m - 1, d);
            } else {
                currentDue = new Date();
            }

            // Add period based on frequency
            const installments = loan.installments || 1;
            if (loan.frequency === 'Diária') {
                currentDue.setDate(currentDue.getDate() + installments);
            } else if (loan.frequency === 'Semanal') {
                currentDue.setDate(currentDue.getDate() + (installments * 7));
            } else if (loan.frequency === 'Quinzenal') {
                currentDue.setDate(currentDue.getDate() + (installments * 15));
            } else { // Mensal or default
                currentDue.setMonth(currentDue.getMonth() + installments);
            }

            const formattedDate = currentDue.toLocaleDateString('pt-BR');

            const principal = Number(loan.amount);
            const interest = principal * (Number(loan.interest_rate) / 100);
            const newBalance = principal + interest;

            const interestToPay = Math.max(0, Number(loan.balance) - Number(loan.amount)) + totalFines;

            setRenewConfirmData({
                amountToPay: interestToPay,
                nextDueDate: formattedDate,
                nextValue: newBalance,
                type: 'renew'
            });
            setShowRenewConfirmModal(true);
        } else {
            // Quitar Total
            const totalToPay = Number(loan.balance) + totalFines;
            setRenewConfirmData({
                amountToPay: totalToPay,
                nextDueDate: '',
                nextValue: 0,
                type: 'full'
            });
            setShowRenewConfirmModal(true);
        }
    };

    const executeMensalPayment = async (type: 'full' | 'renew') => {
        if (!loan) return;
        setShowRenewConfirmModal(false);
        setRenewConfirmData(null);
        setProcessing(true);
        try {
            let updates: any = {};
            const totalFines = fines.reduce((acc, curr) => acc + curr.fine_value, 0);

            const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
            const currentAmountPaid = loan.amount_paid !== undefined && loan.amount_paid !== null
                ? Number(loan.amount_paid)
                : Math.max(0, totalDebt - Number(loan.balance)) + (Number(loan.total_interest_paid) || 0);

            if (type === 'full') {
                const interestPaid = Math.max(0, Number(loan.balance) - Number(loan.amount)) + totalFines;
                updates = {
                    balance: 0,
                    status: 'paid',
                    progress: 100,
                    amount_paid: currentAmountPaid + Number(loan.balance) + totalFines,
                    total_interest_paid: (Number(loan.total_interest_paid) || 0) + interestPaid
                };
            } else {
                // Renew
                // Calculate new due date
                let currentDue: Date;
                if (loan.due_date) {
                    const [y, m, d] = loan.due_date.split('-').map(Number);
                    currentDue = new Date(y, m - 1, d);
                } else {
                    currentDue = new Date();
                }

                // Add period based on frequency
                const installments = loan.installments || 1;
                if (loan.frequency === 'Diária') {
                    currentDue.setDate(currentDue.getDate() + installments);
                } else if (loan.frequency === 'Semanal') {
                    currentDue.setDate(currentDue.getDate() + (installments * 7));
                } else if (loan.frequency === 'Quinzenal') {
                    currentDue.setDate(currentDue.getDate() + (installments * 15));
                } else { // Mensal or default
                    currentDue.setMonth(currentDue.getMonth() + installments);
                }

                const newDueDateStr = currentDue.toISOString().split('T')[0];

                // Reset balance to Principal + Interest
                const principal = Number(loan.amount);
                const interest = principal * (Number(loan.interest_rate) / 100);
                const newBalance = principal + interest;

                // Calculate interest paid in this renewal (Current Balance - Principal) + Fines
                const interestPaid = Math.max(0, Number(loan.balance) - principal) + totalFines;
                const currentTotalInterestPaid = Number(loan.total_interest_paid) || 0;

                updates = {
                    due_date: newDueDateStr,
                    balance: newBalance,
                    status: 'active',
                    progress: 0,
                    total_interest_paid: currentTotalInterestPaid + interestPaid,
                    amount_paid: currentAmountPaid + interestPaid
                };
            }

            const { error } = await supabase
                .from('loans')
                .update(updates)
                .eq('id', loan.id);

            if (error) throw error;

            // Delete fines if paid
            if (totalFines > 0) {
                const { error: finesError } = await supabase
                    .from('installment_fines')
                    .delete()
                    .eq('loan_id', loan.id);
                if (finesError) console.error("Error deleting fines", finesError);
            }

            setShowMensalPaymentModal(false);
            await fetchLoanData();

            if (type === 'renew') {
                setAlertModal({
                    open: true,
                    title: 'Sucesso',
                    message: 'Empréstimo renovado com sucesso! Novo vencimento em 30 dias.'
                });
            }

        } catch (error) {
            console.error(error);
            setAlertModal({
                open: true,
                title: 'Erro',
                message: 'Erro ao processar pagamento.'
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleGenerateReceipt = async (type: 'last' | 'full') => {
        if (!loan) return;

        const paidInstallments = installmentsList.filter(i => i.status === 'paid');

        if (paidInstallments.length === 0) {
            setAlertModal({
                open: true,
                title: 'Sem Pagamentos',
                message: 'Nenhum pagamento registrado para este empréstimo.'
            });
            return;
        }

        const now = new Date().toLocaleString('pt-BR');

        if (type === 'last') {
            const lastPaid = paidInstallments[paidInstallments.length - 1];
            const stored = loan ? getStoredPaidDates(loan.id)[lastPaid.number] : null;
            const today = new Date();
            const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const dueZero = new Date(lastPaid.date.getFullYear(), lastPaid.date.getMonth(), lastPaid.date.getDate());
            const realPaidDate: Date = lastPaid.paidAt || (stored ? new Date(stored) : (dueZero.getTime() > todayZero.getTime() ? today : lastPaid.date));

            // Prepare data for Image Receipt
            const data = {
                amount: lastPaid.value,
                date: realPaidDate.toLocaleDateString('pt-BR'),
                clientName: loan.client?.name || 'Cliente',
                contractId: loan.id.substring(0, 6).toUpperCase(),
                installmentNumber: lastPaid.number,
                dueDate: (lastPaid.originalDate || lastPaid.date).toLocaleDateString('pt-BR'),
                status: 'paid',
                originalValue: lastPaid.originalValue,
                interest: lastPaid.accumulatedInterest,
                fine: lastPaid.fine?.fine_value,
                fineType: lastPaid.fine?.fine_type,
                totalPaid: lastPaid.value,
                creditBalance: loan.client?.credit_balance,
                authenticationCode: Math.random().toString(36).substring(2, 15).toUpperCase().match(/.{1,4}/g)?.join('-') || 'AUTH-CODE'
            };

            setReceiptData(data);
            setShowReceiptModal(false);
            setShowReceiptImageModal(true);
            return;
        }

        // Prepare data for Extract Image
        const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
        const displayTotalPaid = loan.status === 'paid' && loan.amount_paid
            ? Number(loan.amount_paid)
            : Math.max(0, totalDebt - Number(loan.balance));

        const currentBalance = installmentsList.reduce((acc, inst) => inst.status !== 'paid' ? acc + inst.value : acc, 0);

        const formatDate = (d: any) => {
            if (!d) return undefined;
            if (d instanceof Date) return d.toLocaleDateString('pt-BR');
            return new Date(d).toLocaleDateString('pt-BR');
        };

        const pendingInstallments = installmentsList.filter(i => i.status !== 'paid');
        const lateInstallments = pendingInstallments.filter(i => i.status === 'late');
        const nextPending = pendingInstallments[0];
        const lastPending = pendingInstallments[pendingInstallments.length - 1];

        const remainingSummary = {
            remainingCount: pendingInstallments.length,
            totalCount: loan.installments || installmentsList.length,
            paidCount: paidInstallments.length,
            installmentValue: loan.installment_value || (nextPending?.value ?? 0),
            nextInstallmentNumber: nextPending?.number,
            nextDueDate: formatDate(nextPending?.date),
            finalDueDate: formatDate(lastPending?.date),
            lateCount: lateInstallments.length,
            lateAmount: lateInstallments.reduce((sum, i) => sum + i.value, 0)
        };

        const data = {
            emissionDate: now,
            clientName: loan.client?.name || 'Cliente',
            contractId: loan.id.substring(0, 6).toUpperCase(),
            totalPaid: displayTotalPaid,
            balance: currentBalance,
            creditAvailable: loan.client?.credit_balance,
            remainingSummary,
            installments: paidInstallments.map(i => ({
                number: i.number,
                date: formatDate(i.date) || '',
                value: i.value
            })),
            authenticationCode: Math.random().toString(36).substring(2, 15).toUpperCase().match(/.{1,4}/g)?.join('-') || 'AUTH-CODE'
        };

        setExtractData(data);
        setShowReceiptModal(false);
        setShowExtractImageModal(true);
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

    if (showAmortizationPage) {
        return (
            <Amortization
                loan={loan}
                installmentsList={installmentsList}
                onBack={() => setShowAmortizationPage(false)}
                onConfirm={handleConfirmAmortization}
                processing={processing}
            />
        );
    }

    const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
    const totalPaid = Math.max(0, totalDebt - Number(loan.balance));
    const percentage = loan.status === 'paid' ? 100 : Math.max(0, loan.progress || 0);
    const paidCount = installmentsList.filter(i => i.status === 'paid').length;
    const totalCount = installmentsList.length;

    // Determine display status based on installments
    const isLate = installmentsList.some(i => i.status === 'late');
    const displayStatus = isLate && loan.status !== 'paid' ? 'late' : loan.status;

    // Calculate original amount fallback if it's 0 (due to amortization)
    const originalAmount = Number(loan.amount) > 0
        ? Number(loan.amount)
        : totalDebt / (1 + (Number(loan.interest_rate) / 100));

    // For paid loans, use the actual amount paid stored in DB if available, otherwise fallback to calculation
    const displayTotalPaid = loan.status === 'paid' && loan.amount_paid
        ? Number(loan.amount_paid)
        : totalPaid;

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
            {/* ==================== MOBILE VIEW (Preserved) ==================== */}
            <div className="md:hidden flex flex-col h-full overflow-hidden">
                <header className={`bg-black text-white px-6 pt-8 pb-12 rounded-b-[40px] relative z-10 transition-colors duration-300`}>
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

            <main className="flex-1 px-5 -mt-6 pb-32 relative z-20 overflow-y-auto no-scrollbar">

                {/* Payment Request Alert Banner */}
                {pendingPaymentRequests.length > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-4 animate-in slide-in-from-top duration-300">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                                <AlertTriangle className="w-5 h-5 text-amber-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                                    {pendingPaymentRequests.length} pagamento{pendingPaymentRequests.length > 1 ? 's' : ''} pendente{pendingPaymentRequests.length > 1 ? 's' : ''}
                                </p>
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                                    O cliente informou que realizou pagamento{pendingPaymentRequests.length > 1 ? 's' : ''}. Verifique e confirme.
                                </p>
                                <div className="mt-3 space-y-2">
                                    {pendingPaymentRequests.map(req => (
                                        <button
                                            key={req.id}
                                            onClick={() => { setSelectedPaymentRequest(req); setShowPaymentRequestModal(true); }}
                                            className="w-full flex items-center justify-between bg-white dark:bg-gray-800 px-3 py-2.5 rounded-xl border border-amber-100 dark:border-amber-900 active:scale-[0.98] transition-all"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-gray-900 dark:text-white">Parcela #{String(req.installment_number).padStart(2, '0')}</span>
                                                <span className="text-[10px] text-gray-400">{new Date(req.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-amber-700">R$ {Number(req.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                <ChevronRight className="w-4 h-4 text-gray-400" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Summary Card */}
                <div className="bg-card-light dark:bg-card-dark p-6 rounded-3xl shadow-md border border-gray-100 dark:border-gray-800 mb-6">
                    <div className="flex flex-col items-center text-center">
                        <span className="text-[10px] font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-[0.2em] mb-1">Contrato #{loan.id.substring(0, 6)}</span>
                        <p className="text-xs text-text-sub-light dark:text-text-sub-dark font-bold uppercase mb-2 truncate max-w-full px-2">{loan.client?.name || 'Cliente'}</p>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Saldo Devedor Restante</span>
                        <h2 className="text-4xl font-bold text-red-600 dark:text-red-500 mb-1 tracking-tight">
                            R$ {installmentsList.reduce((acc, inst) => inst.status !== 'paid' ? acc + inst.value : acc, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h2>
                        <p className="text-[11px] text-gray-400 font-medium mb-3">
                            de R$ {totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} da dívida total
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="px-3 py-1 rounded text-[10px] font-bold border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 uppercase">
                                {loan.frequency || 'N/A'}
                            </span>
                            <span className={`px-3 py-1 rounded text-[10px] font-bold border uppercase ${displayStatus === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' :
                                displayStatus === 'late' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' :
                                    displayStatus === 'paid' ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700' :
                                        'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800'
                                }`}>
                                {displayStatus === 'active' ? 'EM DIA' : displayStatus === 'late' ? 'ATRASADO' : displayStatus === 'paid' ? 'QUITADO' : 'PENDENTE'}
                            </span>

                            <button
                                onClick={handleCharge}
                                disabled={loan.status === 'paid'}
                                className={`px-3 py-1 rounded text-[10px] font-bold border uppercase transition-all flex items-center gap-1 ${loan.status === 'paid'
                                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                                    : isLate
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 cursor-pointer hover:opacity-80'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-80'
                                    }`}
                            >
                                <Banknote className="w-3 h-3" />
                                Cobrar
                            </button>
                        </div>
                    </div>
                </div>

                {/* Progress Card */}
                <div className="bg-card-light dark:bg-card-dark p-5 sm:p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 mb-6">
                    <h3 className="text-sm font-bold text-primary dark:text-white mb-4">Status do Pagamento</h3>
                    
                    {/* Top Row: Gauge + Progress Info */}
                    <div className="flex items-center gap-4">
                        <div
                            className="w-20 h-20 rounded-full flex items-center justify-center relative shadow-inner shrink-0"
                            style={{
                                background: `conic-gradient(${displayStatus === 'late' ? '#EF4444' : '#10B981'} ${percentage}%, #E5E7EB 0)`
                            } as React.CSSProperties}
                        >
                            <div className="absolute inset-2 rounded-full bg-card-light dark:bg-card-dark flex items-center justify-center shadow-xs">
                                <span className="text-lg font-black text-primary dark:text-white">{percentage}%</span>
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold tracking-wider">Parcelas Pagas</span>
                                <span className="text-xs font-black text-gray-900 dark:text-white">
                                    {paidCount} de {totalCount} ({percentage}%)
                                </span>
                            </div>
                            <div className="w-full bg-gray-100 dark:bg-gray-800 h-2.5 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-300 ${displayStatus === 'late' ? 'bg-red-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1.5 font-medium">
                                {totalCount - paidCount === 0 ? 'Contrato 100% quitado' : `${totalCount - paidCount} parcela(s) restante(s)`}
                            </p>
                        </div>
                    </div>

                    {/* Bottom Row: Full-width Financial Cards (sem truncamento) */}
                    <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                        <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 flex flex-col justify-between">
                            <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold tracking-wider mb-1">Total da Dívida</p>
                            <p className="text-sm sm:text-base font-black text-gray-900 dark:text-white whitespace-nowrap">
                                R$ {totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 flex flex-col justify-between">
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-bold tracking-wider mb-1">Total Amortizado</p>
                            <p className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                R$ {displayTotalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Grid Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold mb-1">Valor Solicitado</p>
                        <p className="font-bold text-gray-900 dark:text-white">R$ {originalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold mb-1">Valor da Parcela</p>
                        <p className="font-bold text-gray-900 dark:text-white">
                            {loan.installments}x de R$ {(loan.installment_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold mb-1">Taxa de Juros</p>
                        <p className="font-bold text-gray-900 dark:text-white">
                            {loan.interest_rate}% {loan.frequency === 'Semanal' ? 'a.s.' : loan.frequency === 'Diária' ? 'a.d.' : loan.frequency === 'Quinzenal' ? 'a.q.' : 'a.m.'}
                        </p>
                    </div>
                    <div
                        className={`bg-card-light dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm ${loan.status === 'paid' ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors' : ''}`}
                        onClick={() => {
                            if (loan.status === 'paid') {
                                setShowInterestBreakdownModal(true);
                            }
                        }}
                    >
                        {loan.status === 'paid' ? (
                            <>
                                <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold mb-1 flex items-center gap-1">
                                    Juros Pagos
                                    <ChevronRight className="w-3 h-3 opacity-50" />
                                </p>
                                <p className="font-bold text-green-600 dark:text-green-400">
                                    R$ {(Number(loan.total_interest_paid) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold mb-1">Crédito Disponível</p>
                                <p className="font-bold text-blue-600 dark:text-blue-400">
                                    R$ {(Number(loan.client?.credit_balance) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </>
                        )}
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
                                className={`relative flex items-center gap-4 transition-all duration-200 ${inst.status !== 'paid' ? 'cursor-pointer active:scale-[0.99]' : 'cursor-pointer active:scale-[0.99]'}`}
                                onClick={() => {
                                    if (isSelectionMode && inst.status !== 'paid') {
                                        toggleInstallmentSelection(inst.number);
                                    } else if (!isSelectionMode) {
                                        setSelectedInstallmentForDetail(inst);
                                    }
                                }}
                            >
                                {isSelectionMode ? (
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${inst.status === 'paid' ? 'border-gray-200 bg-gray-100 opacity-50' :
                                        selectedInstallments.includes(inst.number) ? 'border-primary bg-primary text-white' : 'border-gray-300'
                                        }`}>
                                        {inst.status === 'paid' ? <Check className="w-4 h-4 text-gray-400" /> :
                                            selectedInstallments.includes(inst.number) && <Check className="w-4 h-4" />}
                                    </div>
                                ) : (
                                    <div className={`z-10 w-8 h-8 rounded-full flex items-center justify-center text-white ring-4 ring-white dark:ring-card-dark ${inst.status === 'paid' ? 'bg-secondary' :
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
                                                inst.status === 'late' ? `Vencido desde ${(inst.originalDate || inst.date).toLocaleDateString()}` :
                                                    inst.status === 'pending' ? `Vence em ${inst.date.toLocaleDateString()}` :
                                                        `Prevista para ${inst.date.toLocaleDateString()}`}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex flex-col items-end gap-0.5 mb-1">
                                            {Boolean(inst.accumulatedInterest && inst.accumulatedInterest > 0.01 && inst.originalValue && Math.abs(inst.value - inst.originalValue) > 0.01) && (
                                                <span className="text-[10px] text-gray-400 line-through">
                                                    R$ {inst.originalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            )}
                                            {Boolean(inst.accumulatedInterest && inst.accumulatedInterest > 0.01) && (
                                                <span className="text-[10px] text-red-500/80 font-medium">
                                                    + Juros R$ {inst.accumulatedInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            )}
                                            {inst.fine && (
                                                <span className="text-[10px] text-red-500/80 font-medium">
                                                    + Multa {inst.fine.fine_type === 'percent' ? `${inst.fine.fine_value}%` : `R$ ${inst.fine.fine_value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-end gap-2">
                                            <div className={`flex items-baseline gap-1 ${inst.status === 'paid' ? 'text-secondary' :
                                                inst.status === 'late' ? 'text-danger' :
                                                    inst.status === 'pending' ? 'text-accent-blue' : 'text-gray-500'
                                                }`}>
                                                <span className="text-xs font-medium opacity-70">R$</span>
                                                <span className="text-lg font-bold">
                                                    {inst.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                            {/* Fine button removed from here */}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mb-10">
                    {isSelectionMode ? (
                        <div className="space-y-3">
                            <button
                                onClick={handleBatchPayment}
                                disabled={processing || selectedInstallments.length === 0}
                                className="w-full bg-primary dark:bg-white text-white dark:text-primary py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 transition active:scale-[0.98] disabled:opacity-70"
                            >
                                {processing ? 'Processando...' : `Confirmar Pagamentos (${selectedInstallments.length})`}
                            </button>
                            <button
                                onClick={toggleSelectionMode}
                                className="w-full bg-transparent border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 py-3 rounded-2xl font-bold transition active:scale-[0.98] text-sm"
                            >
                                Cancelar Seleção
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            {loan.status !== 'paid' && (
                                <button
                                    onClick={() => {
                                        if (loan.frequency === 'Mensal' || loan.frequency === 'Quinzenal') {
                                            setShowMensalPaymentModal(true);
                                        } else {
                                            setShowPaymentModal(true);
                                        }
                                    }}
                                    disabled={processing}
                                    className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-[24px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-md border border-black/5 transition-all active:scale-[0.96]"
                                >
                                    <div className="w-8 h-8 rounded-xl bg-white/10 dark:bg-gray-100 flex items-center justify-center">
                                        <Wallet className="w-4 h-4" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-center leading-tight">
                                        Registrar<br/>Pagamento
                                    </span>
                                </button>
                            )}

                            {loan.status !== 'paid' && loan.frequency !== 'Mensal' && loan.frequency !== 'Quinzenal' && (
                                <button
                                    onClick={toggleSelectionMode}
                                    className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-[24px] bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-100 dark:border-gray-700 shadow-sm transition-all active:scale-[0.96]"
                                >
                                    <div className="w-8 h-8 rounded-xl bg-gray-50 dark:bg-gray-700 flex items-center justify-center">
                                        <Check className="w-4 h-4 text-gray-400" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-center leading-tight">
                                        Pagamento<br/>em Lote
                                    </span>
                                </button>
                            )}

                            <button
                                onClick={() => setShowReceiptModal(true)}
                                className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-[24px] bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-100 dark:border-gray-700 shadow-sm transition-all active:scale-[0.96]"
                            >
                                <div className="w-8 h-8 rounded-xl bg-gray-50 dark:bg-gray-700 flex items-center justify-center">
                                    <Share2 className="w-4 h-4 text-gray-400" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-center leading-tight">
                                    Gerar<br/>Comprovante
                                </span>
                            </button>

                            {loan.status !== 'paid' && (
                                <button
                                    onClick={async () => {
                                        setShowPortalLinkModal(true);
                                        setPortalLinkLoading(true);
                                        try {
                                            const { data: { user } } = await supabase.auth.getUser();
                                            if (!user) return;
                                            const tk = await createPortalLink(loan.id, user.id);
                                            if (tk) {
                                                setPortalLink(`${window.location.origin}/acompanhar/${tk}`);
                                            }
                                        } catch (e) { console.error(e); }
                                        finally { setPortalLinkLoading(false); }
                                    }}
                                    className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-[24px] bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 shadow-sm transition-all active:scale-[0.96]"
                                >
                                    <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                        <Link2 className="w-4 h-4" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-center leading-tight">
                                        Link do<br/>Cliente
                                    </span>
                                </button>
                            )}

                            {loan.status === 'paid' ? (
                                <button
                                    onClick={handleNewLoan}
                                    className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-[24px] bg-secondary/10 dark:bg-secondary/20 border border-secondary text-secondary shadow-sm transition-all active:scale-[0.96]"
                                >
                                    <div className="w-8 h-8 rounded-xl bg-secondary/20 flex items-center justify-center">
                                        <PlusCircle className="w-4 h-4" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-center leading-tight">
                                        Novo<br/>Empréstimo
                                    </span>
                                </button>
                            ) : (
                                <button
                                    onClick={() => setShowDeleteModal(true)}
                                    className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-[24px] bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900 transition-all active:scale-[0.96]"
                                >
                                    <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-red-600 text-center leading-tight">
                                        Excluir<br/>Empréstimo
                                    </span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

            </main>
        </div>

        {/* ==================== DESKTOP VIEW (Redesigned) ==================== */}
        <div className="hidden md:flex flex-col h-full bg-gray-50/60 dark:bg-[#0B0B0F] overflow-hidden">
            {/* Desktop Sticky Header */}
            <header className="px-8 py-4 bg-white dark:bg-[#111] border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-2xs cursor-pointer"
                        title="Voltar"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">
                                Contrato #{loan.id.substring(0, 6)}
                            </h1>
                            <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider ${
                                displayStatus === 'active' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' :
                                displayStatus === 'late' ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800' :
                                displayStatus === 'paid' ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700' :
                                'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                            }`}>
                                {displayStatus === 'active' ? 'EM DIA' : displayStatus === 'late' ? 'ATRASADO' : displayStatus === 'paid' ? 'QUITADO' : 'PENDENTE'}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                                {loan.frequency || 'N/A'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
                            <span>Cliente: <strong className="text-gray-800 dark:text-gray-200 font-bold">{loan.client?.name || 'Cliente'}</strong></span>
                            {loan.client?.phone && <span className="text-gray-400">• {loan.client.phone}</span>}
                            {loan.due_date && <span className="text-gray-400">• Vencimento: {new Date(loan.due_date).toLocaleDateString('pt-BR')}</span>}
                        </p>
                    </div>
                </div>

                {isSelectionMode ? (
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl">
                            {selectedInstallments.length} selecionada(s)
                        </span>
                        <button
                            onClick={selectAllOverdue}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer"
                        >
                            Selecionar vencidas
                        </button>
                        <button
                            onClick={toggleSelectionMode}
                            className="text-xs font-bold text-gray-500 hover:text-gray-700 dark:text-gray-400 px-3 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleBatchPayment}
                            disabled={processing || selectedInstallments.length === 0}
                            className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black font-bold text-xs rounded-xl shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
                        >
                            {processing ? 'Processando...' : `Confirmar Pagamentos (${selectedInstallments.length})`}
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={handleCharge}
                            disabled={loan.status === 'paid'}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-2xs cursor-pointer ${
                                loan.status === 'paid'
                                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                                    : isLate
                                        ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800 hover:bg-rose-100'
                                        : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                            }`}
                        >
                            <Banknote className="w-3.5 h-3.5" />
                            Cobrar
                        </button>

                        {loan.status !== 'paid' && (
                            <button
                                onClick={() => {
                                    if (loan.frequency === 'Mensal' || loan.frequency === 'Quinzenal') {
                                        setShowMensalPaymentModal(true);
                                    } else {
                                        setShowPaymentModal(true);
                                    }
                                }}
                                disabled={processing}
                                className="px-4 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-bold hover:bg-black/85 dark:hover:bg-gray-100 transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
                            >
                                <Wallet className="w-3.5 h-3.5" />
                                Registrar Pagamento
                            </button>
                        )}

                        <button
                            onClick={() => setShowReceiptModal(true)}
                            className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-2xs cursor-pointer"
                            title="Gerar Comprovante / Extrato"
                        >
                            <Share2 className="w-4 h-4" />
                        </button>

                        {loan.status !== 'paid' ? (
                            <button
                                onClick={() => setShowDeleteModal(true)}
                                className="p-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 transition-colors shadow-2xs cursor-pointer"
                                title="Excluir este Empréstimo"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                onClick={handleNewLoan}
                                className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
                            >
                                <PlusCircle className="w-3.5 h-3.5" />
                                Novo Empréstimo
                            </button>
                        )}
                    </div>
                )}
            </header>

            {/* Desktop 2-Column Content Layout */}
            <main className="flex-1 overflow-y-auto px-8 py-8 no-scrollbar">
                <div className="max-w-7xl mx-auto grid grid-cols-12 gap-8 items-start pb-16">
                    {/* LEFT COLUMN: Resumo Financeiro, Progresso, Ficha Técnica e Ações (5 colunas) */}
                    <div className="col-span-5 space-y-6">
                        {/* Card 1: Saldo Devedor Restante */}
                        <div className="bg-white dark:bg-card-dark rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Saldo Restante</span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    displayStatus === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                    displayStatus === 'late' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                                    'bg-gray-100 dark:bg-gray-800 text-gray-500'
                                }`}>
                                    {displayStatus === 'active' ? 'Em Dia' : displayStatus === 'late' ? 'Atrasado' : 'Quitado'}
                                </span>
                            </div>
                            <div className="text-3xl lg:text-4xl font-black text-red-600 dark:text-red-500 tracking-tight">
                                R$ {installmentsList.reduce((acc, inst) => inst.status !== 'paid' ? acc + inst.value : acc, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                                <span>{paidCount === totalCount ? 'Todos os pagamentos foram quitados' : `${totalCount - paidCount} parcela(s) pendente(s)`}</span>
                                <span className="font-semibold text-gray-600 dark:text-gray-400">
                                    {loan.installment_value ? `Parcelas de R$ ${(loan.installment_value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                                </span>
                            </div>

                            <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
                                <button
                                    onClick={handleCharge}
                                    disabled={loan.status === 'paid'}
                                    className="flex-1 py-3 px-4 rounded-xl bg-black dark:bg-white text-white dark:text-black font-bold text-xs hover:bg-black/85 dark:hover:bg-gray-100 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                                >
                                    <Banknote className="w-4 h-4" />
                                    Opções de Cobrança
                                </button>
                                {loan.status !== 'paid' && (
                                    <button
                                        onClick={async () => {
                                            setShowPortalLinkModal(true);
                                            setPortalLinkLoading(true);
                                            try {
                                                const { data: { user } } = await supabase.auth.getUser();
                                                if (!user) return;
                                                const tk = await createPortalLink(loan.id, user.id);
                                                if (tk) {
                                                    setPortalLink(`${window.location.origin}/acompanhar/${tk}`);
                                                }
                                            } catch (e) { console.error(e); }
                                            finally { setPortalLinkLoading(false); }
                                        }}
                                        className="py-3 px-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 font-bold text-xs hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                        title="Gerar link de acompanhamento sem login para o cliente"
                                    >
                                        <Link2 className="w-4 h-4" />
                                        Link do Cliente
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Card 2: Progresso do Pagamento */}
                        <div className="bg-white dark:bg-card-dark rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
                            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-gray-400 mb-5">Status do Pagamento</h3>
                            <div className="flex items-center gap-6">
                                <div
                                    className="w-24 h-24 rounded-full flex items-center justify-center relative shadow-inner shrink-0"
                                    style={{
                                        background: `conic-gradient(${displayStatus === 'late' ? '#EF4444' : '#10B981'} ${percentage}%, #E5E7EB 0)`
                                    } as React.CSSProperties}
                                >
                                    <div className="absolute inset-2.5 rounded-full bg-white dark:bg-card-dark flex items-center justify-center shadow-xs">
                                        <span className="text-xl font-black text-gray-900 dark:text-white">{percentage}%</span>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-2.5 min-w-0">
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                                            <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Total da Dívida</p>
                                            <p className="text-sm xl:text-base font-black text-gray-900 dark:text-white mt-0.5 whitespace-nowrap">
                                                R$ {totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-black tracking-wider">Total Amortizado</p>
                                            <p className="text-sm xl:text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5 whitespace-nowrap">
                                                R$ {displayTotalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-2.5 px-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                        <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Parcelas Pagas</span>
                                        <span className="text-xs font-black text-gray-900 dark:text-white">
                                            {paidCount} de {totalCount} parcelas ({percentage}%)
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Card 3: Ficha Técnica (Grid 2x2) */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                                <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider mb-1">Valor Solicitado</p>
                                <p className="text-base font-black text-gray-900 dark:text-white">
                                    R$ {originalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div className="bg-white dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                                <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider mb-1">Valor da Parcela</p>
                                <p className="text-base font-black text-gray-900 dark:text-white">
                                    {loan.installments}x de R$ {(loan.installment_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div className="bg-white dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                                <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider mb-1">Taxa de Juros</p>
                                <p className="text-base font-black text-gray-900 dark:text-white">
                                    {loan.interest_rate}% {loan.frequency === 'Semanal' ? 'a.s.' : loan.frequency === 'Diária' ? 'a.d.' : loan.frequency === 'Quinzenal' ? 'a.q.' : 'a.m.'}
                                </p>
                            </div>
                            <div
                                className={`bg-white dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm ${loan.status === 'paid' ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors' : ''}`}
                                onClick={() => {
                                    if (loan.status === 'paid') {
                                        setShowInterestBreakdownModal(true);
                                    }
                                }}
                            >
                                {loan.status === 'paid' ? (
                                    <>
                                        <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider mb-1 flex items-center gap-1">
                                            Juros Pagos
                                            <ChevronRight className="w-3 h-3 opacity-50" />
                                        </p>
                                        <p className="text-base font-black text-emerald-600 dark:text-emerald-400">
                                            R$ {(Number(loan.total_interest_paid) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider mb-1">Crédito Disponível</p>
                                        <p className="text-base font-black text-blue-600 dark:text-blue-400">
                                            R$ {(Number(loan.client?.credit_balance) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Card 4: Ações Rápidas */}
                        <div className="bg-white dark:bg-card-dark rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
                            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-gray-400 mb-4">Ações do Contrato</h3>
                            <div className="space-y-2.5">
                                {loan.status !== 'paid' && (
                                    <button
                                        onClick={() => {
                                            if (loan.frequency === 'Mensal' || loan.frequency === 'Quinzenal') {
                                                setShowMensalPaymentModal(true);
                                            } else {
                                                setShowPaymentModal(true);
                                            }
                                        }}
                                        disabled={processing}
                                        className="w-full py-3 px-4 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-xs hover:bg-black/85 dark:hover:bg-gray-100 transition-all flex items-center justify-between shadow-sm active:scale-[0.99] cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-7 h-7 rounded-xl bg-white/20 dark:bg-black/10 flex items-center justify-center">
                                                <Wallet className="w-4 h-4" />
                                            </div>
                                            <span>Registrar Pagamento / Baixa</span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 opacity-60" />
                                    </button>
                                )}

                                {loan.status !== 'paid' && loan.frequency !== 'Mensal' && loan.frequency !== 'Quinzenal' && (
                                    <button
                                        onClick={toggleSelectionMode}
                                        className="w-full py-3 px-4 rounded-2xl bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold text-xs border border-gray-200 dark:border-gray-700 transition-all flex items-center justify-between active:scale-[0.99] cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-7 h-7 rounded-xl bg-gray-200/60 dark:bg-gray-700 flex items-center justify-center">
                                                <Check className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                            </div>
                                            <span>{isSelectionMode ? 'Cancelar Seleção em Lote' : 'Pagamento em Lote'}</span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 opacity-60" />
                                    </button>
                                )}

                                <button
                                    onClick={() => setShowReceiptModal(true)}
                                    className="w-full py-3 px-4 rounded-2xl bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold text-xs border border-gray-200 dark:border-gray-700 transition-all flex items-center justify-between active:scale-[0.99] cursor-pointer"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-7 h-7 rounded-xl bg-gray-200/60 dark:bg-gray-700 flex items-center justify-center">
                                            <Share2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                        </div>
                                        <span>Gerar Comprovante / Extrato</span>
                                    </div>
                                    <ChevronRight className="w-4 h-4 opacity-60" />
                                </button>

                                {loan.status === 'paid' ? (
                                    <button
                                        onClick={handleNewLoan}
                                        className="w-full py-3 px-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-bold text-xs border border-emerald-200 dark:border-emerald-800 transition-all flex items-center justify-between active:scale-[0.99] cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-7 h-7 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                                                <PlusCircle className="w-4 h-4" />
                                            </div>
                                            <span>Gerar Novo Empréstimo</span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 opacity-60" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setShowDeleteModal(true)}
                                        className="w-full py-3 px-4 rounded-2xl bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100/60 text-red-600 dark:text-red-400 font-bold text-xs border border-red-100 dark:border-red-900/30 transition-all flex items-center justify-between active:scale-[0.99] cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-7 h-7 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </div>
                                            <span>Excluir este Empréstimo</span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 opacity-60" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Alertas de Pagamento e Cronograma Completo de Parcelas (7 colunas) */}
                    <div className="col-span-7 space-y-6">
                        {/* Payment Request Alert Banner (Desktop) */}
                        {pendingPaymentRequests.length > 0 && (
                            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-3xl p-5 shadow-sm animate-in slide-in-from-top duration-300">
                                <div className="flex items-start gap-3.5">
                                    <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-amber-950 dark:text-amber-200">
                                            {pendingPaymentRequests.length} solicitação{pendingPaymentRequests.length > 1 ? 'ões' : ''} de pagamento pendente{pendingPaymentRequests.length > 1 ? 's' : ''}
                                        </p>
                                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                                            O cliente informou que realizou o pagamento pelo portal. Clique para analisar e dar baixa.
                                        </p>
                                        <div className="mt-3.5 space-y-2">
                                            {pendingPaymentRequests.map(req => (
                                                <button
                                                    key={req.id}
                                                    onClick={() => { setSelectedPaymentRequest(req); setShowPaymentRequestModal(true); }}
                                                    className="w-full flex items-center justify-between bg-white dark:bg-gray-800/90 px-4 py-3 rounded-2xl border border-amber-200/80 dark:border-amber-800/60 hover:shadow-xs active:scale-[0.99] transition-all cursor-pointer"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs font-black text-gray-900 dark:text-white">Parcela #{String(req.installment_number).padStart(2, '0')}</span>
                                                        <span className="text-[11px] text-gray-400">{new Date(req.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-amber-700 dark:text-amber-400">R$ {Number(req.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                        <ChevronRight className="w-4 h-4 text-gray-400" />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Cronograma de Parcelas */}
                        <div className="bg-white dark:bg-card-dark rounded-3xl p-6 lg:p-7 border border-gray-100 dark:border-gray-800 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-base font-black text-gray-900 dark:text-white tracking-tight">Cronograma de Parcelas</h3>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {installmentsList.length} parcela{installmentsList.length > 1 ? 's' : ''} no total • {paidCount} liquidada{paidCount !== 1 ? 's' : ''}
                                    </p>
                                </div>
                            </div>

                            <div className="relative space-y-3.5">
                                <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-100 dark:bg-gray-800"></div>

                                {installmentsList.map((inst) => (
                                    <div
                                        key={inst.number}
                                        className={`relative flex items-center gap-4 p-3.5 rounded-2xl transition-all duration-150 ${
                                            inst.status === 'paid' ? 'bg-gray-50/60 dark:bg-gray-800/25 border border-transparent opacity-80' :
                                            inst.status === 'late' ? 'bg-rose-50/40 dark:bg-rose-950/15 border border-rose-100 dark:border-rose-900/30' :
                                            'bg-white dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/60'
                                        } cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 active:scale-[0.99]`}
                                        onClick={() => {
                                            if (isSelectionMode && inst.status !== 'paid') {
                                                toggleInstallmentSelection(inst.number);
                                            } else if (!isSelectionMode) {
                                                setSelectedInstallmentForDetail(inst);
                                            }
                                        }}
                                        title="Clique para ver os detalhes desta parcela"
                                    >
                                        {isSelectionMode ? (
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors shrink-0 z-10 ${
                                                inst.status === 'paid' ? 'border-gray-200 bg-gray-100 opacity-50' :
                                                selectedInstallments.includes(inst.number) ? 'border-primary bg-primary text-white' : 'border-gray-300 bg-white dark:bg-gray-800'
                                            }`}>
                                                {inst.status === 'paid' ? <Check className="w-4 h-4 text-gray-400" /> :
                                                    selectedInstallments.includes(inst.number) && <Check className="w-4 h-4" />}
                                            </div>
                                        ) : (
                                            <div className={`z-10 w-8 h-8 rounded-full flex items-center justify-center text-white ring-4 ring-white dark:ring-card-dark shrink-0 ${
                                                inst.status === 'paid' ? 'bg-emerald-500' :
                                                inst.status === 'late' ? 'bg-rose-500' :
                                                inst.status === 'pending' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-700 text-gray-600'
                                            }`}>
                                                {inst.status === 'paid' ? <Check className="w-4 h-4" /> :
                                                    inst.status === 'future' ? <Circle className="w-4 h-4" /> :
                                                        <Clock className="w-4 h-4" />}
                                            </div>
                                        )}

                                        <div className="flex-1 flex justify-between items-center min-w-0">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-black text-gray-900 dark:text-white">
                                                        Parcela #{String(inst.number).padStart(2, '0')}
                                                    </p>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                        inst.status === 'paid' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' :
                                                        inst.status === 'late' ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400' :
                                                        inst.status === 'pending' ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400' :
                                                        'bg-gray-100 dark:bg-gray-800 text-gray-500'
                                                    }`}>
                                                        {inst.status === 'paid' ? 'Paga' :
                                                            inst.status === 'late' ? 'Vencida' :
                                                            inst.status === 'pending' ? 'Próxima' : 'Futura'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">
                                                    {inst.status === 'paid' ? `Quitada` :
                                                        inst.status === 'late' ? `Venceu em ${(inst.originalDate || inst.date).toLocaleDateString('pt-BR')}` :
                                                        inst.status === 'pending' ? `Vencimento em ${inst.date.toLocaleDateString('pt-BR')}` :
                                                        `Prevista para ${inst.date.toLocaleDateString('pt-BR')}`}
                                                </p>
                                            </div>

                                            <div className="text-right">
                                                <div className="flex flex-col items-end gap-0.5 mb-0.5">
                                                    {Boolean(inst.accumulatedInterest && inst.accumulatedInterest > 0.01 && inst.originalValue && Math.abs(inst.value - inst.originalValue) > 0.01) && (
                                                        <span className="text-[10px] text-gray-400 line-through">
                                                            R$ {inst.originalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                    )}
                                                    {Boolean(inst.accumulatedInterest && inst.accumulatedInterest > 0.01) && (
                                                        <span className="text-[10px] text-red-500 font-semibold">
                                                            + Juros R$ {inst.accumulatedInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                    )}
                                                    {inst.fine && (
                                                        <span className="text-[10px] text-red-500 font-semibold">
                                                            + Multa {inst.fine.fine_type === 'percent' ? `${inst.fine.fine_value}%` : `R$ ${inst.fine.fine_value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={`flex items-baseline justify-end gap-1 ${
                                                    inst.status === 'paid' ? 'text-emerald-600 dark:text-emerald-400' :
                                                    inst.status === 'late' ? 'text-rose-600 dark:text-rose-400' :
                                                    'text-gray-900 dark:text-white'
                                                }`}>
                                                    <span className="text-xs font-semibold opacity-70">R$</span>
                                                    <span className="text-lg font-black">
                                                        {inst.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {isSelectionMode && (
                                <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4">
                                    <span className="text-xs font-bold text-gray-500">
                                        {selectedInstallments.length} parcela(s) selecionada(s)
                                    </span>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={toggleSelectionMode}
                                            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleBatchPayment}
                                            disabled={processing || selectedInstallments.length === 0}
                                            className="px-5 py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-bold shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                                        >
                                            {processing ? 'Processando...' : `Confirmar Pagamentos (${selectedInstallments.length})`}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>

        {/* Payment Confirmation Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Registrar Pagamento</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                Escolha o tipo de pagamento
                            </p>
                        </div>

                        <div className="space-y-3">
                            {/* 1. Pagar 1 Parcela */}
                            <button
                                onClick={() => {
                                    setShowPaymentModal(false);
                                    setShowSinglePaymentConfirmModal(true);
                                }}
                                className="w-full flex flex-col rounded-2xl overflow-hidden shadow-sm transition-transform active:scale-[0.98] border border-gray-100 dark:border-gray-800"
                            >
                                <div className="w-full bg-gray-100 dark:bg-gray-800 py-3.5 px-4 flex items-center justify-center gap-2">
                                    <Check className="w-4 h-4 text-gray-500" />
                                    <span className="text-[15px] font-extrabold text-[#111827] dark:text-white">
                                        Pagar 1 Parcela
                                    </span>
                                </div>
                                <div className="w-full bg-[#5AAB22] py-2 px-4 flex items-center justify-center">
                                    <span className="text-lg font-black text-white">
                                        R$ {(loan.installment_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </button>

                            {/* 2. Informar AV */}
                            <button
                                onClick={() => {
                                    setShowPaymentModal(false);
                                    setShowAVModal(true);
                                }}
                                className="w-full flex flex-col rounded-2xl overflow-hidden shadow-sm transition-transform active:scale-[0.98] border border-gray-100 dark:border-gray-800"
                            >
                                <div className="w-full bg-gray-100 dark:bg-gray-800 py-3.5 px-4 flex items-center justify-center gap-2">
                                    <Plus className="w-4 h-4 text-gray-500" />
                                    <span className="text-[15px] font-extrabold text-[#111827] dark:text-white">
                                        Informar AV
                                    </span>
                                </div>
                                <div className="w-full bg-[#00AEEF] py-2 px-4 flex items-center justify-center text-white">
                                    <span className="text-lg font-black">
                                        Saldo + Recebido
                                    </span>
                                </div>
                            </button>

                            <button
                                onClick={() => setShowPaymentModal(false)}
                                className="w-full py-4 text-xs font-bold text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors uppercase tracking-wider mt-2"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Single Payment Confirmation Modal */}
            {showSinglePaymentConfirmModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSinglePaymentConfirmModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Confirmar Pagamento</h3>
                            <button onClick={() => setShowSinglePaymentConfirmModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="mb-6 bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-800 text-center">
                            <p className="text-xs text-green-600 dark:text-green-400 font-bold uppercase mb-1">Valor da Parcela</p>
                            <p className="text-3xl font-bold text-green-700 dark:text-green-300">R$ {(loan.installment_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>

                        <div className="space-y-4">
                            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                                Deseja confirmar o pagamento de 1 parcela no valor acima?
                            </p>

                            <button
                                onClick={handleConfirmPayment}
                                disabled={processing}
                                className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold shadow-lg shadow-green-600/20 transition disabled:opacity-70"
                            >
                                {processing ? 'Processando...' : 'Confirmar Pagamento'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AV Full Screen Interface */}
            {showAVModal && loan && (
                <div className="fixed inset-0 z-50 bg-[#fcf8f8] dark:bg-gray-950 flex flex-col animate-in slide-in-from-bottom duration-300">
                    <header className="flex justify-between items-center px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 shrink-0">
                        <div className="w-10" />
                        <h1 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tighter">Informar AV</h1>
                        <button onClick={() => setShowAVModal(false)} className="p-2 text-blue-600 dark:text-blue-400">
                            <X className="w-6 h-6" />
                        </button>
                    </header>

                    <main className="flex-1 p-6 space-y-6 overflow-y-auto">
                        {/* Balance Section */}
                        <section className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-6 shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">SALDO DE CRÉDITO ATUAL</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-medium text-gray-400">R$</span>
                                <span className="text-5xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
                                    {(Number(loan.client?.credit_balance) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </section>

                        {/* Input Section */}
                        <section className="space-y-4">
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-900 dark:text-gray-300 px-1 uppercase tracking-tighter">Valor Recebido (R$)</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                                        <span className="text-gray-400 font-black text-xl">R$</span>
                                    </div>
                                    <input
                                        type="number"
                                        value={avAmount}
                                        onChange={(e) => setAvAmount(e.target.value)}
                                        className="block w-full pl-14 pr-4 py-6 bg-white dark:bg-gray-900 border-2 border-transparent focus:border-blue-600 focus:ring-0 rounded-3xl text-4xl font-black text-gray-900 dark:text-white transition-all placeholder-gray-200"
                                        placeholder="0,00"
                                    />
                                </div>
                            </div>

                            {/* Helper Text */}
                            <div className="flex gap-4 p-5 bg-gray-100 dark:bg-gray-900 rounded-3xl">
                                <Info className="w-6 h-6 text-blue-600 shrink-0" />
                                <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400 font-semibold italic">
                                    O valor informado será processado e deduzido do seu saldo de crédito disponível instantaneamente.
                                </p>
                            </div>
                        </section>

                        {/* Action Buttons (Moved closer to input) */}
                        <div className="flex gap-4 pt-4">
                            <button
                                onClick={handleAVPayment}
                                disabled={!avAmount || processing}
                                className="flex-1 bg-blue-600 text-white rounded-2xl py-4 flex flex-col items-center justify-center hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:bg-gray-300 shadow-lg shadow-blue-600/30"
                            >
                                <Calculator className="w-6 h-6 mb-1" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Calcular e Pagar</span>
                            </button>
                            <button
                                onClick={() => setShowAVModal(false)}
                                className="flex-1 text-gray-400 dark:text-gray-600 py-4 flex flex-col items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-all active:scale-[0.98]"
                            >
                                <XCircle className="w-6 h-6 mb-1" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Cancelar</span>
                            </button>
                        </div>
                    </main>
                </div>
            )}

            {/* Mensal/Quinzenal Payment Modal */}
            {showMensalPaymentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowMensalPaymentModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Pagamento de Empréstimo</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Escolha como deseja prosseguir com este empréstimo {loan.frequency.toLowerCase()}.
                            </p>
                        </div>

                        <div className="space-y-3">
                            {/* 1. Pagar Tudo */}
                            <button
                                onClick={() => handleMensalPayment('full')}
                                disabled={processing}
                                className="w-full flex flex-col rounded-2xl overflow-hidden shadow-sm transition-transform active:scale-[0.98] disabled:opacity-70 disabled:scale-100 border border-gray-100 dark:border-gray-800"
                            >
                                <div className="w-full bg-gray-100 dark:bg-gray-800 py-3.5 px-4 flex items-center justify-center gap-2">
                                    <Wallet className="w-4 h-4 text-gray-500" />
                                    <span className="text-[15px] font-extrabold text-[#111827] dark:text-white">
                                        Pagar Tudo e Encerrar
                                    </span>
                                </div>
                                <div className="w-full bg-[#5AAB22] py-2 px-4 flex items-center justify-center">
                                    <span className="text-lg font-black text-white">
                                        R$ {(Number(loan.balance) + fines.reduce((acc, curr) => acc + curr.fine_value, 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </button>

                            {/* 2. Pagar Juros */}
                            <button
                                onClick={() => handleMensalPayment('renew')}
                                disabled={processing}
                                className="w-full flex flex-col rounded-2xl overflow-hidden shadow-sm transition-transform active:scale-[0.98] disabled:opacity-70 disabled:scale-100 border border-gray-100 dark:border-gray-800"
                            >
                                <div className="w-full bg-gray-100 dark:bg-gray-800 py-3.5 px-4 flex items-center justify-center gap-2">
                                    <RefreshCw className="w-4 h-4 text-gray-500" />
                                    <span className="text-[15px] font-extrabold text-[#111827] dark:text-white">
                                        Pagar Juros e Renovar
                                    </span>
                                </div>
                                <div className="w-full bg-[#00AEEF] py-2 px-4 flex items-center justify-center">
                                    <span className="text-lg font-black text-white">
                                        R$ {(Math.max(0, Number(loan.balance) - Number(loan.amount)) + fines.reduce((acc, curr) => acc + curr.fine_value, 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </button>

                            {/* 3. Abater Capital */}
                            <button
                                onClick={() => {
                                    setShowMensalPaymentModal(false);
                                    setShowAmortizationPage(true);
                                }}
                                disabled={processing}
                                className="w-full flex flex-col rounded-2xl overflow-hidden shadow-sm transition-transform active:scale-[0.98] disabled:opacity-70 disabled:scale-100 border border-gray-100 dark:border-gray-800"
                            >
                                <div className="w-full bg-gray-100 dark:bg-gray-800 py-3.5 px-4 flex items-center justify-center gap-2">
                                    <TrendingDown className="w-4 h-4 text-gray-500" />
                                    <span className="text-[15px] font-extrabold text-[#111827] dark:text-white">
                                        Abater Capital
                                    </span>
                                </div>
                                <div className="w-full bg-[#F78B1F] py-2 px-4 flex items-center justify-center">
                                    <span className="text-lg font-black text-white">
                                        R$ {(Number(loan.balance) + fines.reduce((acc, curr) => acc + curr.fine_value, 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </button>

                            <button
                                onClick={() => setShowMensalPaymentModal(false)}
                                className="w-full py-4 text-xs font-bold text-red-500 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors uppercase tracking-wider mt-2"
                            >
                                Cancelar
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

            {/* General Confirmation Modal */}
            {confirmationModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmationModal(prev => ({ ...prev, open: false }))}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle className="w-8 h-8 text-yellow-600 dark:text-yellow-500" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{confirmationModal.title}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">
                                {confirmationModal.message}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setConfirmationModal(prev => ({ ...prev, open: false }))}
                                className="py-3 px-4 rounded-xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmationModal.action}
                                className="py-3 px-4 rounded-xl font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-colors"
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AV Custom Confirmation Modal */}
            {showAVConfirmModal && avConfirmData && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAVConfirmModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-[32px] p-8 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center">
                            {/* Blue Info Circle */}
                            <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-3">
                                <Info className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                            </div>

                            <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-5 tracking-tighter">Confirmar Pagamento AV</h3>

                            {/* Cards Section */}
                            <div className="grid grid-cols-2 gap-3 w-full mb-10">
                                <div className="bg-[#f8f6f6] dark:bg-gray-800/50 p-4 rounded-2xl border-l-4 border-blue-600 flex flex-col items-start text-left">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Parcelas a Pagar</span>
                                    <span className="text-sm font-black text-gray-900 dark:text-white leading-tight">{avConfirmData.paidCount} Parcela(s)</span>
                                </div>
                                <div className="bg-[#f8f6f6] dark:bg-gray-800/50 p-4 rounded-2xl flex flex-col items-start text-left">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Saldo de Crédito</span>
                                    <span className="text-sm font-black text-gray-900 dark:text-white leading-tight">
                                        R$ {avConfirmData.remainingCredit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="w-full space-y-4">
                                <button
                                    onClick={() => executeAVPayment(avConfirmData.paidAmount, avConfirmData.remainingCredit)}
                                    className="w-full bg-[#111827] dark:bg-white text-white dark:text-[#111827] py-5 rounded-3xl font-black text-lg transition-all active:scale-95 shadow-xl shadow-black/10"
                                >
                                    Confirmar
                                </button>
                                <button
                                    onClick={() => setShowAVConfirmModal(false)}
                                    className="w-full py-2 text-sm font-black text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Renew Custom Confirmation Modal */}
            {showRenewConfirmModal && renewConfirmData && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowRenewConfirmModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-[32px] p-8 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-3">
                                <Info className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                            </div>

                            <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-5 tracking-tighter uppercase">
                                {renewConfirmData.type === 'renew' ? 'Renovar Empréstimo' : 'Quitar Empréstimo'}
                            </h3>

                            <div className="w-full space-y-3 mb-10">
                                <div className="bg-[#f8f6f6] dark:bg-gray-800/50 p-5 rounded-2xl border-l-4 border-blue-600 flex flex-col items-start text-left">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-tight">Valor a Pagar Agora</span>
                                    <span className="text-xl font-black text-gray-900 dark:text-white">
                                        R$ {renewConfirmData.amountToPay.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>

                                {renewConfirmData.type === 'renew' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-[#f8f6f6] dark:bg-gray-800/50 p-4 rounded-2xl flex flex-col items-start text-left">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-tight">Novo Vencimento</span>
                                            <span className="text-xs font-black text-gray-900 dark:text-white">{renewConfirmData.nextDueDate}</span>
                                        </div>
                                        <div className="bg-[#f8f6f6] dark:bg-gray-800/50 p-4 rounded-2xl flex flex-col items-start text-left">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-tight">Novo Saldo</span>
                                            <span className="text-xs font-black text-gray-900 dark:text-white leading-tight">
                                                R$ {renewConfirmData.nextValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="w-full space-y-4">
                                <button
                                    onClick={() => executeMensalPayment(renewConfirmData.type)}
                                    className="w-full bg-[#111827] dark:bg-white text-white dark:text-[#111827] py-5 rounded-3xl font-black text-lg transition-all active:scale-95 shadow-xl shadow-black/10"
                                >
                                    Confirmar
                                </button>
                                <button
                                    onClick={() => setShowRenewConfirmModal(false)}
                                    className="w-full py-2 text-sm font-black text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
                                <Trash2 className="w-8 h-8 text-red-600 dark:text-red-500" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Excluir Empréstimo</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                Esta ação é irreversível. Para confirmar, digite sua senha de acesso.
                            </p>

                            <input
                                type="password"
                                value={deletePassword}
                                onChange={(e) => setDeletePassword(e.target.value)}
                                placeholder="Sua senha"
                                className="w-full p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none transition-all"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => {
                                    setShowDeleteModal(false);
                                    setDeletePassword('');
                                }}
                                className="py-3 px-4 rounded-xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDeleteLoan}
                                disabled={!deletePassword || processing}
                                className="py-3 px-4 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
                            >
                                {processing ? 'Excluindo...' : 'Excluir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Charge Options Modal */}
            {showChargeOptionsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowChargeOptionsModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
                                <Banknote className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Opções de Cobrança</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Como deseja cobrar este cliente?
                            </p>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={handleWhatsAppCharge}
                                className="w-full p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 flex items-center gap-4 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors text-left group"
                            >
                                <div className="w-12 h-12 bg-green-100 dark:bg-green-800/50 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform">
                                    <Share2 className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 dark:text-white">WhatsApp</h4>
                                    <p className="text-xs text-gray-500">Enviar mensagem de cobrança</p>
                                </div>
                            </button>

                            <button
                                onClick={handlePixCharge}
                                className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center gap-4 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-left group"
                            >
                                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-800/50 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                                    <QrCode className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 dark:text-white">PIX Rápido</h4>
                                    <p className="text-xs text-gray-500">Gerar QR Code de pagamento</p>
                                </div>
                            </button>

                            <button
                                onClick={() => setShowChargeOptionsModal(false)}
                                className="w-full py-3 px-4 rounded-xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors mt-2"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PIX Type Selection Modal */}
            {showPixTypeSelectionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPixTypeSelectionModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Tipo de Cobrança PIX</h3>
                            <button onClick={() => setShowPixTypeSelectionModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                            Selecione o tipo de cobrança para este empréstimo mensal.
                        </p>

                        <div className="space-y-3">
                            <button
                                onClick={() => handleSelectPixType('full')}
                                className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center gap-4 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-left group"
                            >
                                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-800/50 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                                    <Check className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 dark:text-white">Cobrar Quitação</h4>
                                    <p className="text-xs text-gray-500">Valor Total: R$ {Number(loan?.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                            </button>

                            <button
                                onClick={() => handleSelectPixType('renew')}
                                className="w-full p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 flex items-center gap-4 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors text-left group"
                            >
                                <div className="w-12 h-12 bg-green-100 dark:bg-green-800/50 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform">
                                    <RefreshCw className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 dark:text-white">Cobrar Renovação</h4>
                                    <p className="text-xs text-gray-500">Apenas Juros: R$ {(Number(loan?.amount) * (Number(loan?.interest_rate) / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                            </button>

                            <button
                                onClick={() => handleSelectPixType('manual')}
                                className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left group"
                            >
                                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-400 group-hover:scale-110 transition-transform">
                                    <Edit2 className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 dark:text-white">Outro Valor</h4>
                                    <p className="text-xs text-gray-500">Digitar valor manualmente</p>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PIX Modal */}
            {showPixModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPixModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Cobrança via PIX</h3>
                            <button onClick={() => setShowPixModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Valor da Cobrança (R$)
                                </label>
                                <input
                                    type="number"
                                    value={pixAmount}
                                    onChange={(e) => {
                                        setPixAmount(e.target.value);
                                        generatePix(e.target.value);
                                    }}
                                    className="w-full p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-lg font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
                                    placeholder="0,00"
                                />
                            </div>

                            {pixPayload && (
                                <div className="flex flex-col items-center p-4 bg-white dark:bg-white rounded-xl border border-gray-200 shadow-sm">
                                    <img
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixPayload)}`}
                                        alt="QR Code PIX"
                                        className="w-48 h-48 mb-4"
                                    />
                                    <p className="text-xs text-center text-gray-500 mb-3 break-all px-2">
                                        {pixPayload.substring(0, 30)}...
                                    </p>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(pixPayload);
                                            setAlertModal({
                                                open: true,
                                                title: 'Copiado',
                                                message: 'Código PIX Copia e Cola copiado com sucesso!'
                                            });
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-200 transition-colors"
                                    >
                                        <Copy className="w-4 h-4" />
                                        Copiar Código
                                    </button>
                                </div>
                            )}

                            {userSettings?.pix_keys && userSettings.pix_keys.length > 1 && (
                                <div className="mb-3 text-left">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">
                                        Receber na Chave / Conta:
                                    </label>
                                    <select
                                        value={selectedPixKeyId}
                                        onChange={(e) => {
                                            const chosenId = e.target.value;
                                            setSelectedPixKeyId(chosenId);
                                            const chosen = userSettings.pix_keys?.find((k: any) => k.id === chosenId);
                                            if (chosen) {
                                                generatePix(pixAmount, chosen.pix_key || chosen.key, chosen.holder_name || chosen.beneficiary);
                                            }
                                        }}
                                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-xs font-bold text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                    >
                                        {userSettings.pix_keys.map((k: any) => (
                                            <option key={k.id} value={k.id}>
                                                {k.financial_institution ? `${k.financial_institution.split('(')[0].trim()} - ` : ''}
                                                {(k.key_type || k.type || 'PIX').toUpperCase()}: {k.pix_key || k.key} {k.is_default ? '(Principal)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {(() => {
                                const currentItem = selectedPixKeyId && userSettings?.pix_keys
                                    ? userSettings.pix_keys.find((k: any) => k.id === selectedPixKeyId)
                                    : null;
                                const displayKey = currentItem?.pix_key || currentItem?.key || userSettings?.pix_key;
                                const displayBeneficiary = currentItem?.holder_name || currentItem?.beneficiary || userSettings?.pix_beneficiary || 'Não informado';
                                const displayBank = currentItem?.financial_institution;

                                return (
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800 text-left space-y-1">
                                        <p className="text-xs text-blue-700 dark:text-blue-300">
                                            <span className="font-bold">Chave PIX:</span> {displayKey}
                                        </p>
                                        <p className="text-xs text-blue-700 dark:text-blue-300">
                                            <span className="font-bold">Beneficiário:</span> {displayBeneficiary}
                                        </p>
                                        {displayBank && (
                                            <p className="text-xs text-blue-700 dark:text-blue-300">
                                                <span className="font-bold">Banco:</span> {displayBank}
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

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

            {/* Interest Breakdown Modal */}
            {showInterestBreakdownModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowInterestBreakdownModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Detalhamento de Juros</h3>
                            <button onClick={() => setShowInterestBreakdownModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-800 mb-4">
                                <p className="text-xs text-green-600 dark:text-green-400 font-bold uppercase mb-1">Total Recebido</p>
                                <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                                    R$ {displayTotalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Principal (Valor Emprestado)</span>
                                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                                        R$ {originalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Juros do Contrato</span>
                                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                                        R$ {Math.max(0, ((loan.installment_value || 0) * (loan.installments || 1)) - originalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Juros Adicionais / Multas</span>
                                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                                        R$ {Math.max(0, displayTotalPaid - ((loan.installment_value || 0) * (loan.installments || 1))).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center pt-2">
                                    <span className="text-base font-bold text-gray-900 dark:text-white">Lucro Total (Juros)</span>
                                    <span className="text-xl font-bold text-green-600 dark:text-green-400">
                                        R$ {Math.max(0, displayTotalPaid - originalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowInterestBreakdownModal(false)}
                                className="w-full mt-6 bg-primary dark:bg-white text-white dark:text-primary py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 transition active:scale-[0.98]"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Fine Modal */}
            {showFineModal && fineInstallment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFineModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                {fineInstallment.fine ? 'Gerenciar Multa' : 'Aplicar Multa'}
                            </h3>
                            <button onClick={() => setShowFineModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <p className="text-sm text-gray-500">
                                {fineInstallment.fine ? 'Editando' : 'Aplicando'} multa na parcela #{fineInstallment.number} de R$ {fineInstallment.originalValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || fineInstallment.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Valor da Multa (R$)
                                </label>
                                <input
                                    type="number"
                                    value={fineFixed}
                                    onChange={(e) => setFineFixed(e.target.value)}
                                    className="w-full p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-lg font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
                                    placeholder="R$ 0,00"
                                />
                            </div>

                            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl border border-yellow-100 dark:border-yellow-800">
                                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                                    A multa será somada ao valor total da parcela.
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 mt-4">
                                <button
                                    onClick={handleSaveFine}
                                    disabled={processing}
                                    className="w-full bg-primary dark:bg-white text-white dark:text-primary py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 transition active:scale-[0.98] disabled:opacity-70"
                                >
                                    {processing ? 'Processando...' : (fineInstallment.fine ? 'Atualizar Multa' : 'Confirmar Aplicação')}
                                </button>

                                {fineInstallment.fine && (
                                    <button
                                        onClick={handleRemoveFine}
                                        disabled={processing}
                                        className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 py-4 rounded-2xl font-bold border border-red-100 dark:border-red-800 transition active:scale-[0.98] disabled:opacity-70"
                                    >
                                        Remover Multa
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Installment Detail Modal */}
            {selectedInstallmentForDetail && (() => {
                const inst = selectedInstallmentForDetail;
                const dueDate = inst.originalDate || inst.date;
                const today = new Date();
                const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const dueDateZero = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
                const diffTime = todayZero.getTime() - dueDateZero.getTime();
                const daysLate = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

                const pendingInsts = installmentsList.filter(i => i.status !== 'paid');
                const isNextPending = pendingInsts.length > 0 && pendingInsts[0].number === inst.number;

                // Determinar a data REAL de pagamento da parcela
                const storedDateStr = loan ? getStoredPaidDates(loan.id)[inst.number] : null;
                let paymentDate: Date;
                if (inst.paidAt) {
                    paymentDate = inst.paidAt;
                } else if (storedDateStr) {
                    paymentDate = new Date(storedDateStr);
                } else if (inst.status === 'paid') {
                    if (dueDateZero.getTime() > todayZero.getTime()) {
                        // Vencimento futuro: pagamento foi antecipado (hoje)
                        paymentDate = today;
                    } else {
                        paymentDate = inst.date;
                    }
                } else {
                    paymentDate = today;
                }

                const payZero = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), paymentDate.getDate());
                const isPaidInAdvance = inst.status === 'paid' && dueDateZero.getTime() > payZero.getTime();

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedInstallmentForDetail(null)}></div>
                        <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200 border border-gray-100 dark:border-gray-800">
                            {/* Modal Header */}
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                        Parcela #{String(inst.number).padStart(2, '0')}
                                    </h3>
                                    <div className="mt-1">
                                        {inst.status === 'paid' ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40 text-[11px] font-bold">
                                                <CheckCircle2 className="w-3.5 h-3.5" /> Paga e Confirmada
                                            </span>
                                        ) : inst.status === 'late' ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-800/40 text-[11px] font-bold">
                                                <AlertTriangle className="w-3.5 h-3.5" /> Em Atraso ({daysLate} dia{daysLate > 1 ? 's' : ''})
                                            </span>
                                        ) : inst.status === 'pending' ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/40 text-[11px] font-bold">
                                                <Clock className="w-3.5 h-3.5" /> Vence Hoje
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 text-[11px] font-bold">
                                                <Calendar className="w-3.5 h-3.5" /> A Vencer
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button onClick={() => setSelectedInstallmentForDetail(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            {/* Financial Breakdown */}
                            <div className="space-y-3">
                                {Boolean((inst.accumulatedInterest && inst.accumulatedInterest > 0.01) || inst.fine) && (
                                    <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-gray-800/50">
                                        <span className="text-xs text-gray-500 dark:text-gray-400">Valor Original</span>
                                        <span className="text-xs font-semibold text-gray-900 dark:text-white">
                                            R$ {inst.originalValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                )}

                                {Boolean(inst.accumulatedInterest && inst.accumulatedInterest > 0.01) && (
                                    <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-gray-800/50">
                                        <span className="text-xs text-danger font-medium">Juros Acumulados</span>
                                        <span className="text-xs font-bold text-danger">
                                            + R$ {inst.accumulatedInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                )}

                                {inst.fine && (
                                    <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-gray-800/50">
                                        <span className="text-xs text-red-500 font-medium">Multa Manual ({inst.fine.fine_type === 'percent' ? `${inst.fine.fine_value}%` : 'Fixa'})</span>
                                        <span className="text-xs font-bold text-red-500">
                                            + R$ {inst.fine.fine_type === 'percent'
                                                ? ((inst.originalValue || 0) * (inst.fine.fine_value / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                : inst.fine.fine_value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                            }
                                        </span>
                                    </div>
                                )}

                                <div className="flex justify-between items-center pt-2">
                                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                                        {Boolean((inst.accumulatedInterest && inst.accumulatedInterest > 0.01) || inst.fine) ? 'Total Atual' : 'Valor da Parcela'}
                                    </span>
                                    <span className="text-xl font-black text-primary dark:text-white">
                                        R$ {inst.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>

                                {/* Dates Section: Vencimento & Pagamento */}
                                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-3">
                                    {/* Data de Vencimento */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-gray-400" />
                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Vencimento</span>
                                        </div>
                                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                            {dueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </span>
                                    </div>

                                    {/* Data de Pagamento */}
                                    <div className="flex items-center justify-between pt-2.5 border-t border-gray-100 dark:border-gray-700/60">
                                        <div className="flex items-center gap-2">
                                            {inst.status === 'paid' ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                            ) : (
                                                <Clock className="w-4 h-4 text-gray-400" />
                                            )}
                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                {inst.status === 'paid' ? 'Data do Pagamento' : 'Pagamento'}
                                            </span>
                                        </div>
                                        {inst.status === 'paid' ? (
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                                    {paymentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </span>
                                                {isPaidInAdvance && (
                                                    <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded">
                                                        Antecipada
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                                                Hoje ({today.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })})
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="space-y-2.5 mt-5">
                                {/* Botão Pagar Agora (se for a próxima pendente) */}
                                {inst.status !== 'paid' && isNextPending && (
                                    <button
                                        onClick={() => {
                                            setSelectedInstallmentForDetail(null);
                                            setShowSinglePaymentConfirmModal(true);
                                        }}
                                        className="w-full bg-[#5AAB22] hover:bg-[#4E961D] text-white py-3.5 rounded-2xl font-bold shadow-md shadow-emerald-600/20 transition active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
                                    >
                                        <Check className="w-4 h-4 stroke-[3]" />
                                        Pagar esta Parcela Agora
                                    </button>
                                )}

                                {/* Aviso se tentar pagar parcela futura pulando anteriores */}
                                {inst.status !== 'paid' && !isNextPending && pendingInsts.length > 0 && (
                                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/40 rounded-xl text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                                        <Info className="w-4 h-4 shrink-0" />
                                        <span>A parcela #{String(pendingInsts[0].number).padStart(2, '0')} deve ser quitada antes desta.</span>
                                    </div>
                                )}

                                {/* Botão Recibo (se já estiver paga) */}
                                {inst.status === 'paid' && (
                                    <button
                                        onClick={() => {
                                            const data = {
                                                amount: inst.value,
                                                date: paymentDate.toLocaleDateString('pt-BR'),
                                                clientName: loan.client?.name || 'Cliente',
                                                contractId: loan.id.substring(0, 6).toUpperCase(),
                                                installmentNumber: inst.number,
                                                dueDate: (inst.originalDate || inst.date).toLocaleDateString('pt-BR'),
                                                status: 'paid',
                                                originalValue: inst.originalValue,
                                                interest: inst.accumulatedInterest,
                                                fine: inst.fine?.fine_value,
                                                fineType: inst.fine?.fine_type,
                                                totalPaid: inst.value,
                                                creditBalance: loan.client?.credit_balance,
                                                authenticationCode: Math.random().toString(36).substring(2, 15).toUpperCase().match(/.{1,4}/g)?.join('-') || 'AUTH-CODE'
                                            };
                                            setReceiptData(data);
                                            setSelectedInstallmentForDetail(null);
                                            setShowReceiptImageModal(true);
                                        }}
                                        className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 py-3 rounded-2xl font-bold transition active:scale-[0.98] flex items-center justify-center gap-2 text-xs border border-gray-200 dark:border-gray-700"
                                    >
                                        <FileText className="w-4 h-4" />
                                        Visualizar Recibo
                                    </button>
                                )}

                                {/* Botão Gerenciar / Aplicar Multa */}
                                {(inst.status === 'late' || inst.fine) && inst.status !== 'paid' && (
                                    <button
                                        onClick={() => {
                                            setFineInstallment(inst);
                                            setFineFixed(inst.fine ? String(inst.fine.fine_value) : '');
                                            setShowFineModal(true);
                                            setSelectedInstallmentForDetail(null);
                                        }}
                                        className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 py-3 rounded-2xl font-bold border border-red-100 dark:border-red-800 transition active:scale-[0.98] flex items-center justify-center gap-2 text-xs"
                                    >
                                        <AlertTriangle className="w-4 h-4" />
                                        {inst.fine ? 'Gerenciar Multa' : 'Aplicar Multa'}
                                    </button>
                                )}

                                <button
                                    onClick={() => setSelectedInstallmentForDetail(null)}
                                    className="w-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-3 rounded-2xl font-bold transition active:scale-[0.98] text-xs"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Receipt Image Modal */}
            {showReceiptImageModal && receiptData && (
                <ReceiptModal
                    isOpen={showReceiptImageModal}
                    onClose={() => setShowReceiptImageModal(false)}
                    data={receiptData}
                />
            )}

            {/* Extract Image Modal */}
            {showExtractImageModal && extractData && (
                <ExtractModal
                    isOpen={showExtractImageModal}
                    onClose={() => setShowExtractImageModal(false)}
                    data={extractData}
                />
            )}

            {/* Payment Request Review Modal */}
            {showPaymentRequestModal && selectedPaymentRequest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPaymentRequestModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Verificar Pagamento</h3>
                            <button onClick={() => setShowPaymentRequestModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                                <X className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>

                        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-100 dark:border-amber-800 mb-4">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                    <Clock className="w-5 h-5 text-amber-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                                        Parcela #{String(selectedPaymentRequest.installment_number).padStart(2, '0')}
                                    </p>
                                    <p className="text-[10px] text-amber-600">
                                        {selectedPaymentRequest.client_name || 'Cliente'} informou pagamento
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-amber-700">Valor informado:</span>
                                <span className="text-xl font-black text-amber-900 dark:text-amber-200">
                                    R$ {Number(selectedPaymentRequest.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <p className="text-[10px] text-amber-500 mt-2">
                                Informado em {new Date(selectedPaymentRequest.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>

                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
                            Verifique em seu banco se o PIX foi recebido. Ao confirmar, você poderá registrar o pagamento. Ao rejeitar, o cliente será notificado.
                        </p>

                        <div className="space-y-2.5">
                            <button
                                onClick={() => handleConfirmPaymentRequest(selectedPaymentRequest)}
                                disabled={processingRequest}
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-green-600 text-white active:scale-[0.98] transition-all disabled:opacity-60"
                            >
                                {processingRequest ? 'Processando...' : <><Check className="w-4 h-4" /> Confirmar Recebimento</>}
                            </button>
                            <button
                                onClick={() => handleRejectPaymentRequest(selectedPaymentRequest)}
                                disabled={processingRequest}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 active:scale-[0.98] transition-all disabled:opacity-60"
                            >
                                <X className="w-4 h-4" /> Rejeitar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Portal Link Modal */}
            {showPortalLinkModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPortalLinkModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Link do Cliente</h3>
                            <button onClick={() => setShowPortalLinkModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                                <X className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>

                        {portalLinkLoading ? (
                            <div className="flex items-center justify-center py-10">
                                <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
                            </div>
                        ) : portalLink ? (
                            <div className="space-y-4">
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Compartilhe este link com <strong>{loan.client?.name || 'o cliente'}</strong> para que acompanhe o empréstimo e realize pagamentos.
                                </p>

                                {/* Link Display */}
                                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 break-all">
                                    <p className="text-xs font-mono text-blue-600 dark:text-blue-400">{portalLink}</p>
                                </div>

                                {/* Actions */}
                                <div className="space-y-2.5">
                                    <button
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(portalLink);
                                                setPortalLinkCopied(true);
                                                setTimeout(() => setPortalLinkCopied(false), 3000);
                                            } catch {}
                                        }}
                                        className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all ${
                                            portalLinkCopied
                                                ? 'bg-green-100 text-green-700 border border-green-200'
                                                : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 active:scale-[0.98]'
                                        }`}
                                    >
                                        {portalLinkCopied ? <><Check className="w-4 h-4" /> Link Copiado!</> : <><Copy className="w-4 h-4" /> Copiar Link</>}
                                    </button>

                                    <button
                                        onClick={() => {
                                            const message = `Olá, ${loan.client?.name || ''}!\n\nAcompanhe seu empréstimo pelo link abaixo:\n\n${portalLink}\n\nPor lá você pode ver suas parcelas e realizar pagamentos.`;
                                            openWhatsApp(loan.client?.phone || '', message);
                                        }}
                                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-green-600 text-white active:scale-[0.98] transition-all"
                                    >
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                        Enviar via WhatsApp
                                    </button>

                                    <button
                                        onClick={() => window.open(portalLink, '_blank')}
                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" /> Visualizar Portal
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-red-500 text-center py-6">Erro ao gerar link. Tente novamente.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};