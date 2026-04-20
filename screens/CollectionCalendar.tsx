import React, { useEffect, useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, Search, Calendar as CalendarIcon, Filter, Wallet, Banknote, AlertTriangle, X, Share2, QrCode, Copy, MapPin, Loader2 } from 'lucide-react';
import { generatePixPayload } from '../utils/pixUtils';
import { supabase } from '../supabaseClient';
import { Loan, Installment } from '../types';
import { generateInstallments } from '../utils/loanUtils';

interface CollectionCalendarProps {
    onBack: () => void;
    onLoanSelect: (id: string) => void;
}

interface CalendarDay {
    date: Date;
    isCurrentMonth: boolean;
    hasCharges: boolean;
    totalAmount: number;
    count: number;
}

interface ChargeItem {
    loan: Loan;
    installment: Installment;
}

export const CollectionCalendar: React.FC<CollectionCalendarProps> = ({ onBack, onLoanSelect }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [charges, setCharges] = useState<ChargeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
    const [selectedDayCharges, setSelectedDayCharges] = useState<ChargeItem[]>([]);
    const [alertModal, setAlertModal] = useState<{
        open: boolean;
        title: string;
        message: string;
        onConfirm?: () => void;
        confirmText?: string;
    }>({ open: false, title: '', message: '' });
    const scrollRef = useRef<HTMLDivElement>(null);

    const [showChargeOptionsModal, setShowChargeOptionsModal] = useState(false);
    const [showPixModal, setShowPixModal] = useState(false);
    const [pixAmount, setPixAmount] = useState('');
    const [pixPayload, setPixPayload] = useState('');
    const [selectedLoanForCharge, setSelectedLoanForCharge] = useState<Loan | null>(null);
    const [userSettings, setUserSettings] = useState<{
        pix_key: string;
        pix_beneficiary: string;
        city: string;
    } | null>(null);

    useEffect(() => {
        fetchAllCharges();
        fetchUserSettings();
    }, []);

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

    useEffect(() => {
        if (charges.length > 0) {
            generateCalendar();
        }
    }, [currentDate, charges]);

    useEffect(() => {
        filterChargesForSelectedDate();
    }, [selectedDate, charges]);

    // Scroll to selected date when calendar days change
    useEffect(() => {
        if (scrollRef.current && calendarDays.length > 0) {
            const selectedIndex = calendarDays.findIndex(day => isSameDay(day.date, selectedDate));
            if (selectedIndex !== -1) {
                // item width (60px) + gap (12px) = 72px
                const itemTotalWidth = 72; 
                const paddingLeft = 8; // px-2 = 8px
                const itemCenter = paddingLeft + (selectedIndex * itemTotalWidth) + (60 / 2);
                const scrollPos = itemCenter - (scrollRef.current.clientWidth / 2);
                
                scrollRef.current.scrollTo({ left: scrollPos, behavior: 'smooth' });
            }
        }
    }, [calendarDays, selectedDate]);

    const fetchAllCharges = async () => {
        setLoading(true);
        try {
            const { data: loans, error } = await supabase
                .from('loans')
                .select('*, client:clients(name, avatar_url, phone, address, number, city, state)')
                .neq('status', 'paid'); // Only active/late loans matter for collection

            if (error) throw error;

            const allCharges: ChargeItem[] = [];

            loans?.forEach((loan: Loan) => {
                const installments = generateInstallments(loan);
                installments.forEach(inst => {
                    // Only include unpaid installments
                    if (inst.status !== 'paid') {
                        allCharges.push({
                            loan,
                            installment: inst
                        });
                    }
                });
            });

            setCharges(allCharges);
        } catch (error) {
            console.error("Error fetching charges", error);
        } finally {
            setLoading(false);
        }
    };

    const handleChargeLoan = (e: React.MouseEvent, loan: Loan) => {
        e.stopPropagation();
        setSelectedLoanForCharge(loan);

        if (!loan.client?.phone) {
            setAlertModal({
                open: true,
                title: "Telefone não cadastrado",
                message: "Este cliente não possui um número de telefone cadastrado para cobrança."
            });
            return;
        }

        const installments = generateInstallments(loan);
        const overdueInstallments = installments.filter(i => i.status === 'late');
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
        if (!selectedLoanForCharge || !selectedLoanForCharge.client?.phone) return;

        const installments = generateInstallments(selectedLoanForCharge);
        const overdueInstallments = installments.filter(i => i.status === 'late');
        
        let message = '';
        if (overdueInstallments.length > 0) {
            const nome = selectedLoanForCharge.client.name;
            const contrato = selectedLoanForCharge.id.substring(0, 6);
            
            if (overdueInstallments.length === 1) {
                const firstUnpaid = overdueInstallments[0];
                const parcela = firstUnpaid.number;
                const valor = firstUnpaid.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const data = (firstUnpaid.originalDate || firstUnpaid.date).toLocaleDateString('pt-BR');

                const jurosInfo = firstUnpaid.accumulatedInterest && firstUnpaid.accumulatedInterest > 0.01 
                    ? ` (incluindo R$ ${firstUnpaid.accumulatedInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de juros por atraso)`
                    : '';

                message = `Olá, ${nome},\n\nConforme consta em nosso sistema, identificamos a seguinte parcela em aberto:\n\nParcela nº: ${parcela}\n\nValor: R$ ${valor}${jurosInfo}\n\nContrato: ${contrato}\n\nVencimento: ${data}\n\nSolicitamos, por gentileza, a regularização do pagamento para evitar a incidência de encargos adicionais.\n\nCaso o pagamento já tenha sido efetuado, pedimos a gentileza de desconsiderar esta mensagem.`;
            } else {
                const totalValue = overdueInstallments.reduce((acc, curr) => acc + curr.value, 0);
                const valorTotalFormatado = totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const parcelasStr = overdueInstallments.map(i => i.number).join(', ');
                
                let detalhesParcelas = '';
                overdueInstallments.forEach(i => {
                    const data = (i.originalDate || i.date).toLocaleDateString('pt-BR');
                    const valor = i.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const jurosInfo = i.accumulatedInterest && i.accumulatedInterest > 0.01 
                        ? ` (inclui R$ ${i.accumulatedInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de juros)`
                        : '';
                    detalhesParcelas += `- Parcela ${i.number}: R$ ${valor} (Vencimento: ${data})${jurosInfo}\n`;
                });

                message = `Olá, ${nome}.\n\nConstam em nosso sistema ${overdueInstallments.length} parcelas em atraso (nº ${parcelasStr}), totalizando R$ ${valorTotalFormatado}, referentes ao contrato ${contrato}.\n\nDetalhes:\n${detalhesParcelas}\nPedimos a regularização para evitar encargos adicionais.\n\nCaso já tenha efetuado o pagamento, favor desconsiderar esta mensagem.`;
            }
        } else {
            const firstUnpaid = installments.find(i => i.status !== 'paid');
            if (firstUnpaid) {
                const nome = selectedLoanForCharge.client.name;
                const parcela = firstUnpaid.number;
                const valor = firstUnpaid.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const contrato = selectedLoanForCharge.id.substring(0, 6);
                const data = (firstUnpaid.originalDate || firstUnpaid.date).toLocaleDateString('pt-BR');

                message = `Olá, ${nome}.\n\nLembramos que a parcela nº ${parcela} no valor de R$ ${valor}, referente ao contrato ${contrato}, vence em ${data}.\n\nCaso já tenha efetuado o pagamento, favor desconsiderar esta mensagem.`;
            } else {
                message = `Olá, ${selectedLoanForCharge.client.name}.\n\nEstamos entrando em contato referente ao seu contrato ${selectedLoanForCharge.id.substring(0, 6)}.`;
            }
        }
        
        const encodedMessage = encodeURIComponent(message);
        const phone = selectedLoanForCharge.client.phone.replace(/\D/g, '');
        const whatsappUrl = `https://wa.me/55${phone}?text=${encodedMessage}`;
        
        window.open(whatsappUrl, '_blank');
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
        setShowPixModal(true);
        
        if (selectedLoanForCharge) {
            const installments = generateInstallments(selectedLoanForCharge);
            const overdueInstallments = installments.filter(i => i.status === 'late');
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
            selectedLoanForCharge?.id.substring(0, 20) // Transaction ID
        );
        setPixPayload(payload);
    };

    const generateCalendar = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const lastDay = new Date(year, month + 1, 0);
        
        const days: CalendarDay[] = [];
        
        // Generate only current month days for horizontal view
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const date = new Date(year, month, i);
            days.push(createCalendarDay(date, true));
        }

        setCalendarDays(days);
    };

    const createCalendarDay = (date: Date, isCurrentMonth: boolean): CalendarDay => {
        // Find charges for this day
        const dayCharges = charges.filter(c => isSameDay(c.installment.date, date));
        const totalAmount = dayCharges.reduce((acc, curr) => acc + curr.installment.value, 0);
        
        return {
            date,
            isCurrentMonth,
            hasCharges: dayCharges.length > 0,
            totalAmount,
            count: dayCharges.length
        };
    };

    const isSameDay = (d1: Date, d2: Date) => {
        return d1.getDate() === d2.getDate() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getFullYear() === d2.getFullYear();
    };

    const filterChargesForSelectedDate = () => {
        const filtered = charges.filter(c => isSameDay(c.installment.date, selectedDate));
        setSelectedDayCharges(filtered);
    };

    const handlePrevMonth = () => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
        setCurrentDate(newDate);
        // Select the first day of the new month
        setSelectedDate(newDate);
    };

    const handleNextMonth = () => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
        setCurrentDate(newDate);
        // Select the first day of the new month
        setSelectedDate(newDate);
    };

    const monthNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const weekDaysShort = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

    const totalSelectedAmount = selectedDayCharges.reduce((acc, curr) => acc + curr.installment.value, 0);
    const pendingCount = selectedDayCharges.filter(c => c.installment.status === 'pending').length;
    const lateCount = selectedDayCharges.filter(c => c.installment.status === 'late').length;

    return (
        <>
        {/* --- MOBILE VIEW --- */}
        <div className="md:hidden flex flex-col h-full bg-background-light dark:bg-background-dark">
            <header className="bg-black text-white px-4 py-6 flex items-center justify-between sticky top-0 z-10 rounded-b-[40px]">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <div className="flex items-center gap-2">
                     <button onClick={handlePrevMonth} className="p-1 rounded-full hover:bg-white/10">
                        <ChevronLeft className="w-4 h-4 text-white/70" />
                    </button>
                    <h1 className="text-sm font-manrope font-extrabold text-white uppercase tracking-wider">
                        {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                    </h1>
                    <button onClick={handleNextMonth} className="p-1 rounded-full hover:bg-white/10">
                        <ChevronRight className="w-4 h-4 text-white/70" />
                    </button>
                </div>
                <div className="w-10"></div> {/* Spacer */}
            </header>

            <main className="flex-1 overflow-y-auto p-4">
                {/* Horizontal Calendar Strip */}
                <div className="mb-6 overflow-x-auto no-scrollbar pb-2" ref={scrollRef}>
                    <div className="flex gap-3 px-2 min-w-min">
                        {calendarDays.map((day, index) => {
                            const isSelected = isSameDay(day.date, selectedDate);
                            const dayOfWeek = weekDaysShort[day.date.getDay()];
                            
                            return (
                                <button
                                    key={index}
                                    onClick={() => setSelectedDate(day.date)}
                                    className={`
                                        flex flex-col items-center justify-center min-w-[60px] h-[80px] rounded-2xl transition-all duration-300
                                        ${isSelected 
                                            ? 'bg-black text-white dark:bg-white dark:text-black shadow-lg shadow-gray-200 dark:shadow-gray-900/20 transform scale-105' 
                                            : 'bg-transparent text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                                        }
                                    `}
                                >
                                    <span className={`text-[10px] font-bold mb-1 uppercase ${isSelected ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400'}`}>
                                        {dayOfWeek}
                                    </span>
                                    <span className={`text-xl font-manrope font-bold ${isSelected ? 'text-white dark:text-black' : 'text-gray-700 dark:text-gray-300'}`}>
                                        {day.date.getDate().toString().padStart(2, '0')}
                                    </span>
                                    {day.hasCharges && !isSelected && (
                                        <div className="w-1.5 h-1.5 bg-black dark:bg-white rounded-full mt-1"></div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Summary Card (Blue) */}
                <div className="bg-blue-600 rounded-2xl p-4 mb-6 relative overflow-hidden shadow-lg shadow-blue-200 dark:shadow-blue-900/20 text-white">
                    {/* Background decoration */}
                    <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                    
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold text-blue-100 uppercase tracking-widest mb-1 opacity-80">
                                Resumo Diário • {isSameDay(selectedDate, new Date()) ? 'Hoje' : selectedDate.toLocaleDateString('pt-BR')}
                            </p>
                            <div className="flex items-center gap-3">
                                <h3 className="text-3xl font-manrope font-extrabold tracking-tight">
                                    R$ {totalSelectedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </h3>
                                <div className="flex gap-1.5">
                                    <span className="bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-md text-[10px] font-bold uppercase">
                                        {selectedDayCharges.length} Cobranças
                                    </span>
                                </div>
                            </div>
                            {lateCount > 0 && (
                                <div className="mt-2 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></div>
                                    <span className="text-[10px] font-bold text-red-100 uppercase">
                                        {lateCount} {lateCount === 1 ? 'cobrança em atraso' : 'cobranças em atraso'}
                                    </span>
                                </div>
                            )}
                        </div>
                        
                        <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/10">
                            <Wallet className="w-6 h-6 text-white" />
                        </div>
                    </div>
                </div>

                {/* Charges List */}
                <div>
                    <div className="flex items-center justify-between mb-4 px-1">
                        <h3 className="font-bold text-gray-900 dark:text-white text-lg">Cobranças do Dia</h3>
                    </div>

                    {loading ? (
                        <div className="text-center py-8 text-gray-500">Carregando...</div>
                    ) : selectedDayCharges.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
                            <CalendarIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500 font-medium">Nenhuma cobrança para este dia.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {selectedDayCharges.map((item, index) => {
                                const installments = generateInstallments(item.loan);
                                const overdue = installments.filter(i => i.status === 'late');
                                const isLate = overdue.length > 0;

                                return (
                                <div 
                                    key={`${item.loan.id}-${item.installment.number}`}
                                    onClick={() => onLoanSelect(item.loan.id)}
                                    className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-all active:scale-[0.99]"
                                >
                                    <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
                                        {item.loan.client?.avatar_url && !item.loan.client.avatar_url.includes('ui-avatars.com') ? (
                                            <img src={item.loan.client.avatar_url} alt={item.loan.client.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 font-bold text-lg">
                                                {item.loan.client?.name?.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-gray-900 dark:text-white truncate text-base">{item.loan.client?.name}</h4>
                                        <p className="text-xs font-manrope font-medium text-gray-500 truncate mt-0.5">Contrato: #{item.loan.id.substring(0, 6)}</p>
                                    </div>
                                         <div className="flex items-center gap-1">
                                        {item.loan.client?.address && (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const client = item.loan.client;
                                                    const addressQuery = `${client?.address}, ${client?.number || ''}, ${client?.city || ''}, ${client?.state || ''}`;
                                                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`, '_blank');
                                                }}
                                                className="p-2 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 shadow-sm transition-colors flex-shrink-0"
                                                title="Ver no Mapa"
                                            >
                                                <MapPin className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button 
                                            onClick={(e) => handleChargeLoan(e, item.loan)}
                                            className={`p-2 rounded-full shadow-sm transition-colors flex-shrink-0 ${
                                                isLate 
                                                    ? 'bg-green-500 hover:bg-green-600 text-white' 
                                                    : 'bg-gray-200 hover:bg-gray-300 text-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300'
                                            }`}
                                            title="Cobrar via WhatsApp"
                                        >
                                            <Banknote className="w-4 h-4" />
                                        </button>
                                    </div>
                                
                                    <div className="text-right">
                                        <p className="font-manrope font-extrabold text-gray-900 dark:text-white text-base">
                                            R$ {item.installment.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase inline-block mt-1 ${
                                            item.installment.status === 'late' 
                                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                        }`}>
                                            {item.installment.status === 'late' ? 'Atrasado' : 'Pendente'}
                                        </span>
                                    </div>
                                </div>
                            )})}
                        </div>
                    )}
                </div>
            </main>
        </div>

        {/* --- DESKTOP VIEW --- */}
        <div className="hidden md:flex flex-col flex-1 p-8 overflow-y-auto no-scrollbar bg-gray-50 dark:bg-[#0B0B0F] h-full">
            <div className="max-w-[1400px] w-full mx-auto space-y-8 flex flex-col h-full" style={{ zoom: 0.8 }}>
                
                {/* Header Desktop */}
                <div className="flex items-center justify-between shrink-0">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Calendário de Cobranças</h1>
                        <p className="text-sm font-medium text-gray-500 mt-1">Acompanhe os vencimentos e gerencie suas cobranças diárias.</p>
                    </div>
                    
                    <div className="flex items-center gap-4 bg-white dark:bg-gray-800 p-2 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                        </button>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white w-48 text-center uppercase tracking-wider">
                            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                        </h2>
                        <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
                    {/* Left Column: Monthly Calendar View */}
                    <div className="lg:col-span-4 lg:col-start-1 bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col h-full">
                         {/* Calendar Grid Header */}
                         <div className="grid grid-cols-7 gap-2 mb-4 shrink-0">
                             {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                                 <div key={day} className="text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                     {day}
                                 </div>
                             ))}
                         </div>
                         {/* Calendar Grid Body */}
                         <div className="grid grid-cols-7 gap-2">
                             {/* Let's compute blanks and days */}
                             {(() => {
                                 const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
                                 const blanks = Array.from({ length: firstDay }).map((_, i) => <div key={`blank-${i}`} className="aspect-square" />);
                                 const days = calendarDays.map((day, index) => {
                                     const isSelected = isSameDay(day.date, selectedDate);
                                     const isToday = isSameDay(day.date, new Date());
                                     return (
                                         <button
                                             key={index}
                                             onClick={() => setSelectedDate(day.date)}
                                             className={`
                                                 aspect-square rounded-2xl flex flex-col items-center justify-center relative transition-all duration-300 group
                                                 ${isSelected 
                                                     ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-105 z-10' 
                                                     : 'hover:bg-gray-50 dark:hover:bg-gray-700 border border-transparent hover:border-gray-100 dark:hover:border-gray-600 bg-gray-50/50 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300'
                                                 }
                                                 ${isToday && !isSelected ? 'ring-2 ring-primary/50 ring-offset-2 dark:ring-offset-gray-800' : ''}
                                             `}
                                         >
                                             <span className={`text-sm font-bold ${isSelected ? 'text-white' : ''}`}>
                                                 {day.date.getDate()}
                                             </span>
                                             {day.hasCharges && (
                                                 <div className="flex gap-1 absolute bottom-2">
                                                     <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-primary'}`}></div>
                                                 </div>
                                             )}
                                         </button>
                                     );
                                 });
                                 return [...blanks, ...days];
                             })()}
                         </div>
                         
                         {/* Legend */}
                         <div className="mt-auto pt-8 flex gap-4 text-xs font-bold text-gray-400 uppercase tracking-wider justify-center shrink-0">
                             <div className="flex items-center gap-2">
                                 <div className="w-2 h-2 rounded-full bg-primary shadow-sm shadow-primary/50"></div>
                                 <span className="mt-0.5">Cobranças</span>
                             </div>
                             <div className="flex items-center gap-2">
                                 <div className="w-3 h-3 rounded-full border-2 border-primary/50"></div>
                                 <span className="mt-0.5">Hoje</span>
                             </div>
                         </div>
                    </div>

                    {/* Right Column: Selected Day Details */}
                    <div className="lg:col-span-8 space-y-6 flex flex-col h-full">
                        {/* Summary Card for Selected Day */}
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl p-8 relative overflow-hidden shadow-xl shadow-blue-900/20 text-white shrink-0">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                            
                            <div className="relative z-10 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-blue-200 uppercase tracking-widest mb-2">
                                        Resumo Diário • {isSameDay(selectedDate, new Date()) ? 'Hoje' : selectedDate.toLocaleDateString('pt-BR')}
                                    </p>
                                    <div className="flex items-end gap-4 mb-2">
                                        <h3 className="text-5xl font-black tracking-tight drop-shadow-sm">
                                            <span className="text-2xl text-blue-300 font-medium mr-2">R$</span>
                                            {totalSelectedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </h3>
                                    </div>
                                    
                                    <div className="flex items-center gap-4 mt-6">
                                        <div className="bg-black/20 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 border border-white/10 shadow-inner">
                                            <Banknote className="w-4 h-4 text-blue-200" />
                                            {selectedDayCharges.length} Cobranças no dia
                                        </div>
                                        {lateCount > 0 && (
                                            <div className="bg-red-500/20 backdrop-blur-md border border-red-500/30 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 text-red-100 shadow-inner">
                                                <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></div>
                                                {lateCount} em atraso
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="hidden md:flex w-24 h-24 bg-white/10 backdrop-blur-xl rounded-[2rem] items-center justify-center border border-white/20 shadow-2xl rotate-3">
                                    <CalendarIcon className="w-10 h-10 text-white opacity-90" />
                                </div>
                            </div>
                        </div>

                        {/* Charges List Desktop */}
                        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 flex-1 min-h-0 flex flex-col">
                            <div className="flex items-center justify-between mb-6 shrink-0">
                                <h3 className="font-black text-gray-900 dark:text-white text-xl">Detalhes das Cobranças</h3>
                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-100 dark:bg-gray-900/50 px-3 py-1 rounded-lg">
                                    {selectedDayCharges.length} Registros
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 space-y-4 no-scrollbar">
                                {loading ? (
                                    <div className="h-full flex items-center justify-center flex-col text-gray-400 gap-4">
                                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                        <p className="font-bold text-sm">Atualizando calendário...</p>
                                    </div>
                                ) : selectedDayCharges.length === 0 ? (
                                    <div className="h-full flex items-center justify-center flex-col text-gray-400 gap-4 opacity-70">
                                        <div className="w-20 h-20 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center">
                                            <CalendarIcon className="w-8 h-8 text-gray-300" />
                                        </div>
                                        <p className="font-bold text-sm text-gray-500 tracking-wide">Dia limpo. Nenhuma cobrança pendente!</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4 pb-4">
                                        {selectedDayCharges.map((item, index) => {
                                            const installments = generateInstallments(item.loan);
                                            const overdue = installments.filter(i => i.status === 'late');
                                            const isLate = overdue.length > 0;

                                            return (
                                                <div 
                                                    key={`desktop-${item.loan.id}-${item.installment.number}`}
                                                    className="group flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 hover:bg-white dark:hover:bg-gray-800 hover:shadow-xl hover:-translate-y-0.5 hover:border-blue-100 dark:hover:border-blue-900/30 transition-all duration-300 cursor-pointer"
                                                    onClick={() => onLoanSelect(item.loan.id)}
                                                >
                                                    <div className="flex items-center gap-4 mb-4 sm:mb-0">
                                                        <div className="w-12 h-12 rounded-full bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                                                            {item.loan.client?.avatar_url && !item.loan.client.avatar_url.includes('ui-avatars.com') ? (
                                                                <img src={item.loan.client.avatar_url} alt={item.loan.client.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="font-black text-gray-400 uppercase text-lg">{item.loan.client?.name?.charAt(0)}</span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-black text-gray-900 dark:text-white group-hover:text-primary transition-colors text-base">{item.loan.client?.name}</h4>
                                                            <div className="flex items-center gap-3 mt-1">
                                                                <span className="text-xs font-bold text-gray-400">Contrato: #{item.loan.id.substring(0, 6)}</span>
                                                                <span className={`text-[9px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full ${
                                                                    item.installment.status === 'late' 
                                                                        ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' 
                                                                        : 'bg-yellow-50 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400'
                                                                }`}>
                                                                    {item.installment.status === 'late' ? 'Atrasado' : 'Pendente'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-6 sm:gap-8">
                                                        <div className="text-left sm:text-right">
                                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Valor da Parcela</p>
                                                            <p className="text-lg font-black text-gray-900 dark:text-white">
                                                                R$ {item.installment.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </p>
                                                        </div>
                                                        
                                                        <div className="flex items-center gap-2">
                                                            {item.loan.client?.address && (
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const client = item.loan.client;
                                                                        const addressQuery = `${client?.address}, ${client?.number || ''}, ${client?.city || ''}, ${client?.state || ''}`;
                                                                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`, '_blank');
                                                                    }}
                                                                    className="p-3.5 rounded-xl bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-blue-600 transition-all shadow-sm active:scale-95"
                                                                    title="Ver no Mapa"
                                                                >
                                                                    <MapPin className="w-5 h-5" />
                                                                </button>
                                                            )}
                                                            <button 
                                                                onClick={(e) => handleChargeLoan(e, item.loan)}
                                                                className={`flex items-center gap-2 px-5 py-3.5 rounded-xl font-bold transition-all shadow-sm active:scale-95 ${
                                                                    isLate 
                                                                        ? 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/30' 
                                                                        : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-primary hover:text-primary'
                                                                }`}
                                                            >
                                                                <Banknote className="w-5 h-5" />
                                                                <span className="hidden sm:inline">Realizar Cobrança</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
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
                                    className="w-full p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-lg font-manrope font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
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
        </>
    );
};
