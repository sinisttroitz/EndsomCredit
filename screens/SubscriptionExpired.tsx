import React from 'react';
import { Clock, ShieldCheck, MessageCircle, ExternalLink } from 'lucide-react';

interface SubscriptionExpiredProps {
    onLogout: () => void;
}

export const SubscriptionExpired: React.FC<SubscriptionExpiredProps> = ({ onLogout }) => {
    return (
        <div className="flex flex-col h-full bg-[#111827] relative overflow-hidden">
            {/* Background pattern */}
            <div className="absolute top-0 left-0 right-0 h-full opacity-[0.03] pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary rounded-full blur-[120px]"></div>
            </div>

            <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 text-center">
                <div className="w-24 h-24 bg-white/100 rounded-[1rem] flex items-center justify-center mb-3 border border-white/10 shadow-2xl">
                    <Clock className="w-12 h-12 text-primary" />
                </div>

                <h1 className="text-white text-3xl font-bold tracking-tight mb-4">Acesso Expirado</h1>
                <p className="text-white/60 text-lg mb-12 max-w-xs mx-auto">
                    Seu período de acesso terminou. Renova sua Assinatura agora mesmo pelo botão abaixo.
                </p>

                <div className="w-full max-w-sm space-y-4">
                    <a
                        href="https://pay.cakto.com.br/36whx5j_805010"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-[#1DA74D] hover:bg-[#158f3e] text-white font-bold py-5 rounded-2xl active:scale-[0.98] transition-all duration-200 flex items-center justify-center text-xl gap-3 border border-[#1DA74D]/50"
                    >
                        Assinar Plano <ExternalLink className="w-5 h-5" />
                    </a>

                    <button
                        onClick={onLogout}
                        className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-4 rounded-2xl active:scale-[0.98] transition-all duration-200 flex items-center justify-center text-lg mt-2"
                    >
                        Sair da Conta
                    </button>

                    <a
                        href="https://wa.me/5564992032926?text=Olá,%20estou%20com%20dúvidas%20sobre%20a%20renovação%20do%20Agicred"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-6 inline-block text-white/40 hover:text-white/80 text-sm font-medium transition-colors underline underline-offset-4"
                    >
                        Precisa de ajuda? Fale com o suporte
                    </a>
                </div>

                <div className="mt-16 flex items-center space-x-2 opacity-20">
                    <ShieldCheck className="w-4 h-4 text-white" />
                    <span className="text-[10px] uppercase font-bold tracking-[0.15em] text-white">Segurança AgiCred</span>
                </div>
            </main>
        </div>
    );
};
