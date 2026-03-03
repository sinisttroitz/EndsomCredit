import React, { useEffect, useState } from 'react';
import { ChevronLeft, MoreHorizontal, Check, Clock, Circle, Banknote, FileText, X, PlusCircle, AlertTriangle, Share2, Trash2, QrCode, Copy, Calendar, RefreshCw, Edit2, Plus } from 'lucide-react';
import { generatePixPayload } from '../utils/pixUtils';
import { supabase } from '../supabaseClient';
import { Loan, Installment, InstallmentFine } from '../types';
import { generateInstallments } from '../utils/loanUtils';
import { processRecurringInterest } from '../utils/interestUtils';

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
    const [showAVModal, setShowAVModal] = useState(false);
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

    // Fine State
    const [fines, setFines] = useState<InstallmentFine[]>([]);
    const [showFineModal, setShowFineModal] = useState(false);
    const [fineInstallment, setFineInstallment] = useState<Installment | null>(null);
    const [fineFixed, setFineFixed] = useState('');
    const [activeActionMenu, setActiveActionMenu] = useState<number | null>(null);
    
    // Batch Payment State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedInstallments, setSelectedInstallments] = useState<number[]>([]);
    const [confirmationModal, setConfirmationModal] = useState<{
        open: boolean;
        title: string;
        message: string;
        action: () => void;
    }>({ open: false, title: '', message: '', action: () => {} });

    const [selectedInstallmentForDetail, setSelectedInstallmentForDetail] = useState<Installment | null>(null);

    const [userSettings, setUserSettings] = useState<{
        pix_key: string;
        pix_beneficiary: string;
        city: string;
    } | null>(null);

    useEffect(() => {
        if (loanId) {
            fetchLoanData();
            fetchUserSettings();
        }
    }, [loanId]);

    const fetchUserSettings = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();
            if (data) {
                setUserSettings(data);
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

        setConfirmationModal({
            open: true,
            title: 'Confirmar Pagamento em Lote',
            message: `Confirma o pagamento de ${selectedInstallments.length} parcela(s)?`,
            action: executeBatchPayment
        });
    };

    const executeBatchPayment = async () => {
        if (!loan) return;
        setConfirmationModal(prev => ({ ...prev, open: false }));
        setProcessing(true);
        try {
            // Calculate total value of selected installments
            const selectedValue = installmentsList
                .filter(i => selectedInstallments.includes(i.number))
                .reduce((acc, curr) => acc + curr.value, 0);

            const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
            
            let newBalance = Number(loan.balance) - selectedValue;
            if (newBalance < 0.01) newBalance = 0;
            
            const newProgress = Math.max(0, Math.min(100, Math.round(((totalDebt - newBalance) / totalDebt) * 100)));
            const newStatus = newBalance === 0 ? 'paid' : 'active';

            const currentAmountPaid = loan.amount_paid !== undefined && loan.amount_paid !== null 
                ? Number(loan.amount_paid) 
                : Math.max(0, totalDebt - Number(loan.balance)) + (Number(loan.total_interest_paid) || 0);
            
            const newAmountPaid = currentAmountPaid + selectedValue;

            const { error } = await supabase
                .from('loans')
                .update({ 
                    balance: newBalance,
                    progress: newProgress,
                    status: newStatus,
                    amount_paid: newAmountPaid
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

    const handleAVPayment = () => {
        if (!loan || !avAmount) return;
        
        const amount = Number(avAmount.replace(',', '.'));
        if (isNaN(amount) || amount <= 0) {
            alert("Valor inválido");
            return;
        }

        const currentCredit = Number(loan.client?.credit_balance) || 0;
        let totalAvailable = amount + currentCredit;
        
        // Filter unpaid installments and sort by date (number)
        const unpaidInstallments = installmentsList
            .filter(i => i.status !== 'paid')
            .sort((a, b) => a.number - b.number);
            
        let paidAmount = 0;
        let paidCount = 0;
        
        // Calculate how many installments can be paid
        for (const inst of unpaidInstallments) {
            // Use a small epsilon for float comparison to avoid issues like 100.00000000001 > 100
            if (totalAvailable >= inst.value - 0.01) {
                totalAvailable -= inst.value;
                paidAmount += inst.value;
                paidCount++;
            } else {
                break;
            }
        }
        
        const message = paidCount === 0 
            ? `O valor R$ ${amount.toFixed(2)} será adicionado ao saldo de crédito do cliente. Confirmar?`
            : `Confirmar pagamento de ${paidCount} parcela(s)? Restará R$ ${totalAvailable.toFixed(2)} de crédito.`;

        setConfirmationModal({
            open: true,
            title: 'Confirmar Pagamento AV',
            message,
            action: () => executeAVPayment(paidAmount, totalAvailable)
        });
    };

    const executeAVPayment = async (paidAmount: number, newCreditBalance: number) => {
        if (!loan) return;
        setConfirmationModal(prev => ({ ...prev, open: false }));
        setProcessing(true);
        
        try {
            // Update Loan
            const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
            let newBalance = Number(loan.balance) - paidAmount;
            if (newBalance < 0.01) newBalance = 0;
            
            const newProgress = Math.max(0, Math.min(100, Math.round(((totalDebt - newBalance) / totalDebt) * 100)));
            const newStatus = newBalance === 0 ? 'paid' : 'active';
            
            const currentAmountPaid = loan.amount_paid !== undefined && loan.amount_paid !== null 
                ? Number(loan.amount_paid) 
                : Math.max(0, totalDebt - Number(loan.balance)) + (Number(loan.total_interest_paid) || 0);
            
            const newAmountPaid = currentAmountPaid + paidAmount;

            const { error: loanError } = await supabase
                .from('loans')
                .update({ 
                    balance: newBalance,
                    progress: newProgress,
                    status: newStatus,
                    amount_paid: newAmountPaid
                })
                .eq('id', loan.id);
                
            if (loanError) throw loanError;
            
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
            alert("Erro ao processar pagamento AV.");
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
                const valor = firstUnpaid.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                const data = (firstUnpaid.originalDate || firstUnpaid.date).toLocaleDateString('pt-BR');

                const extras = [];
                if (firstUnpaid.accumulatedInterest && firstUnpaid.accumulatedInterest > 0) {
                    extras.push(`R$ ${firstUnpaid.accumulatedInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de juros por atraso`);
                }
                if (firstUnpaid.fine) {
                    extras.push(`R$ ${firstUnpaid.fine.fine_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de multa manual`);
                }
                
                const infoAdicional = extras.length > 0 ? ` (incluindo ${extras.join(' e ')})` : '';

                message = `Olá, ${nome},\n\nConforme consta em nosso sistema, identificamos a seguinte parcela em aberto:\n\nParcela nº: ${parcela}\n\nValor: R$ ${valor}${infoAdicional}\n\nContrato: ${contrato}\n\nVencimento: ${data}\n\nSolicitamos, por gentileza, a regularização do pagamento para evitar a incidência de encargos adicionais.\n\nCaso o pagamento já tenha sido efetuado, pedimos a gentileza de desconsiderar esta mensagem.`;
            } else {
                const totalValue = overdueInstallments.reduce((acc, curr) => acc + curr.value, 0);
                const valorTotalFormatado = totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                const parcelasStr = overdueInstallments.map(i => i.number).join(', ');
                
                let detalhesParcelas = '';
                overdueInstallments.forEach(i => {
                    const data = (i.originalDate || i.date).toLocaleDateString('pt-BR');
                    const valor = i.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    
                    const extras = [];
                    if (i.accumulatedInterest && i.accumulatedInterest > 0) {
                        extras.push(`R$ ${i.accumulatedInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de juros`);
                    }
                    if (i.fine) {
                        extras.push(`R$ ${i.fine.fine_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de multa`);
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
                const valor = firstUnpaid.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                const contrato = loan.id.substring(0, 6);
                const data = (firstUnpaid.originalDate || firstUnpaid.date).toLocaleDateString('pt-BR');

                message = `Olá, ${nome}.\n\nLembramos que a parcela nº ${parcela} no valor de R$ ${valor}, referente ao contrato ${contrato}, vence em ${data}.\n\nCaso já tenha efetuado o pagamento, favor desconsiderar esta mensagem.`;
            } else {
                message = `Olá, ${loan.client.name}.\n\nEstamos entrando em contato referente ao seu contrato ${loan.id.substring(0, 6)}.`;
            }
        }
        
        const encodedMessage = encodeURIComponent(message);
        const phone = loan.client.phone.replace(/\D/g, '');
        const whatsappUrl = `https://wa.me/55${phone}?text=${encodedMessage}`;
        
        window.open(whatsappUrl, '_blank');
        setShowChargeOptionsModal(false);
    };

    const handlePixCharge = () => {
        if (!userSettings?.pix_key) {
            alert("Você precisa configurar sua chave PIX no perfil antes de usar esta função.");
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

    const generatePix = (amountStr: string) => {
        if (!userSettings?.pix_key) return;
        
        const amount = parseFloat(amountStr.replace(',', '.'));
        if (isNaN(amount) || amount <= 0) {
            setPixPayload('');
            return;
        }

        const payload = generatePixPayload(
            userSettings.pix_key,
            userSettings.pix_beneficiary || 'Recebedor',
            userSettings.city || 'Cidade',
            amount,
            loan?.id.substring(0, 20) // Transaction ID
        );
        setPixPayload(payload);
    };

    const handleDeleteLoan = async () => {
        if (!deletePassword) {
            alert("Por favor, informe sua senha.");
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
                alert("Senha incorreta.");
                setProcessing(false);
                return;
            }

            const { error: deleteError } = await supabase
                .from('loans')
                .delete()
                .eq('id', loanId);

            if (deleteError) throw deleteError;

            alert("Empréstimo excluído com sucesso.");
            onBack(); 
        } catch (error) {
            console.error(error);
            alert("Erro ao excluir empréstimo.");
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
            setInstallmentsList(list);
        } catch (error) {
            console.error("Error fetching loan details", error);
        } finally {
            setLoading(false);
        }
    };



    const handleApplyFine = async () => {
        if (!loan || !fineInstallment) return;

        setProcessing(true);
        try {
            let fineValue = 0;
            const fineType: 'percent' | 'fixed' = 'fixed';

            if (fineFixed) {
                const fixed = parseFloat(fineFixed.replace(',', '.'));
                if (isNaN(fixed) || fixed <= 0) {
                    alert("Valor da multa inválido");
                    setProcessing(false);
                    return;
                }
                fineValue = fixed;
            } else {
                alert("Informe o valor da multa");
                setProcessing(false);
                return;
            }

            const { error } = await supabase
                .from('installment_fines')
                .insert({
                    loan_id: loan.id,
                    installment_number: fineInstallment.number,
                    fine_value: fineValue,
                    fine_type: fineType
                });

            if (error) throw error;

            setShowFineModal(false);
            setFineFixed('');
            setFineInstallment(null);
            await fetchLoanData();

        } catch (error) {
            console.error("Error applying fine", error);
            alert("Erro ao aplicar multa");
        } finally {
            setProcessing(false);
        }
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
            const newProgress = Math.max(0, Math.min(100, Math.round(((totalDebt - newBalance) / totalDebt) * 100)));
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
            
            setShowSinglePaymentConfirmModal(false);
            await fetchLoanData(); 
            
        } catch (error) {
            console.error(error);
            alert("Erro ao registrar pagamento.");
        } finally {
            setProcessing(false);
        }
    };

    const handleMensalPayment = (type: 'full' | 'renew') => {
        if (!loan) return;

        const title = type === 'full' ? 'Quitar Empréstimo' : 'Renovar Empréstimo';
        let message = '';

        if (type === 'full') {
            message = "Tem certeza que deseja quitar todo o empréstimo?";
        } else {
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
            const formattedBalance = newBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            message = `Deseja pagar os juros e renovar o empréstimo?\n\nNova Data de Vencimento: ${formattedDate}\nNovo Valor do Empréstimo: R$ ${formattedBalance}`;
        }
            
        setConfirmationModal({
            open: true,
            title,
            message,
            action: () => executeMensalPayment(type)
        });
    };

    const executeMensalPayment = async (type: 'full' | 'renew') => {
        if (!loan) return;
        setConfirmationModal(prev => ({ ...prev, open: false }));
        setProcessing(true);
        try {
            let updates: any = {};
            
            const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
            const currentAmountPaid = loan.amount_paid !== undefined && loan.amount_paid !== null 
                ? Number(loan.amount_paid) 
                : Math.max(0, totalDebt - Number(loan.balance)) + (Number(loan.total_interest_paid) || 0);

            if (type === 'full') {
                updates = {
                    balance: 0,
                    status: 'paid',
                    progress: 100,
                    amount_paid: currentAmountPaid + Number(loan.balance)
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
                
                // Calculate interest paid in this renewal (Current Balance - Principal)
                const interestPaid = Math.max(0, Number(loan.balance) - principal);
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
            
            setShowMensalPaymentModal(false);
            await fetchLoanData();
            
            if (type === 'renew') {
                alert("Empréstimo renovado com sucesso! Novo vencimento em 30 dias.");
            }
            
        } catch (error) {
            console.error(error);
            alert("Erro ao processar pagamento.");
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
            
            let valueDetails = `💲 Valor: R$ ${lastPaid.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            
            if (lastPaid.fine) {
                valueDetails = `💲 Valor Original: R$ ${lastPaid.originalValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
⚠️ Multa: ${lastPaid.fine.fine_type === 'percent' ? `${lastPaid.fine.fine_value}%` : `R$ ${lastPaid.fine.fine_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
💲 Total Pago: R$ ${lastPaid.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            }

            text = `
🧾 *COMPROVANTE DE PAGAMENTO*
--------------------------------
📅 Data: ${now}
👤 Cliente: ${loan.client?.name}
📄 Contrato: #${loan.id.substring(0, 6)}
--------------------------------
💰 *Parcela #${lastPaid.number}*
${valueDetails}
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
    const totalPaid = Math.max(0, totalDebt - Number(loan.balance));
    const percentage = Math.max(0, loan.progress || 0);
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
                        <h2 className="text-4xl font-bold text-primary dark:text-white mb-2 tracking-tight">
                            R$ {installmentsList.reduce((acc, inst) => inst.status !== 'paid' ? acc + inst.value : acc, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </h2>
                        <div className="flex items-center gap-2 mt-2">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold border uppercase ${
                                displayStatus === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' :
                                displayStatus === 'late' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' :
                                displayStatus === 'paid' ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700' :
                                'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800'
                            }`}>
                                {displayStatus === 'active' ? 'EM DIA' : displayStatus === 'late' ? 'ATRASADO' : displayStatus === 'paid' ? 'QUITADO' : 'PENDENTE'}
                            </span>
                            
                            <button
                                onClick={handleCharge}
                                className={`px-3 py-1 rounded-full text-[10px] font-bold border uppercase transition-all flex items-center gap-1 cursor-pointer hover:opacity-80 ${
                                    isLate 
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' 
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                                }`}
                            >
                                <Banknote className="w-3 h-3" />
                                Cobrar
                            </button>
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
                                background: `conic-gradient(${displayStatus === 'late' ? '#EF4444' : '#10B981'} ${percentage}%, #E5E7EB 0)`
                            } as React.CSSProperties}
                        >
                            <div className="absolute inset-3 rounded-full bg-card-light dark:bg-card-dark flex items-center justify-center shadow-sm">
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
                        <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold mb-1">Valor Solicitado</p>
                        <p className="font-bold text-gray-900 dark:text-white">R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold mb-1">Total Pago</p>
                        <p className="font-bold text-secondary">R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold mb-1">Taxa de Juros</p>
                        <p className="font-bold text-gray-900 dark:text-white">
                            {loan.interest_rate}% {loan.frequency === 'Semanal' ? 'a.s.' : loan.frequency === 'Diária' ? 'a.d.' : loan.frequency === 'Quinzenal' ? 'a.q.' : 'a.m.'}
                        </p>
                    </div>
                    <div className="bg-card-light dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold mb-1">Crédito Disponível</p>
                        <p className="font-bold text-blue-600 dark:text-blue-400">
                            R$ {(Number(loan.client?.credit_balance) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                                             inst.status === 'late' ? `Vencido desde ${(inst.originalDate || inst.date).toLocaleDateString()}` :
                                             inst.status === 'pending' ? `Vence em ${inst.date.toLocaleDateString()}` :
                                             `Prevista para ${inst.date.toLocaleDateString()}`}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        {Boolean(inst.accumulatedInterest && inst.accumulatedInterest > 0 && inst.originalValue && Math.abs(inst.value - inst.originalValue) > 0.01) && (
                                            <p className="text-[10px] text-gray-400 line-through leading-none mb-0.5">
                                                R$ {inst.originalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </p>
                                        )}
                                        {Boolean(inst.accumulatedInterest && inst.accumulatedInterest > 0) && (
                                            <p className="text-[10px] text-red-500 font-bold leading-none mb-0.5">
                                                + Juros R$ {inst.accumulatedInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </p>
                                        )}
                                        {inst.fine && (
                                            <p className="text-[10px] text-red-500 font-bold leading-none mb-0.5">
                                                + Multa {inst.fine.fine_type === 'percent' ? `${inst.fine.fine_value}%` : `R$ ${inst.fine.fine_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                            </p>
                                        )}
                                        <div className="flex items-center justify-end gap-2">
                                            <p className={`text-sm font-bold ${
                                                inst.status === 'paid' ? 'text-secondary' :
                                                inst.status === 'late' ? 'text-danger' :
                                                inst.status === 'pending' ? 'text-accent-blue' : 'text-gray-500'
                                            }`}>
                                                R$ {inst.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </p>
                                            {inst.status === 'late' && !inst.fine && !isSelectionMode && (
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActiveActionMenu(activeActionMenu === inst.number ? null : inst.number);
                                                        }}
                                                        className="w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                    
                                                    {activeActionMenu === inst.number && (
                                                        <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 shadow-xl rounded-xl border border-gray-100 dark:border-gray-700 p-1 min-w-[140px] animate-in fade-in zoom-in duration-200">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setFineInstallment(inst);
                                                                    setShowFineModal(true);
                                                                    setActiveActionMenu(null);
                                                                }}
                                                                className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-2"
                                                            >
                                                                <AlertTriangle className="w-3 h-3" />
                                                                Aplicar Multa
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
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
                                    onClick={() => {
                                        if (loan.frequency === 'Mensal' || loan.frequency === 'Quinzenal') {
                                            setShowMensalPaymentModal(true);
                                        } else {
                                            setShowPaymentModal(true);
                                        }
                                    }}
                                    disabled={processing}
                                    className="w-full bg-primary dark:bg-white text-white dark:text-primary py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 transition active:scale-[0.98] disabled:opacity-70"
                                >
                                    Registrar Pagamento
                                </button>
                            )}
                            
                            {/* Batch Payment Button - Always visible if not paid AND not Mensal/Quinzenal */}
                            {loan.status !== 'paid' && loan.frequency !== 'Mensal' && loan.frequency !== 'Quinzenal' && (
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

                            <button 
                                onClick={() => setShowDeleteModal(true)}
                                className="w-full bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 py-4 rounded-2xl font-bold transition active:scale-[0.98] flex items-center justify-center gap-2 mt-2"
                            >
                                <Trash2 className="w-5 h-5" />
                                Excluir Empréstimo
                            </button>
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
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Registrar Pagamento</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                Escolha o tipo de pagamento
                            </p>
                        </div>

                        <div className="space-y-3">
                            <button 
                                onClick={() => {
                                    setShowPaymentModal(false);
                                    setShowSinglePaymentConfirmModal(true);
                                }}
                                className="w-full py-4 px-4 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20 flex flex-col items-center justify-center gap-1 transition-colors"
                            >
                                <span className="text-base">Pagar 1 Parcela</span>
                                <span className="text-xs opacity-80 font-normal">R$ {(loan.installment_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </button>

                            <button 
                                onClick={() => {
                                    setShowPaymentModal(false);
                                    setShowAVModal(true);
                                }}
                                className="w-full py-4 px-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 flex flex-col items-center justify-center gap-1 transition-colors"
                            >
                                <span className="text-base">Informar AV</span>
                                <span className="text-xs opacity-80 font-normal">Usar saldo + valor recebido</span>
                            </button>
                            
                            <button 
                                onClick={() => setShowPaymentModal(false)}
                                className="w-full py-3 px-4 rounded-xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors mt-2"
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
                            <p className="text-3xl font-bold text-green-700 dark:text-green-300">R$ {(loan.installment_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
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

            {/* AV Modal */}
            {showAVModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAVModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Informar AV</h3>
                            <button onClick={() => setShowAVModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800">
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase mb-1">Saldo de Crédito Atual</p>
                            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">R$ {(Number(loan.client?.credit_balance) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Valor Recebido (R$)
                                </label>
                                <input
                                    type="number"
                                    value={avAmount}
                                    onChange={(e) => setAvAmount(e.target.value)}
                                    className="w-full p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-lg font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
                                    placeholder="0,00"
                                />
                            </div>

                            <button 
                                onClick={handleAVPayment}
                                disabled={!avAmount || processing}
                                className="w-full bg-primary text-white py-4 rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition disabled:opacity-70"
                            >
                                {processing ? 'Processando...' : 'Calcular e Pagar'}
                            </button>
                        </div>
                    </div>
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
                            <button 
                                onClick={() => handleMensalPayment('full')}
                                disabled={processing}
                                className="w-full py-4 px-4 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20 flex flex-col items-center justify-center gap-1 disabled:opacity-70 transition-colors"
                            >
                                <span className="text-base">Pagar Tudo (Encerrar)</span>
                                <span className="text-xs opacity-80 font-normal">R$ {Number(loan.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </button>
                            
                            <button 
                                onClick={() => handleMensalPayment('renew')}
                                disabled={processing}
                                className="w-full py-4 px-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 flex flex-col items-center justify-center gap-1 disabled:opacity-70 transition-colors"
                            >
                                <span className="text-base">Pagar Juros (Renovar)</span>
                                <span className="text-xs opacity-80 font-normal">
                                    R$ {Math.max(0, Number(loan.balance) - Number(loan.amount)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </button>
                            
                            <button 
                                onClick={() => setShowMensalPaymentModal(false)}
                                className="w-full py-3 px-4 rounded-xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors mt-2"
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
                                    <p className="text-xs text-gray-500">Valor Total: R$ {Number(loan?.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
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
                                    <p className="text-xs text-gray-500">Apenas Juros: R$ {(Number(loan?.amount) * (Number(loan?.interest_rate) / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
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
                                            alert("Código PIX Copia e Cola copiado!");
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-200 transition-colors"
                                    >
                                        <Copy className="w-4 h-4" />
                                        Copiar Código
                                    </button>
                                </div>
                            )}

                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800">
                                <p className="text-xs text-blue-700 dark:text-blue-300">
                                    <span className="font-bold">Chave PIX:</span> {userSettings?.pix_key}
                                </p>
                                <p className="text-xs text-blue-700 dark:text-blue-300">
                                    <span className="font-bold">Beneficiário:</span> {userSettings?.pix_beneficiary || 'Não informado'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
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

            {/* Fine Modal */}
            {showFineModal && fineInstallment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFineModal(false)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Aplicar Multa</h3>
                            <button onClick={() => setShowFineModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <p className="text-sm text-gray-500">
                                Aplicando multa na parcela #{fineInstallment.number} de R$ {fineInstallment.originalValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || fineInstallment.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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

                            <button
                                onClick={handleApplyFine}
                                disabled={processing}
                                className="w-full bg-primary dark:bg-white text-white dark:text-primary py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 transition active:scale-[0.98] disabled:opacity-70 mt-4"
                            >
                                {processing ? 'Processando...' : 'Confirmar Aplicação'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Installment Detail Modal */}
            {selectedInstallmentForDetail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedInstallmentForDetail(null)}></div>
                    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200 border border-gray-100 dark:border-gray-800">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Detalhes da Parcela #{String(selectedInstallmentForDetail.number).padStart(2, '0')}</h3>
                            <button onClick={() => setSelectedInstallmentForDetail(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Show original value if there is interest OR fine */}
                            {Boolean((selectedInstallmentForDetail.accumulatedInterest && selectedInstallmentForDetail.accumulatedInterest > 0) || selectedInstallmentForDetail.fine) && (
                                <div className="flex justify-between items-center py-3 border-b border-gray-50 dark:border-gray-800/50">
                                    <span className="text-sm text-gray-500 dark:text-gray-400">Valor Original</span>
                                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                        R$ {selectedInstallmentForDetail.originalValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )}
                            
                            {Boolean(selectedInstallmentForDetail.accumulatedInterest && selectedInstallmentForDetail.accumulatedInterest > 0) && (
                                <div className="flex justify-between items-center py-3 border-b border-gray-50 dark:border-gray-800/50">
                                    <span className="text-sm text-danger font-medium">Juros Acumulados</span>
                                    <span className="text-sm font-bold text-danger">
                                        + R$ {selectedInstallmentForDetail.accumulatedInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )}

                            {selectedInstallmentForDetail.fine && (
                                <div className="flex justify-between items-center py-3 border-b border-gray-50 dark:border-gray-800/50">
                                    <span className="text-sm text-red-500 font-medium">Multa Manual ({selectedInstallmentForDetail.fine.fine_type === 'percent' ? `${selectedInstallmentForDetail.fine.fine_value}%` : 'Fixa'})</span>
                                    <span className="text-sm font-bold text-red-500">
                                        + R$ {selectedInstallmentForDetail.fine.fine_type === 'percent' 
                                            ? ((selectedInstallmentForDetail.originalValue || 0) * (selectedInstallmentForDetail.fine.fine_value / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                                            : selectedInstallmentForDetail.fine.fine_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                                        }
                                    </span>
                                </div>
                            )}

                            <div className="flex justify-between items-center pt-2">
                                <span className="text-base font-bold text-gray-900 dark:text-white">
                                    {Boolean((selectedInstallmentForDetail.accumulatedInterest && selectedInstallmentForDetail.accumulatedInterest > 0) || selectedInstallmentForDetail.fine) ? 'Total Atual' : 'Valor da Parcela'}
                                </span>
                                <span className="text-xl font-black text-primary dark:text-white">
                                    R$ {selectedInstallmentForDetail.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>

                            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-3 mb-2">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Vencimento</span>
                                </div>
                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                    {(selectedInstallmentForDetail.originalDate || selectedInstallmentForDetail.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                        </div>

                        <button 
                            onClick={() => setSelectedInstallmentForDetail(null)}
                            className="w-full mt-8 bg-primary dark:bg-white text-white dark:text-primary py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 transition active:scale-[0.98]"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};