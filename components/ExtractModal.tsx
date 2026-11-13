import React, { useEffect, useRef, useState } from 'react';
import { Share2, X, Check, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';
import html2canvas from 'html2canvas';

export interface RemainingSummary {
    remainingCount: number;
    totalCount: number;
    paidCount: number;
    installmentValue?: number;
    nextInstallmentNumber?: number;
    nextDueDate?: string;
    finalDueDate?: string;
    lateCount?: number;
    lateAmount?: number;
}

interface ExtractModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: {
        emissionDate: string;
        clientName: string;
        contractId: string;
        totalPaid: number;
        balance: number;
        creditAvailable?: number;
        remainingSummary?: RemainingSummary;
        installments: Array<{
            number: number;
            date: string;
            value: number;
        }>;
        authenticationCode: string;
    };
}

export function ExtractModal({ isOpen, onClose, data }: ExtractModalProps) {
    const extractRef = useRef<HTMLDivElement>(null);
    const [isSharing, setIsSharing] = useState(false);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    const handleShare = async () => {
        if (!extractRef.current) return;
        setIsSharing(true);

        try {
            await document.fonts.ready;

            const canvas = await html2canvas(extractRef.current, {
                scale: 2,
                backgroundColor: '#F3F4F6',
                logging: false,
                useCORS: true
            });

            canvas.toBlob(async (blob) => {
                if (!blob) {
                    alert('Erro ao gerar imagem do extrato.');
                    setIsSharing(false);
                    return;
                }

                const file = new File([blob], `extrato_${data.contractId}.png`, { type: 'image/png' });

                if (navigator.share) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: 'Extrato de Pagamentos',
                            text: `Extrato de Pagamentos - Contrato #${data.contractId}`
                        });
                    } catch (error) {
                        console.log('Error sharing:', error);
                    }
                } else {
                    const link = document.createElement('a');
                    link.href = canvas.toDataURL('image/png');
                    link.download = `extrato_${data.contractId}.png`;
                    link.click();
                }
                setIsSharing(false);
            }, 'image/png');

        } catch (error) {
            console.error('Error generating extract:', error);
            alert('Erro ao gerar extrato.');
            setIsSharing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-6">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            
            <div className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md bg-gray-100 dark:bg-gray-900 rounded-none sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col">
                
                <div className="absolute top-4 left-4 z-10">
                    <button onClick={onClose} className="p-2 bg-white/80 dark:bg-black/50 backdrop-blur-md rounded-full hover:bg-white dark:hover:bg-black transition-colors">
                        <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    </button>
                </div>

                <div className="overflow-y-auto no-scrollbar flex-1 p-6 pb-32">
                    
                    <div ref={extractRef} className="bg-gray-50 dark:bg-gray-900 p-4 min-h-full">
                        
                        <h2 className="text-center text-lg font-bold text-gray-900 dark:text-white mb-6 mt-2">
                            Extrato de Pagamentos
                        </h2>

                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            Resumo do Contrato
                        </h3>

                        {/* Contract Info Card */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm mb-4 border border-gray-100 dark:border-gray-700">
                            <div className="space-y-4">
                                <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">DATA DE EMISSÃO</p>
                                    <p className="font-bold text-gray-900 dark:text-white">{data.emissionDate}</p>
                                </div>
                                <div className="border-t border-gray-50 dark:border-gray-700 pt-3">
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">CLIENTE</p>
                                    <p className="font-bold text-gray-900 dark:text-white text-lg">{data.clientName}</p>
                                </div>
                                <div className="border-t border-gray-50 dark:border-gray-700 pt-3">
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">CONTRATO</p>
                                    <p className="font-bold text-blue-600 dark:text-blue-400">#{data.contractId}</p>
                                </div>
                            </div>
                        </div>

                        {/* Summary Cards */}
                        <div className="space-y-3 mb-6">
                            {/* Total Paid */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 border border-blue-100 dark:border-blue-800">
                                <p className="text-xs text-blue-600 dark:text-blue-300 mb-1">Total Pago Acumulado</p>
                                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                                    R$ {data.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>

                            {/* Balance */}
                            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Saldo Devedor Atual</p>
                                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                    R$ {data.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>

                            {/* Credit Available (Optional) */}
                            {data.creditAvailable !== undefined && data.creditAvailable > 0 && (
                                <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4 border border-green-100 dark:border-green-800">
                                    <p className="text-xs text-green-600 dark:text-green-300 mb-1">Crédito Disponível</p>
                                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                                        R$ {data.creditAvailable.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Remaining Installments Smart Summary */}
                        {data.remainingSummary && (
                            <div className="mb-6">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
                                    {data.remainingSummary.remainingCount > 0 ? 'Previsão das Parcelas Faltantes' : 'Status do Contrato'}
                                </h3>

                                {data.remainingSummary.remainingCount > 0 ? (
                                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm space-y-3">
                                        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300">
                                                    <Calendar className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-900 dark:text-white text-sm">
                                                        {data.remainingSummary.remainingCount} de {data.remainingSummary.totalCount} parcelas restantes
                                                    </p>
                                                    <p className="text-xs text-gray-400">
                                                        {data.remainingSummary.paidCount} parcela(s) já quitada(s)
                                                    </p>
                                                </div>
                                            </div>
                                            {data.remainingSummary.installmentValue ? (
                                                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200/60 dark:border-gray-600 whitespace-nowrap">
                                                    {data.remainingSummary.remainingCount}x R$ {data.remainingSummary.installmentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            ) : null}
                                        </div>

                                        <div className="space-y-2 text-xs">
                                            {data.remainingSummary.nextDueDate && (
                                                <div className="flex justify-between items-center py-0.5">
                                                    <span className="text-gray-500 dark:text-gray-400 font-medium">Próximo Vencimento:</span>
                                                    <span className="font-bold text-gray-900 dark:text-white">
                                                        {data.remainingSummary.nextInstallmentNumber ? `Parcela #${String(data.remainingSummary.nextInstallmentNumber).padStart(2, '0')} em ` : ''}{data.remainingSummary.nextDueDate}
                                                    </span>
                                                </div>
                                            )}

                                            {data.remainingSummary.finalDueDate && (
                                                <div className="flex justify-between items-center py-0.5">
                                                    <span className="text-gray-500 dark:text-gray-400 font-medium">Previsão de Quitação:</span>
                                                    <span className="font-bold text-gray-900 dark:text-white">
                                                        {data.remainingSummary.finalDueDate}
                                                    </span>
                                                </div>
                                            )}

                                            {data.remainingSummary.lateCount && data.remainingSummary.lateCount > 0 ? (
                                                <div className="flex justify-between items-center pt-2.5 border-t border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400">
                                                    <span className="font-bold flex items-center gap-1.5">
                                                        <AlertTriangle className="w-3.5 h-3.5" />
                                                        Parcelas em Atraso:
                                                    </span>
                                                    <span className="font-bold">
                                                        {data.remainingSummary.lateCount} parcela(s) {data.remainingSummary.lateAmount ? `• R$ ${data.remainingSummary.lateAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                                                    </span>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-4 border border-emerald-100 dark:border-emerald-800 flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                            <CheckCircle2 className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-emerald-900 dark:text-emerald-200 text-sm">Contrato Quitado</p>
                                            <p className="text-xs text-emerald-700 dark:text-emerald-400">Todas as {data.remainingSummary.totalCount} parcelas foram quitadas.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            Parcelas Pagas
                        </h3>

                        {/* Installments List */}
                        <div className="space-y-3 mb-8">
                            {data.installments.map((inst) => (
                                <div key={inst.number} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 flex items-center gap-4">
                                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                                        <Check className="w-5 h-5 stroke-[3]" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start mb-1">
                                            <p className="font-bold text-gray-900 dark:text-white">Parcela #{String(inst.number).padStart(2, '0')}</p>
                                            <p className="font-bold text-gray-900 dark:text-white">
                                                R$ {inst.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Pago em {inst.date}</p>
                                            <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wide">CONFIRMADO</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {data.installments.length === 0 && (
                                <p className="text-center text-gray-500 text-sm py-4">Nenhuma parcela paga encontrada.</p>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="text-center mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">AUTENTICAÇÃO DIGITAL</p>
                            <p className="text-[10px] font-mono text-gray-400 break-all mb-4">
                                HASH: {data.authenticationCode}
                            </p>
                            <div className="flex items-center justify-center gap-1 text-gray-400">
                                <Check className="w-3 h-3" />
                                <span className="text-[10px] uppercase font-medium">Documento assinado digitalmente</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 z-50 p-6 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-t border-gray-200 dark:border-gray-800">
                    <button 
                        onClick={handleShare}
                        disabled={isSharing}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70"
                    >
                        {isSharing ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Gerando Extrato...
                            </>
                        ) : (
                            <>
                                <Share2 className="w-5 h-5" />
                                Compartilhar Extrato
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
