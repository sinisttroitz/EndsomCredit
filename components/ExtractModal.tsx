import React, { useEffect, useRef, useState } from 'react';
import { Share2, X } from 'lucide-react';
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

            const el = extractRef.current;
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
            }, 'image/png', 1.0);

        } catch (error) {
            console.error('Error generating extract:', error);
            alert('Erro ao gerar extrato.');
            setIsSharing(false);
        }
    };

    if (!isOpen) return null;

    const rs = data.remainingSummary;
    const percentage = rs && rs.totalCount > 0 ? Math.round((rs.paidCount / rs.totalCount) * 100) : 0;
    const divider = <div style={{ height: '1px', background: '#F3F4F6', margin: '0' }}></div>;

    const installmentsCount = data.installments.length;
    const allSameValue = installmentsCount > 0 && data.installments.every(i => i.value === data.installments[0].value);
    const firstInst = installmentsCount > 0 ? data.installments[0] : null;
    const lastInst = installmentsCount > 0 ? data.installments[installmentsCount - 1] : null;
    const firstNum = firstInst ? String(firstInst.number).padStart(2, '0') : null;
    const lastNum = lastInst ? String(lastInst.number).padStart(2, '0') : null;
    const unitValue = rs?.installmentValue || (firstInst ? firstInst.value : 0);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-6">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            
            <div className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md bg-white dark:bg-gray-900 rounded-none sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                
                <div className="absolute top-4 left-4 z-10">
                    <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="overflow-y-auto no-scrollbar flex-1 px-5 pt-14 pb-28">
                    
                    <div ref={extractRef} style={{ width: '380px', maxWidth: '380px', margin: '0 auto', padding: '28px 24px 24px', background: '#FFFFFF', fontFamily: "'Inter', sans-serif" }}>
                        
                        {/* 1. Header */}
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>
                                Extrato de Pagamentos
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: 900, color: '#111827', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                                {data.clientName}
                            </div>
                            <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '6px', fontWeight: 500 }}>
                                Contrato #{data.contractId} · {data.emissionDate}
                            </div>
                        </div>

                        {divider}

                        {/* 2. Situação Financeira (sem valores duplicados) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Total Pago</span>
                                <span style={{ fontSize: '15px', fontWeight: 900, color: '#111827' }}>
                                    R$ {data.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Saldo Devedor</span>
                                <span style={{ fontSize: '15px', fontWeight: 900, color: data.balance > 0 ? '#111827' : '#059669' }}>
                                    R$ {data.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            {data.creditAvailable !== undefined && data.creditAvailable > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Crédito Disponível</span>
                                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#111827' }}>
                                        R$ {data.creditAvailable.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )}
                        </div>

                        {divider}

                        {/* 3. Situação das Parcelas (hierarquia limpa e direta) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Parcelas Quitadas</span>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>
                                    {rs ? `${rs.paidCount} de ${rs.totalCount} (${percentage}%)` : `${installmentsCount} parcelas`}
                                </span>
                            </div>
                            {firstNum && lastNum && installmentsCount > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Faixa Quitada</span>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>
                                        #{firstNum} a #{lastNum}
                                    </span>
                                </div>
                            )}
                            {unitValue > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Valor da Parcela</span>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>
                                        R$ {unitValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Parcelas Restantes</span>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: rs && rs.remainingCount === 0 ? '#059669' : '#111827' }}>
                                    {rs && rs.remainingCount === 0 ? 'Nenhuma (Quitado)' : rs ? `${rs.remainingCount} parcela(s)` : '-'}
                                </span>
                            </div>
                            {rs && rs.lateCount && rs.lateCount > 0 ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', color: '#EF4444', fontWeight: 600 }}>Parcelas em Atraso</span>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#EF4444' }}>
                                        {rs.lateCount}x{rs.lateAmount ? ` · R$ ${rs.lateAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                                    </span>
                                </div>
                            ) : null}
                        </div>

                        {/* 4. Próximos Vencimentos (Apenas se houver saldo restante) */}
                        {rs && rs.remainingCount > 0 && (rs.nextDueDate || rs.finalDueDate) && (
                            <>
                                {divider}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '18px 0' }}>
                                    {rs.nextDueDate && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Próximo Vencimento</span>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>
                                                {rs.nextInstallmentNumber ? `#${String(rs.nextInstallmentNumber).padStart(2, '0')} em ` : ''}{rs.nextDueDate}
                                            </span>
                                        </div>
                                    )}
                                    {rs.finalDueDate && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>Previsão de Quitação</span>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>
                                                {rs.finalDueDate}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* 5. Detalhamento opcional se os valores entre parcelas variarem (ex: juros/multas variáveis) */}
                        {!allSameValue && installmentsCount > 0 && (
                            <>
                                {divider}
                                <div style={{ padding: '16px 0 12px' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '12px' }}>
                                        Detalhamento por Parcela
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                                        {data.installments.map((inst) => (
                                            <div
                                                key={inst.number}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '6px 0',
                                                    borderBottom: '1px solid #F9FAFB',
                                                }}
                                            >
                                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#6B7280' }}>#{String(inst.number).padStart(2, '0')}</span>
                                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#111827' }}>
                                                    R$ {inst.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* 6. Autenticação Digital */}
                        {divider}
                        <div style={{ textAlign: 'center', padding: '14px 0 4px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 700, color: '#D1D5DB', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '4px' }}>
                                Autenticação
                            </div>
                            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#9CA3AF', wordBreak: 'break-all' }}>
                                {data.authenticationCode}
                            </div>
                        </div>
                    </div>
                </div>

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
                                Compartilhar Extrato
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
