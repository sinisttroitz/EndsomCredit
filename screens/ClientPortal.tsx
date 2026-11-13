import React, { useEffect, useState } from 'react';
import { Check, Clock, Circle, Copy, ChevronDown, ChevronUp, AlertTriangle, Shield, CheckSquare, Square } from 'lucide-react';
import { Loan, Installment, InstallmentFine } from '../types';
import { generateInstallments } from '../utils/loanUtils';
import { fetchPortalData, createPaymentRequest } from '../utils/portalUtils';
import { generatePixPayload } from '../utils/pixUtils';

interface ClientPortalProps {
    token: string;
}

type PortalView = 'main' | 'payment' | 'confirmation';

export const ClientPortal: React.FC<ClientPortalProps> = ({ token }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [loan, setLoan] = useState<Loan | null>(null);
    const [installmentsList, setInstallmentsList] = useState<Installment[]>([]);
    const [lenderSettings, setLenderSettings] = useState<any>(null);
    const [lenderName, setLenderName] = useState('');
    const [pendingRequests, setPendingRequests] = useState<number[]>([]);
    const [portalLink, setPortalLink] = useState<any>(null);
    const [showAllInstallments, setShowAllInstallments] = useState(false);

    // Payment flow
    const [view, setView] = useState<PortalView>('main');
    const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
    const [pixPayload, setPixPayload] = useState('');
    const [pixCopied, setPixCopied] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);

    // Batch selection
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedBatch, setSelectedBatch] = useState<Installment[]>([]);
    const [batchTotal, setBatchTotal] = useState(0);

    useEffect(() => {
        loadPortalData();
    }, [token]);

    const loadPortalData = async () => {
        setLoading(true);
        try {
            const data = await fetchPortalData(token);
            if (!data) {
                setError('Link inválido ou expirado.');
                return;
            }
            setLoan(data.loan);
            setLenderSettings(data.lenderSettings);
            setLenderName(data.lenderName);
            setPortalLink(data.link);

            const list = generateInstallments(data.loan, data.fines);
            setInstallmentsList(list);

            const pendingNums = data.paymentRequests.map((r: any) => r.installment_number);
            setPendingRequests(pendingNums);
        } catch {
            setError('Erro ao carregar dados.');
        } finally {
            setLoading(false);
        }
    };

    const handlePayClick = (inst: Installment) => {
        if (!lenderSettings?.pix_key) return;
        setSelectedInstallment(inst);
        const payload = generatePixPayload(
            lenderSettings.pix_key,
            lenderSettings.pix_beneficiary || 'Recebedor',
            lenderSettings.city || 'Cidade',
            inst.value,
            loan?.id.substring(0, 20) || 'PORTAL'
        );
        setPixPayload(payload);
        setPixCopied(false);
        setPaymentError(null);
        setView('payment');
    };

    const handleCopyPix = async () => {
        try {
            await navigator.clipboard.writeText(pixPayload);
            setPixCopied(true);
            setTimeout(() => setPixCopied(false), 3000);
        } catch { /* fallback */ }
    };

    const handleConfirmPayment = async () => {
        if (!loan || !portalLink || submitting) return;
        setSubmitting(true);
        setPaymentError(null);
        try {
            const rawTargets = selectedBatch.length > 0 ? selectedBatch : (selectedInstallment ? [selectedInstallment] : []);
            const targets = rawTargets.filter(t => !pendingRequests.includes(t.number));
            if (targets.length === 0) {
                setView('confirmation');
                return;
            }

            let firstError: string | undefined;
            const confirmedNumbers: number[] = [];
            for (const inst of targets) {
                const res = await createPaymentRequest(
                    loan.id,
                    portalLink.lender_id,
                    inst.number,
                    inst.value,
                    loan.client?.name || 'Cliente',
                    token
                );
                if (res.success) {
                    confirmedNumbers.push(inst.number);
                } else if (!firstError) {
                    firstError = res.error;
                }
            }

            if (confirmedNumbers.length > 0) {
                setPendingRequests(prev => Array.from(new Set([...prev, ...confirmedNumbers])));
            }

            if (!firstError && confirmedNumbers.length === targets.length) {
                setView('confirmation');
            } else {
                setPaymentError(firstError || 'Não foi possível enviar a confirmação. Tente novamente.');
            }
        } catch {
            setPaymentError('Erro inesperado ao registrar pagamento. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleBatchSelect = (inst: Installment) => {
        setSelectedBatch(prev => {
            const exists = prev.find(i => i.number === inst.number);
            const newList = exists ? prev.filter(i => i.number !== inst.number) : [...prev, inst];
            setBatchTotal(newList.reduce((sum, i) => sum + i.value, 0));
            return newList;
        });
    };

    const handleBatchPayClick = () => {
        if (!lenderSettings?.pix_key || selectedBatch.length === 0) return;
        const total = selectedBatch.reduce((sum, i) => sum + i.value, 0);
        const payload = generatePixPayload(
            lenderSettings.pix_key,
            lenderSettings.pix_beneficiary || 'Recebedor',
            lenderSettings.city || 'Cidade',
            total,
            loan?.id.substring(0, 20) || 'PORTAL'
        );
        setPixPayload(payload);
        setPixCopied(false);
        setPaymentError(null);
        setSelectedInstallment(null); // Using batch mode
        setView('payment');
    };

    const selectAllPayable = () => {
        const payable = installmentsList.filter(i => {
            const st = getStatusForInst(i);
            return st === 'late' || st === 'pending';
        });
        setSelectedBatch(payable);
        setBatchTotal(payable.reduce((sum, i) => sum + i.value, 0));
    };

    // --- RENDER STATES ---
    if (loading) return <LoadingScreen />;
    if (error) return <ErrorScreen message={error} />;
    if (!loan) return <ErrorScreen message="Empréstimo não encontrado." />;

    // Calculate stats
    const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
    const paidCount = installmentsList.filter(i => i.status === 'paid').length;
    const totalCount = installmentsList.length;
    const currentBalance = installmentsList.reduce((acc, inst) => inst.status !== 'paid' ? acc + inst.value : acc, 0);
    const totalPaid = Math.max(0, totalDebt - Number(loan.balance));
    const percentage = loan.status === 'paid' ? 100 : Math.max(0, loan.progress || 0);
    const isLate = installmentsList.some(i => i.status === 'late');
    const displayStatus = isLate && loan.status !== 'paid' ? 'late' : loan.status;

    const getStatusForInst = (inst: Installment) => {
        if (pendingRequests.includes(inst.number)) return 'pending_verification';
        return inst.status;
    };

    // --- PAYMENT VIEW ---
    if (view === 'payment') {
        const paymentItems = selectedBatch.length > 0 ? selectedBatch : (selectedInstallment ? [selectedInstallment] : []);
        const paymentTotal = paymentItems.reduce((sum, i) => sum + i.value, 0);
        const isBatch = paymentItems.length > 1;

        return (
            <div className="min-h-screen bg-[#F3F4F6] flex flex-col">
                <header className="bg-black text-white px-6 pt-10 pb-6 rounded-b-[32px]">
                    <button onClick={() => { setView('main'); setSelectedBatch([]); setBatchTotal(0); setIsSelectionMode(false); }} className="text-white/70 text-sm mb-3 flex items-center gap-1">
                        ← Voltar
                    </button>
                    <h1 className="text-xl font-bold">
                        {isBatch ? `Pagar ${paymentItems.length} Parcelas` : `Pagar Parcela #${String(paymentItems[0]?.number || 0).padStart(2, '0')}`}
                    </h1>
                </header>

                <main className="flex-1 px-5 -mt-4 pb-10 relative z-10 overflow-y-auto">
                    {/* Payment Summary */}
                    <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 mb-5">
                        <h3 className="text-sm font-bold text-gray-900 mb-4">{isBatch ? 'Parcelas Selecionadas' : 'Resumo do Pagamento'}</h3>

                        {isBatch ? (
                            <div className="space-y-2 mb-3">
                                {paymentItems.map(inst => (
                                    <div key={inst.number} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                                        <span className="text-xs font-bold text-gray-700">Parcela #{String(inst.number).padStart(2, '0')}</span>
                                        <span className="text-sm font-bold text-gray-900">R$ {inst.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                ))}
                            </div>
                        ) : paymentItems[0] && (
                            <>
                                {paymentItems[0].originalValue && Math.abs(paymentItems[0].value - paymentItems[0].originalValue) > 0.01 && (
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-500">Valor original</span>
                                        <span className="text-gray-400 line-through">R$ {paymentItems[0].originalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                )}
                                {Boolean(paymentItems[0].accumulatedInterest && paymentItems[0].accumulatedInterest! > 0.01) && (
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-500">Juros por atraso</span>
                                        <span className="text-red-500">+ R$ {paymentItems[0].accumulatedInterest!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                )}
                                {paymentItems[0].fine && (
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-500">Multa</span>
                                        <span className="text-red-500">+ R$ {paymentItems[0].fine.fine_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                )}
                            </>
                        )}

                        <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between items-center">
                            <span className="font-bold text-gray-900">Total a pagar</span>
                            <span className="text-2xl font-black text-green-600">R$ {paymentTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    {/* QR Code PIX */}
                    {pixPayload && (
                        <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 mb-5 flex flex-col items-center">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">QR Code PIX</p>
                            <div className="w-52 h-52 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 border border-gray-200 p-2">
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixPayload)}`}
                                    alt="QR Code PIX"
                                    className="w-full h-full rounded-xl"
                                />
                            </div>
                            <button
                                onClick={handleCopyPix}
                                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${pixCopied ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-700 border border-gray-200 active:scale-[0.97]'}`}
                            >
                                {pixCopied ? <><Check className="w-4 h-4" /> Copiado!</> : <><Copy className="w-4 h-4" /> Copiar código PIX</>}
                            </button>
                        </div>
                    )}

                    {/* Beneficiary Info */}
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                                <Shield className="w-5 h-5 text-gray-400" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Beneficiário</p>
                                <p className="text-sm font-bold text-gray-900">{lenderSettings?.pix_beneficiary || lenderName}</p>
                            </div>
                        </div>
                    </div>

                    {paymentError && (
                        <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center gap-3 text-red-700 text-xs font-bold">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            <span>{paymentError}</span>
                        </div>
                    )}

                    {/* Confirm Button */}
                    <button
                        onClick={handleConfirmPayment}
                        disabled={submitting}
                        className="w-full bg-green-600 text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-green-600/20 transition active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                        {submitting ? 'Enviando...' : <><Check className="w-5 h-5" /> Já realizei o pagamento</>}
                    </button>
                    <p className="text-[11px] text-gray-400 text-center mt-3">Após informar o pagamento, aguarde a confirmação do credor.</p>
                </main>
            </div>
        );
    }

    // --- CONFIRMATION VIEW ---
    if (view === 'confirmation') {
        const confirmedItems = selectedBatch.length > 0 ? selectedBatch : (selectedInstallment ? [selectedInstallment] : []);
        const confirmedTotal = confirmedItems.reduce((sum, i) => sum + i.value, 0);
        const isBatchConfirm = confirmedItems.length > 1;

        return (
            <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center px-6">
                <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 max-w-sm w-full text-center">
                    <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-amber-200">
                        <Clock className="w-10 h-10 text-amber-500" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">Aguardando Verificação</h2>
                    <p className="text-sm text-gray-500 mb-6">
                        {isBatchConfirm
                            ? <>Você informou o pagamento de <strong>{confirmedItems.length} parcelas</strong> no valor total de <strong>R$ {confirmedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></>
                            : <>Você informou o pagamento da <strong>Parcela #{String(confirmedItems[0]?.number || 0).padStart(2, '0')}</strong> no valor de <strong>R$ {confirmedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></>
                        }
                    </p>

                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mb-6 flex items-center gap-3">
                        <div className="px-2.5 py-1 rounded-lg bg-amber-200 text-amber-800 text-[10px] font-black uppercase whitespace-nowrap">Pendente</div>
                        <p className="text-xs text-amber-800 text-left">O credor foi notificado. Assim que confirmar o recebimento, {isBatchConfirm ? 'as parcelas serão marcadas' : 'a parcela será marcada'} como paga{isBatchConfirm ? 's' : ''}.</p>
                    </div>

                    <button
                        onClick={() => { setView('main'); setSelectedInstallment(null); setSelectedBatch([]); setBatchTotal(0); setIsSelectionMode(false); }}
                        className="w-full py-3.5 rounded-2xl font-bold text-sm text-gray-700 bg-gray-100 border border-gray-200 transition active:scale-[0.98]"
                    >
                        Voltar para meu empréstimo
                    </button>
                </div>
            </div>
        );
    }

    // --- MAIN VIEW ---
    return (
        <div className="min-h-screen bg-[#F3F4F6] flex flex-col">
            {/* Header */}
            <header className="bg-black text-white px-6 pt-10 pb-12 rounded-b-[40px] relative z-0">
                <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.2em] mb-1">{lenderName}</p>
                <h1 className="text-xl font-bold">Olá, {loan.client?.name || 'Cliente'}</h1>
                <p className="text-xs text-white/50 mt-1">Acompanhe seu empréstimo abaixo</p>
            </header>

            <main className="flex-1 px-5 -mt-6 pb-10 relative z-10 overflow-y-auto">
                {/* Summary Card */}
                <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 mb-5">
                    <div className="flex flex-col items-center text-center">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-1">Contrato #{loan.id.substring(0, 6)}</span>
                        <h2 className="text-4xl font-bold text-red-600 mb-2 tracking-tight">
                            R$ {currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h2>
                        <p className="text-[10px] text-gray-400 mb-3">Saldo devedor atual</p>
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1 rounded text-[10px] font-bold border border-gray-200 bg-gray-50 text-gray-600 uppercase">
                                {loan.frequency || 'N/A'}
                            </span>
                            <span className={`px-3 py-1 rounded text-[10px] font-bold border uppercase ${displayStatus === 'active' ? 'bg-green-100 text-green-700 border-green-200' :
                                displayStatus === 'late' ? 'bg-red-100 text-red-700 border-red-200' :
                                    displayStatus === 'paid' ? 'bg-gray-100 text-gray-500 border-gray-200' :
                                        'bg-orange-100 text-orange-700 border-orange-200'
                                }`}>
                                {displayStatus === 'active' ? 'EM DIA' : displayStatus === 'late' ? 'ATRASADO' : displayStatus === 'paid' ? 'QUITADO' : 'PENDENTE'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Progress Card */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-5">
                    <h3 className="text-sm font-bold text-gray-900 mb-5">Status do Pagamento</h3>
                    <div className="flex items-center gap-5">
                        <div
                            className="w-24 h-24 rounded-full flex items-center justify-center relative shadow-inner shrink-0"
                            style={{ background: `conic-gradient(${isLate ? '#EF4444' : '#10B981'} ${percentage}%, #E5E7EB 0)` } as React.CSSProperties}
                        >
                            <div className="absolute inset-2.5 rounded-full bg-white flex items-center justify-center shadow-xs">
                                <span className="text-xl font-bold text-gray-900">{percentage}%</span>
                            </div>
                        </div>
                        <div className="flex-1 space-y-2.5 min-w-0">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-2.5 rounded-2xl bg-gray-50 border border-gray-100">
                                    <p className="text-[9px] text-gray-400 uppercase font-bold tracking-wider truncate">Total Dívida</p>
                                    <p className="text-sm font-black text-gray-900 mt-0.5 truncate">
                                        R$ {totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div className="p-2.5 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                                    <p className="text-[9px] text-emerald-600 uppercase font-bold tracking-wider truncate">Amortizado</p>
                                    <p className="text-sm font-black text-emerald-600 mt-0.5 truncate">
                                        R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                            </div>
                            <div className="p-2 px-3 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between">
                                <span className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Parcelas Pagas</span>
                                <span className="text-xs font-bold text-gray-900">
                                    {paidCount} de {totalCount} ({percentage}%)
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Installments Timeline */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-gray-900">Suas Parcelas</h3>
                        <div className="flex items-center gap-2">
                            {lenderSettings?.pix_key && installmentsList.some(i => getStatusForInst(i) === 'late' || getStatusForInst(i) === 'pending') && (
                                <button
                                    onClick={() => {
                                        if (isSelectionMode) {
                                            setIsSelectionMode(false);
                                            setSelectedBatch([]);
                                            setBatchTotal(0);
                                        } else {
                                            setIsSelectionMode(true);
                                            setShowAllInstallments(true);
                                        }
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${isSelectionMode
                                        ? 'bg-gray-900 text-white'
                                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                                        }`}
                                >
                                    {isSelectionMode ? 'Cancelar' : 'Selecionar'}
                                </button>
                            )}
                            {!isSelectionMode && (
                                <button onClick={() => setShowAllInstallments(!showAllInstallments)} className="text-xs text-blue-500 font-medium flex items-center gap-1">
                                    {showAllInstallments ? <>Ver menos <ChevronUp className="w-3 h-3" /></> : <>Ver tudo <ChevronDown className="w-3 h-3" /></>}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Select All bar */}
                    {isSelectionMode && (
                        <button
                            onClick={selectAllPayable}
                            className="w-full flex items-center justify-center gap-2 py-2 mb-4 rounded-xl bg-blue-50 text-blue-600 text-xs font-bold border border-blue-100 active:scale-[0.98] transition-all"
                        >
                            <CheckSquare className="w-3.5 h-3.5" /> Selecionar todas em aberto
                        </button>
                    )}

                    <div className="relative space-y-5">
                        <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-100"></div>

                        {(showAllInstallments ? installmentsList : installmentsList.slice(0, 6)).map((inst) => {
                            const st = getStatusForInst(inst);
                            const isPayable = (st === 'late' || st === 'pending') && lenderSettings?.pix_key;
                            const isSelected = selectedBatch.some(i => i.number === inst.number);

                            return (
                                <div
                                    key={inst.number}
                                    className={`relative flex items-center gap-4 ${isSelectionMode && isPayable ? 'cursor-pointer active:scale-[0.98] transition-all' : ''} ${isSelected ? 'bg-green-50 -mx-3 px-3 py-2 rounded-xl' : ''}`}
                                    onClick={isSelectionMode && isPayable ? () => toggleBatchSelect(inst) : undefined}
                                >
                                    {/* Selection Checkbox */}
                                    {isSelectionMode && isPayable && (
                                        <div className="z-10 flex-shrink-0">
                                            {isSelected
                                                ? <CheckSquare className="w-5 h-5 text-green-600" />
                                                : <Square className="w-5 h-5 text-gray-300" />
                                            }
                                        </div>
                                    )}

                                    {/* Status Icon */}
                                    {(!isSelectionMode || !isPayable) && (
                                        <div className={`z-10 w-8 h-8 rounded-full flex items-center justify-center text-white ring-4 ring-white ${st === 'paid' ? 'bg-green-500' :
                                            st === 'pending_verification' ? 'bg-amber-400' :
                                                st === 'late' ? 'bg-red-500' :
                                                    st === 'pending' ? 'bg-blue-500' : 'bg-gray-200 text-gray-500'
                                            }`}>
                                            {st === 'paid' ? <Check className="w-4 h-4" /> :
                                                st === 'pending_verification' ? <Clock className="w-4 h-4" /> :
                                                    st === 'future' ? <Circle className="w-4 h-4" /> :
                                                        <Clock className="w-4 h-4" />}
                                        </div>
                                    )}

                                    {/* Content */}
                                    <div className={`flex-1 flex justify-between items-center ${st === 'future' ? 'opacity-50' : ''}`}>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">Parcela #{String(inst.number).padStart(2, '0')}</p>
                                            <p className="text-[10px] text-gray-400">
                                                {st === 'paid' ? 'Paga' :
                                                    st === 'pending_verification' ? 'Pendente de verificação' :
                                                        st === 'late' ? `Vencida em ${(inst.originalDate || inst.date).toLocaleDateString('pt-BR')}` :
                                                            st === 'pending' ? `Vence em ${inst.date.toLocaleDateString('pt-BR')}` :
                                                                `Prevista ${inst.date.toLocaleDateString('pt-BR')}`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className={`text-right ${st === 'paid' ? 'text-green-500' :
                                                st === 'pending_verification' ? 'text-amber-500' :
                                                    st === 'late' ? 'text-red-500' :
                                                        st === 'pending' ? 'text-blue-500' : 'text-gray-400'
                                                }`}>
                                                <span className="text-xs font-medium opacity-70">R$ </span>
                                                <span className="text-base font-bold">{inst.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            </div>

                                            {/* Pay button (only in normal mode) */}
                                            {!isSelectionMode && isPayable && (
                                                <button
                                                    onClick={() => handlePayClick(inst)}
                                                    className="px-3 py-1.5 bg-green-600 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider shadow-sm active:scale-[0.95] transition"
                                                >
                                                    Pagar
                                                </button>
                                            )}

                                            {st === 'pending_verification' && (
                                                <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[9px] font-bold rounded-lg uppercase">Verificando</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* No PIX Key Warning */}
                {!lenderSettings?.pix_key && (
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mb-5 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800">O credor ainda não configurou o recebimento via PIX. Entre em contato diretamente para efetuar pagamentos.</p>
                    </div>
                )}

                {/* Footer */}
                <div className={`text-center pt-4 ${isSelectionMode && selectedBatch.length > 0 ? 'pb-28' : 'pb-8'}`}>
                    <p className="text-[10px] text-gray-300">Powered by AgiCred</p>
                </div>
            </main>

            {/* Floating Batch Pay Bar */}
            {isSelectionMode && selectedBatch.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-4 shadow-2xl z-50 animate-in slide-in-from-bottom duration-300">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-xs text-gray-500">{selectedBatch.length} parcela{selectedBatch.length > 1 ? 's' : ''} selecionada{selectedBatch.length > 1 ? 's' : ''}</p>
                            <p className="text-xl font-black text-gray-900">R$ {batchTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <button
                            onClick={handleBatchPayClick}
                            className="px-6 py-3.5 bg-green-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-green-600/20 active:scale-[0.98] transition-all flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" /> Pagar Tudo
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Sub-components ---
const LoadingScreen = () => (
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div>
            <p className="text-sm font-bold text-gray-500">Carregando...</p>
        </div>
    </div>
);

const ErrorScreen = ({ message }: { message: string }) => (
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center px-6">
        <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Link Indisponível</h2>
            <p className="text-sm text-gray-500">{message}</p>
        </div>
    </div>
);
