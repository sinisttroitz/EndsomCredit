import React, { useState, useEffect } from 'react';
import { ChevronLeft, Award, ExternalLink } from 'lucide-react';
import { Profile as UserProfileData } from '../types';
import { supabase } from '../supabaseClient';

interface SubscriptionProps {
    onBack: () => void;
    userProfile: UserProfileData | null;
}

export const Subscription: React.FC<SubscriptionProps> = ({ onBack, userProfile }) => {
    const [cardVipUrl, setCardVipUrl] = useState<string>('');

    useEffect(() => {
        const fetchCardUrl = async () => {
            try {
                const { data } = supabase.storage
                    .from('system')
                    .getPublicUrl('cardvip.webp');

                if (data && data.publicUrl) {
                    setCardVipUrl(`${data.publicUrl}?t=${new Date().getTime()}`);
                }
            } catch (err) {
                console.error("Error fetching cardvip image:", err);
            }
        };
        fetchCardUrl();
    }, []);

    return (
        <div className="flex flex-col h-full bg-[#F3F4F6] dark:bg-[#111827] relative">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-white/80 dark:bg-[#1F2937]/80 backdrop-blur-xl border-b border-gray-100 dark:border-white/5 px-4 py-4 md:px-8">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 active:scale-95 transition-all hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-[19px] font-black text-gray-900 dark:text-white leading-tight">Sua Assinatura</h1>
                        <p className="text-[11px] font-medium text-gray-500">Gerencie seu plano premium</p>
                    </div>
                </div>
            </div>

            <main className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar pb-24 md:pb-8 flex justify-center">
                <div className="w-full max-w-sm flex flex-col gap-4 mt-4 md:mt-8">
                    {/* Top Card: Image */}
                    {cardVipUrl ? (
                        <div className="relative w-full group flex justify-center">
                            <img src={cardVipUrl} alt="Premium VIP Card" className="w-full h-auto object-contain" />
                        </div>
                    ) : (
                        <div className="w-full h-48 animate-pulse flex items-center justify-center">
                            <Award className="w-10 h-10 text-gray-400/50" />
                        </div>
                    )}

                    {/* Highlight Text */}
                    <div className="text-center py-6 px-4">
                        <p className="text-[22px] font-black text-gray-900 dark:text-white leading-tight uppercase tracking-tight drop-shadow-sm">
                            Todo o potencial do <span className="text-[#F97316]">AgiCred</span> está disponível para você!
                        </p>
                        <div className="w-12 h-1 bg-[#F97316] mx-auto mt-4 rounded-full opacity-80"></div>
                    </div>

                    {/* Subscription Info (No Card) */}
                    <div className="flex flex-col items-center mt-2 px-2">
                        <div className="flex justify-between items-center w-full mb-5">
                            <span className="text-gray-600 dark:text-gray-300 text-[16px] font-bold tracking-tight">Status do Período Atual</span>
                            <span className="text-[#F97316] font-black text-lg">
                                {(() => {
                                    if (!userProfile?.access_until) return '0 dias';
                                    const d = Math.ceil((new Date(userProfile.access_until).getTime() - Date.now()) / 86400000);
                                    return `${Math.max(d, 0)} dias`;
                                })()}
                            </span>
                        </div>

                        {/* Progress bar */}
                        <div className="h-[6px] w-full bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden mb-6">
                            <div
                                className="h-full bg-[#F97316] rounded-full transition-all duration-1000 ease-out"
                                style={{
                                    width: (() => {
                                        if (!userProfile?.access_until) return '0%';
                                        const d = Math.ceil((new Date(userProfile.access_until).getTime() - Date.now()) / 86400000);
                                        const pct = Math.min(100, Math.max(0, (d / 30) * 100)); // Assuming a visual full bar of 30 days
                                        return `${pct}%`;
                                    })()
                                }}
                            ></div>
                        </div>

                        <p className="text-gray-500 dark:text-gray-400 text-[15px] font-medium text-center leading-relaxed mb-8">
                            {(() => {
                                if (!userProfile?.access_until) return 'Sua assinatura expirou.';
                                const dt = new Date(userProfile.access_until);
                                const dia = dt.getDate();
                                const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                                return `Sua assinatura expira automaticamente em ${dia} de ${meses[dt.getMonth()]}. Voce pode renovar o plano clicando no botao abaixo.`;
                            })()}
                        </p>

                        <a
                            href="https://pay.cakto.com.br/36whx5j_805010"
                            className="w-full bg-[#1DA74D] hover:bg-[#158f3e] text-white font-bold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-900/20"
                        >
                            Renovar Plano <ExternalLink className="w-5 h-5" />
                        </a>
                    </div>
                </div>
            </main>
        </div>
    );
};
