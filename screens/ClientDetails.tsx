import React, { useEffect, useState } from 'react';
import { ArrowLeft, MoreVertical, ShieldCheck, CreditCard, Phone, Mail, PlusCircle, Edit, AlertCircle, FileText, ExternalLink, MapPin, Navigation } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Client, Loan } from '../types';

interface ClientDetailsProps {
    clientId: string | null;
    onBack: () => void;
    onNewLoan: () => void;
    onEdit: () => void;
    onLoanSelect: (id: string) => void;
}

export const ClientDetails: React.FC<ClientDetailsProps> = ({ clientId, onBack, onNewLoan, onEdit, onLoanSelect }) => {
    const [client, setClient] = useState<Client | null>(null);
    const [loans, setLoans] = useState<Loan[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (clientId) {
            fetchClientData(clientId);
        }
    }, [clientId]);

    const calculateOverdueStats = (loan: Loan): { count: number, amount: number } => {
        if (loan.status === 'paid') return { count: 0, amount: 0 };

        const count = loan.installments || 1;
        const installmentValue = loan.installment_value || (loan.amount / count);

        let startDate: Date;
        if (loan.due_date) {
            const [year, month, day] = loan.due_date.split('-').map(Number);
            startDate = new Date(year, month - 1, day);
        } else {
            startDate = new Date(loan.created_at || Date.now());
        }

        const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
        const totalPaid = totalDebt - Number(loan.balance);

        let paidAccumulator = 0;
        let overdueSum = 0;
        let overdueCount = 0;
        let dailyDateTracker = new Date(startDate);

        const today = new Date();
        const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        for (let i = 0; i < count; i++) {
            let date: Date;

            if (loan.frequency === 'Diária') {
                if (i === 0) {
                    date = new Date(startDate);
                } else {
                    date = new Date(dailyDateTracker);
                    date.setDate(date.getDate() + 1);

                    while (true) {
                        const day = date.getDay();
                        if (loan.skip_saturday && day === 6) {
                            date.setDate(date.getDate() + 1);
                            continue;
                        }
                        if (loan.skip_sunday && day === 0) {
                            date.setDate(date.getDate() + 1);
                            continue;
                        }
                        break;
                    }
                }
                dailyDateTracker = new Date(date);
            } else {
                date = new Date(startDate);
                if (loan.frequency === 'Semanal') {
                    date.setDate(startDate.getDate() + (i * 7));
                } else if (loan.frequency === 'Quinzenal') {
                    date.setDate(startDate.getDate() + (i * 15));
                } else {
                    date.setMonth(startDate.getMonth() + i);
                }
            }

            // Check if this installment is paid
            if (paidAccumulator + (installmentValue * 0.99) < totalPaid) {
                paidAccumulator += installmentValue;
                continue; // This one is paid
            }

            // This is an unpaid installment
            const dateZero = new Date(date.getFullYear(), date.getMonth(), date.getDate());

            if (dateZero < todayZero) {
                overdueSum += installmentValue;
                overdueCount++;
            }
        }

        return { count: overdueCount, amount: overdueSum };
    };

    const fetchClientData = async (id: string) => {
        setLoading(true);
        try {
            const { data: clientData, error: clientError } = await supabase
                .from('clients')
                .select('*')
                .eq('id', id)
                .single();

            if (clientError) throw clientError;

            const { data: loansData, error: loansError } = await supabase
                .from('loans')
                .select('*')
                .eq('client_id', id)
                .order('created_at', { ascending: false });

            if (loansError) throw loansError;

            // Calculate debt
            const debt = loansData.reduce((acc: number, curr: any) => acc + Number(curr.balance), 0);
            const overdueStats = loansData.reduce((acc: { count: number, amount: number }, curr: any) => {
                const stats = calculateOverdueStats(curr);
                return { count: acc.count + stats.count, amount: acc.amount + stats.amount };
            }, { count: 0, amount: 0 });

            setClient({ ...clientData, debt, overdueStats });
            setLoans(loansData || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const isLoanLate = (loan: Loan): boolean => {
        if (loan.status === 'paid') return false;
        if (loan.status === 'late') return true;

        const count = loan.installments || 1;
        const installmentValue = loan.installment_value || (loan.amount / count);
        const startDate = loan.due_date ? new Date(loan.due_date) : new Date(loan.created_at || Date.now());

        // Total Debt = installment_value * installments
        const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
        const totalPaid = totalDebt - Number(loan.balance);

        let paidAccumulator = 0;
        let dailyDateTracker = new Date(startDate);

        for (let i = 0; i < count; i++) {
            let date: Date;

            if (loan.frequency === 'Diária') {
                if (i === 0) {
                    date = new Date(startDate);
                } else {
                    date = new Date(dailyDateTracker);
                    date.setDate(date.getDate() + 1);

                    while (true) {
                        const day = date.getDay();
                        if (loan.skip_saturday && day === 6) {
                            date.setDate(date.getDate() + 1);
                            continue;
                        }
                        if (loan.skip_sunday && day === 0) {
                            date.setDate(date.getDate() + 1);
                            continue;
                        }
                        break;
                    }
                }
                dailyDateTracker = new Date(date);
            } else {
                date = new Date(startDate);
                if (loan.frequency === 'Semanal') {
                    date.setDate(startDate.getDate() + (i * 7));
                } else if (loan.frequency === 'Quinzenal') {
                    date.setDate(startDate.getDate() + (i * 15));
                } else {
                    date.setMonth(startDate.getMonth() + i);
                }
            }

            // Check if this installment is paid
            if (paidAccumulator + (installmentValue * 0.99) < totalPaid) {
                paidAccumulator += installmentValue;
                continue; // This one is paid
            }

            // This is the first unpaid installment
            const today = new Date();
            const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const dateZero = new Date(date.getFullYear(), date.getMonth(), date.getDate());

            if (dateZero < todayZero) {
                return true;
            }
            return false; // First unpaid is in future or today
        }

        return false;
    };

    if (loading || !client) {
        return <div className="h-full flex items-center justify-center bg-background-light dark:bg-background-dark">Carregando...</div>;
    }

    const isClientLate = loans.some(loan => isLoanLate(loan));

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark overflow-hidden">
            {/* Mobile View */}
            <div className="md:hidden flex flex-col h-full overflow-hidden">
                <header className="bg-black text-white px-6 pt-12 pb-10 rounded-b-[40px] relative z-10 shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 active:scale-95 transition-transform hover:bg-white/20">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h1 className="text-lg font-semibold">Perfil do Cliente</h1>
                        <div className="w-10 h-10"></div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="w-24 h-24 rounded-[25px] bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 border-4 border-white dark:border-zinc-900 shadow-xl overflow-hidden flex items-center justify-center">
                            {client.avatar_url && !client.avatar_url.includes('ui-avatars.com') ? (
                                <img alt="Perfil" className="w-full h-full object-cover" src={client.avatar_url} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 text-lg font-bold">{client.name.substring(0, 2).toUpperCase()}</div>
                            )}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">{client.name}</h2>
                            <p className="text-white/60 text-sm font-medium">Cliente desde {new Date(client.created_at || Date.now()).toLocaleDateString()}</p>
                        </div>
                    </div>
                </header>

                <div className="px-6 -mt-4 relative z-20 shrink-0">
                    <div className="bg-card-light dark:bg-card-dark rounded-2xl p-5 shadow-xl shadow-black/5 flex justify-between items-center border border-gray-100 dark:border-gray-800">
                        <div className="flex flex-col">
                            <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium mb-1">Total Devido</span>
                            <span className="text-xl font-bold text-primary dark:text-white">R$ {client.debt?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="h-10 w-px bg-gray-100 dark:bg-gray-800"></div>
                        <div className="flex flex-col items-end">
                            <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium mb-1">Status Geral</span>
                            {!isClientLate && (client.status === 'active' || client.status === 'paid') ? (
                                <div className="flex items-center gap-1.5 text-secondary font-bold text-sm">
                                    <ShieldCheck className="w-4 h-4" />
                                    <span>Regular</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 text-danger font-bold text-sm">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>Irregular</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <main className="flex-1 px-6 pt-6 pb-32 space-y-6 overflow-y-auto no-scrollbar">
                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-primary dark:text-white uppercase tracking-wider">Dados Pessoais</h3>
                        </div>
                        <div className="bg-card-light dark:bg-card-dark rounded-2xl p-5 border border-gray-100 dark:border-gray-800 space-y-4 shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-primary dark:text-white">
                                    <CreditCard className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold tracking-tight">CPF</p>
                                    <p className="text-sm font-semibold text-gray-800 dark:text-white">{client.cpf || 'Não informado'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-primary dark:text-white">
                                    <Phone className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold tracking-tight">Telefone</p>
                                    {client.phone ? (
                                        <a
                                            href={`https://wa.me/55${client.phone.replace(/\D/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                                        >
                                            {client.phone}
                                        </a>
                                    ) : (
                                        <p className="text-sm font-semibold text-gray-800 dark:text-white">Não informado</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-primary dark:text-white">
                                    <MapPin className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[10px] text-text-sub-light dark:text-text-sub-dark uppercase font-bold tracking-tight">Endereço</p>
                                    <p className="text-sm font-semibold text-gray-800 dark:text-white">
                                        {client.address ? `${client.address}, ${client.number || 'S/N'}${client.city ? ` - ${client.city}/${client.state}` : ''}` : 'Não informado'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-primary dark:text-white uppercase tracking-wider">Histórico de Empréstimos</h3>
                        </div>
                        <div className="space-y-3">
                            {loans.map(loan => {
                                const isLate = isLoanLate(loan);
                                const displayStatus = isLate ? 'late' : loan.status;
                                return (
                                    <div
                                        key={loan.id}
                                        onClick={() => onLoanSelect(loan.id)}
                                        className="bg-card-light dark:bg-card-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <p className="text-[10px] font-bold text-text-sub-light dark:text-text-sub-dark uppercase">Contrato #{loan.id.substring(0, 6)}</p>
                                                <p className="font-bold text-gray-900 dark:text-white">R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${displayStatus === 'active' ? 'bg-green-100 text-green-700' : displayStatus === 'paid' ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700'}`}>
                                                {displayStatus === 'active' ? 'Ativo' : displayStatus === 'paid' ? 'Quitado' : 'Atrasado'}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </section>

                    {/* Documents Section - Mobile */}
                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-primary dark:text-white uppercase tracking-wider">Documentos Anexados</h3>
                        </div>
                        {client.documents && client.documents.length > 0 ? (
                            <div className="grid grid-cols-3 gap-3">
                                {client.documents.map((docUrl, index) => (
                                    <a
                                        key={index}
                                        href={docUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="aspect-square bg-card-light dark:bg-card-dark rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden relative group shadow-sm"
                                    >
                                        <img
                                            src={docUrl}
                                            alt={`Doc ${index}`}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                            }}
                                        />
                                        <div className="hidden w-full h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800 text-gray-400">
                                            <FileText className="w-8 h-8 mb-1" />
                                            <span className="text-[10px]">Arquivo</span>
                                        </div>
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ExternalLink className="text-white w-5 h-5" />
                                        </div>
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-card-light dark:bg-card-dark rounded-2xl p-6 border border-dashed border-gray-200 dark:border-gray-700 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
                                <FileText className="w-8 h-8 opacity-20" />
                                <span>Nenhum documento anexado.</span>
                            </div>
                        )}
                    </section>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button onClick={onNewLoan} className="bg-primary text-white py-3.5 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"><PlusCircle className="w-5 h-5" /> Novo Empréstimo</button>
                        <button onClick={onEdit} className="bg-white text-primary border border-gray-200 py-3.5 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"><Edit className="w-5 h-5" /> Editar Cadastro</button>
                    </div>
                </main>
            </div>

            {/* Desktop View */}
            <div className="hidden md:flex flex-1 flex-col overflow-hidden">
                <header className="px-8 py-6 bg-white dark:bg-card-dark border-b border-gray-100 dark:border-gray-800">
                    <div className="max-w-6xl mx-auto w-full flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <button onClick={onBack} className="w-10 h-10 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <div className="flex items-center gap-2 text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">
                                    <span>Clientes</span>
                                    <span>/</span>
                                    <span className="text-gray-900 dark:text-white">Perfil do Cliente</span>
                                </div>
                                <h1 className="text-xl font-black text-gray-900 dark:text-white">{client.name}</h1>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onEdit}
                                className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-2xl text-[11px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all flex items-center gap-2"
                            >
                                <Edit className="w-4 h-4 text-gray-400" />
                                Editar Cadastro
                            </button>
                            <button
                                onClick={onNewLoan}
                                className="px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:opacity-90 shadow-lg transition-all active:scale-95"
                            >
                                <PlusCircle className="w-4 h-4" />
                                Novo Empréstimo
                            </button>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8 bg-gray-50 dark:bg-background-dark no-scrollbar">
                    <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8">
                        {/* Sidebar Column */}
                        <div className="lg:w-80 flex flex-col gap-6">
                            {/* Profile Card */}
                            <div className="bg-white dark:bg-card-dark rounded-3xl p-8 border border-gray-100 dark:border-gray-800 shadow-sm text-center">
                                <div className="w-32 h-32 rounded-[40px] bg-gray-100 dark:bg-gray-800 mx-auto mb-6 flex-shrink-0 border-4 border-gray-50 dark:border-gray-700 shadow-inner overflow-hidden flex items-center justify-center">
                                    {client.avatar_url && !client.avatar_url.includes('ui-avatars.com') ? (
                                        <img alt="Perfil" className="w-full h-full object-cover" src={client.avatar_url} />
                                    ) : (
                                        <div className="text-3xl font-black text-gray-400">{client.name.substring(0, 2).toUpperCase()}</div>
                                    )}
                                </div>
                                <h2 className="text-xl font-black text-gray-900 dark:text-white mb-2">{client.name}</h2>
                                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">{client.email || 'Sem e-mail'}</p>

                                <div className="mt-8 flex flex-col gap-3">
                                    <div className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${isClientLate ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/20' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20'}`}>
                                        {isClientLate ? 'Inadimplente' : 'Status em Dia'}
                                    </div>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Desde {new Date(client.created_at || Date.now()).toLocaleDateString('pt-BR')}</p>
                                </div>
                            </div>

                            {/* Contact Card */}
                            <div className="bg-white dark:bg-card-dark rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col gap-6">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Informações de Contato</h3>
                                <div className="flex flex-col gap-5">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-600">
                                            <Phone className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">WhatsApp</p>
                                            <a
                                                href={`https://wa.me/55${client.phone?.replace(/\D/g, '')}`}
                                                target="_blank"
                                                className="text-sm font-bold text-gray-900 dark:text-white hover:text-green-600 transition-colors"
                                            >
                                                {client.phone || '-'}
                                            </a>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Endereço</p>
                                            <p className="text-sm font-bold text-gray-900 dark:text-white leading-relaxed">
                                                {client.address ? `${client.address}, ${client.number || 'S/N'}` : '-'}
                                                {client.city && <span className="block text-xs text-gray-400">{client.city}/{client.state}</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400">
                                            <CreditCard className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Documento CPF</p>
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">{client.cpf || '-'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Main Content Column */}
                        <div className="flex-1 flex flex-col gap-8">
                            {/* Stats Summary */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-white dark:bg-card-dark rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-3">Total Devido</p>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-black text-gray-900 dark:text-white">R$ {client.debt?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                                <div className="bg-white dark:bg-card-dark rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-3">Parcelas em Atraso</p>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-2xl font-black ${(client as any).overdueStats?.count > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                            {(client as any).overdueStats?.count || 0}
                                        </span>
                                        {((client as any).overdueStats?.amount > 0) && (
                                            <span className="text-xs font-bold text-rose-400">R$ {(client as any).overdueStats.amount.toLocaleString('pt-BR')}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="bg-white dark:bg-card-dark rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-3">Contratos Ativos</p>
                                    <span className="text-2xl font-black text-gray-900 dark:text-white">{loans.filter(l => l.status === 'active' || l.status === 'late').length}</span>
                                </div>
                            </div>

                            {/* Loan History Grid */}
                            <div className="flex flex-col gap-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Histórico de Contratos</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {loans.map(loan => {
                                        const isLate = isLoanLate(loan);
                                        const displayStatus = isLate ? 'late' : loan.status;
                                        return (
                                            <div
                                                key={loan.id}
                                                onClick={() => onLoanSelect(loan.id)}
                                                className="bg-white dark:bg-card-dark rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-blue-100 dark:hover:border-blue-900/30 transition-all cursor-pointer group"
                                            >
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">#{loan.id.substring(0, 6)}</p>
                                                        </div>
                                                        <p className="text-xl font-black text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">R$ {Number(loan.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                    </div>
                                                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${displayStatus === 'active' ? 'bg-emerald-50 text-emerald-600' : displayStatus === 'paid' ? 'bg-gray-50 text-gray-400' : 'bg-rose-50 text-rose-600'}`}>
                                                        {displayStatus === 'active' ? 'Ativo' : displayStatus === 'paid' ? 'Quitado' : 'Atrasado'}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col gap-3">
                                                    <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                        <span>Progressão</span>
                                                        <span>{loan.progress}%</span>
                                                    </div>
                                                    <div className="h-1.5 bg-gray-50 dark:bg-gray-800 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full transition-all duration-700 ${displayStatus === 'active' ? 'bg-emerald-500' : displayStatus === 'paid' ? 'bg-gray-300' : 'bg-rose-500'}`} style={{ width: `${loan.progress}%` }}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Documents Gallery */}
                            <div className="flex flex-col gap-6">
                                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Documentação e Arquivos</h3>
                                {client.documents && client.documents.length > 0 ? (
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                        {client.documents.map((docUrl, index) => (
                                            <a
                                                key={index}
                                                href={docUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="aspect-[4/5] bg-white dark:bg-card-dark rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden relative group shadow-sm hover:shadow-lg transition-all"
                                            >
                                                <img src={docUrl} alt={`Doc ${index}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ExternalLink className="text-white w-6 h-6" />
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="bg-white dark:bg-card-dark rounded-3xl p-10 border border-dashed border-gray-200 dark:border-gray-800 text-center text-gray-400">
                                        <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                        <p className="text-xs font-bold uppercase tracking-widest">Sem documentos anexados</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};