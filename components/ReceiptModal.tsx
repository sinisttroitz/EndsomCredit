import React, { useEffect, useRef, useState } from 'react';
import { Check, Share2, X, Download, Copy, AlertTriangle } from 'lucide-react';
import html2canvas from 'html2canvas';

interface ReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: {
        amount: number;
        date: string;
        clientName: string;
        contractId: string;
        installmentNumber: number;
        dueDate: string;
        status: string;
        originalValue?: number;
        interest?: number;
        fine?: number;
        fineType?: 'percent' | 'fixed';
        totalPaid: number;
        creditBalance?: number;
        authenticationCode: string;
    };
}

export function ReceiptModal({ isOpen, onClose, data }: ReceiptModalProps) {
    const receiptRef = useRef<HTMLDivElement>(null);
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
        if (!receiptRef.current) return;
        setIsSharing(true);

        try {
            // Wait for fonts to load
            await document.fonts.ready;

            const canvas = await html2canvas(receiptRef.current, {
                scale: 2, // Higher resolution
                backgroundColor: '#F3F4F6', // Match bg-gray-100
                logging: false,
                useCORS: true
            });

            canvas.toBlob(async (blob) => {
                if (!blob) {
                    alert('Erro ao gerar imagem do comprovante.');
                    setIsSharing(false);
                    return;
                }

                const file = new File([blob], `comprovante_${data.contractId}_${data.installmentNumber}.png`, { type: 'image/png' });

                if (navigator.share) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: 'Comprovante de Pagamento',
                            text: `Comprovante de pagamento - Parcela #${data.installmentNumber}`
                        });
                    } catch (error) {
                        console.log('Error sharing:', error);
                    }
                } else {
                    // Fallback for desktop: Download
                    const link = document.createElement('a');
                    link.href = canvas.toDataURL('image/png');
                    link.download = `comprovante_${data.contractId}_${data.installmentNumber}.png`;
                    link.click();
                }
                setIsSharing(false);
            }, 'image/png');

        } catch (error) {
            console.error('Error generating receipt:', error);
            alert('Erro ao gerar comprovante.');
            setIsSharing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-6">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            
            <div className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md bg-gray-100 dark:bg-gray-900 rounded-none sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col">
                
                {/* Header Actions */}
                <div className="absolute top-4 left-4 z-10">
                    <button onClick={onClose} className="p-2 bg-white/80 dark:bg-black/50 backdrop-blur-md rounded-full hover:bg-white dark:hover:bg-black transition-colors">
                        <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto no-scrollbar flex-1 p-6 pb-32">
                    
                    {/* Receipt Content (Target for Screenshot) */}
                    <div ref={receiptRef} className="bg-gray-100 dark:bg-gray-900 p-4 rounded-3xl">
                        
                        {/* Title */}
                        <h2 className="text-center text-lg font-bold text-gray-900 dark:text-white mb-8 mt-2">
                            Comprovante de Pagamento
                        </h2>

                        {/* Success Icon & Main Amount */}
                        <div className="flex flex-col items-center mb-8">
                            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4 shadow-sm">
                                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                                    <Check className="w-6 h-6 text-white stroke-[3]" />
                                </div>
                            </div>
                            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">PAGAMENTO REALIZADO</p>
                            <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                                R$ {data.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                Pago em {data.date}
                            </p>
                        </div>

                        {/* Client Card */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm mb-4 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                                <div>
                                    <h3 className="font-bold text-gray-900 dark:text-white text-xl">{data.clientName}</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Contrato: #{data.contractId}</p>
                                </div>
                            </div>
                            
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500 dark:text-gray-400">Parcela</span>
                                    <span className="text-sm font-bold text-gray-900 dark:text-white">#{String(data.installmentNumber).padStart(2, '0')}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500 dark:text-gray-400">Vencimento</span>
                                    <span className="text-sm font-bold text-gray-900 dark:text-white">{data.dueDate}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500 dark:text-gray-400">Status</span>
                                    <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold rounded uppercase">
                                        {data.status === 'paid' ? 'PAGA' : data.status}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Details Card */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm mb-4 border border-gray-100 dark:border-gray-700">
                            <h4 className="font-bold text-gray-900 dark:text-white mb-4 text-sm">Detalhamento de Valores</h4>
                            
                            <div className="space-y-3 mb-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500 dark:text-gray-400">Valor Original</span>
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        R$ {(data.originalValue || data.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                
                                {(data.interest || 0) > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-500 dark:text-gray-400">Juros Acumulados</span>
                                        <span className="text-sm font-medium text-red-500">
                                            + R$ {data.interest?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                )}

                                {(data.fine || 0) > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-500 dark:text-gray-400">Multa ({data.fineType === 'percent' ? '%' : 'Fixa'})</span>
                                        <span className="text-sm font-medium text-red-500">
                                            + R$ {data.fine?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 border-t border-dashed border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                <span className="font-bold text-gray-900 dark:text-white">Total Pago</span>
                                <span className="font-bold text-blue-600 dark:text-blue-400 text-lg">
                                    R$ {data.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        {/* Credit Balance Card (Optional) */}
                        {data.creditBalance !== undefined && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 flex items-center gap-3 mb-4 border border-blue-100 dark:border-blue-800">
                                <div className="flex-1 flex justify-between items-center">
                                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Crédito Disponível</span>
                                    <span className="font-bold text-blue-700 dark:text-blue-300">
                                        R$ {data.creditBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Authentication Code */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Código de Autenticação</p>
                            <p className="text-xs font-mono text-gray-600 dark:text-gray-300 break-all">
                                {data.authenticationCode}
                            </p>
                        </div>

                        {/* Footer Disclaimer */}
                        <p className="text-[10px] text-center text-gray-400 mt-6 px-4 leading-relaxed">
                            Este documento serve como comprovante de quitação da parcela indicada. 
                            A autenticação digital acima garante a validade deste documento perante a instituição financeira emissora.
                        </p>
                    </div>
                </div>

                {/* Fixed Bottom Action Button */}
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-t border-gray-200 dark:border-gray-800">
                    <button 
                        onClick={handleShare}
                        disabled={isSharing}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70"
                    >
                        {isSharing ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Gerando Imagem...
                            </>
                        ) : (
                            <>
                                <Share2 className="w-5 h-5" />
                                Compartilhar Comprovante
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
