import React, { useEffect, useRef, useState } from 'react';
import { Share2, X } from 'lucide-react';
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
            await document.fonts.ready;

            const el = receiptRef.current;
            const canvas = await html2canvas(el, {
                scale: 3,
                backgroundColor: '#FFFFFF',
                logging: false,
                useCORS: true,
                width: el.scrollWidth,
                height: el.scrollHeight,
                windowWidth: el.scrollWidth,
                windowHeight: el.scrollHeight,
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
                    const link = document.createElement('a');
                    link.href = canvas.toDataURL('image/png');
                    link.download = `comprovante_${data.contractId}_${data.installmentNumber}.png`;
                    link.click();
                }
                setIsSharing(false);
            }, 'image/png', 1.0);

        } catch (error) {
            console.error('Error generating receipt:', error);
            alert('Erro ao gerar comprovante.');
            setIsSharing(false);
        }
    };

    if (!isOpen) return null;

    const hasBreakdown = (data.interest && data.interest > 0) || (data.fine && data.fine > 0);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-6">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            
            <div className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md bg-white dark:bg-gray-900 rounded-none sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                
                {/* Header Actions */}
                <div className="absolute top-4 left-4 z-10">
                    <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto no-scrollbar flex-1 px-5 pt-14 pb-28">
                    
                    {/* Receipt Content (Target for Screenshot) */}
                    <div ref={receiptRef} style={{ width: '380px', maxWidth: '380px', margin: '0 auto', padding: '28px 24px 24px', background: '#FFFFFF', fontFamily: "'Inter', sans-serif" }}>
                        
                        {/* Header: Confirmation badge + Amount */}
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Comprovante de Pagamento</div>
                            <div style={{ fontSize: '32px', fontWeight: 900, color: '#111827', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                                R$ {data.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '6px', fontWeight: 500 }}>
                                {data.date}
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ height: '1px', background: '#F3F4F6', margin: '0 0 20px' }}></div>

                        {/* Details rows */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Cliente</span>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#111827', textAlign: 'right' }}>{data.clientName}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Contrato</span>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>#{data.contractId}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Parcela</span>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>#{String(data.installmentNumber).padStart(2, '0')}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Vencimento</span>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{data.dueDate}</span>
                            </div>
                        </div>

                        {/* Value breakdown (only if there are extras) */}
                        {hasBreakdown && (
                            <>
                                <div style={{ height: '1px', background: '#F3F4F6', margin: '0 0 16px' }}></div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Valor Original</span>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#6B7280' }}>
                                            R$ {(data.originalValue || data.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    {(data.interest || 0) > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Juros</span>
                                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#EF4444' }}>
                                                + R$ {data.interest?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    )}
                                    {(data.fine || 0) > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Multa ({data.fineType === 'percent' ? '%' : 'Fixa'})</span>
                                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#EF4444' }}>
                                                + R$ {data.fine?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Credit Balance */}
                        {data.creditBalance !== undefined && data.creditBalance > 0 && (
                            <>
                                <div style={{ height: '1px', background: '#F3F4F6', margin: '0 0 16px' }}></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Crédito Disponível</span>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#3B82F6' }}>
                                        R$ {data.creditBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </>
                        )}

                        {/* Authentication */}
                        <div style={{ height: '1px', background: '#F3F4F6', margin: '0 0 16px' }}></div>
                        <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 700, color: '#D1D5DB', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '4px' }}>Autenticação</div>
                            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#9CA3AF', wordBreak: 'break-all' }}>
                                {data.authenticationCode}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Fixed Bottom Action Button */}
                <div className="absolute bottom-0 left-0 right-0 z-50 p-5 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-t border-gray-100 dark:border-gray-800">
                    <button 
                        onClick={handleShare}
                        disabled={isSharing}
                        className="w-full bg-gray-900 hover:bg-black text-white py-3.5 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 text-sm"
                    >
                        {isSharing ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Gerando...
                            </>
                        ) : (
                            <>
                                <Share2 className="w-4 h-4" />
                                Compartilhar Comprovante
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
