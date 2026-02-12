import React from 'react';
import { LogOut, Edit2, Shield, MapPin, CreditCard, ChevronRight, Lock } from 'lucide-react';

interface ProfileProps {
    onLogout: () => void;
    userEmail?: string;
}

export const Profile: React.FC<ProfileProps> = ({ onLogout, userEmail }) => {
  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <header className="bg-primary dark:bg-black text-white px-6 pt-12 pb-20 rounded-b-b-header shadow-lg relative z-10">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold">Configurações</h1>
            <button onClick={onLogout} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                <LogOut className="w-5 h-5 text-gray-300" />
            </button>
        </div>
        <p className="text-gray-400 text-sm max-w-xs">Gerencie sua conta e preferências</p>
        
        {/* Absolute positioned profile picture overlap */}
        <div className="absolute -bottom-14 left-1/2 transform -translate-x-1/2">
            <div className="relative">
                <div className="w-28 h-28 rounded-full border-4 border-background-light dark:border-background-dark overflow-hidden bg-primary shadow-xl flex items-center justify-center text-3xl font-bold text-white">
                     {userEmail ? userEmail.charAt(0).toUpperCase() : 'A'}
                </div>
                <button className="absolute bottom-1 right-1 bg-secondary text-white p-2 rounded-full shadow-lg border-2 border-background-light dark:border-background-dark">
                    <Edit2 className="w-4 h-4" />
                </button>
            </div>
        </div>
      </header>

      <main className="flex-1 px-5 pt-20 pb-32 overflow-y-auto no-scrollbar space-y-6">
        
        <section>
            <h3 className="text-xs font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-3 pl-1">Informações Pessoais</h3>
            <div className="bg-card-light dark:bg-card-dark rounded-2xl p-2 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="p-3 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-gray-400 mb-0.5">Email</p>
                        <p className="font-semibold text-gray-800 dark:text-white">{userEmail}</p>
                    </div>
                    <Edit2 className="w-4 h-4 text-gray-300" />
                </div>
            </div>
        </section>

        <section>
            <h3 className="text-xs font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-3 pl-1">Dados de Pagamento</h3>
             <div className="bg-card-light dark:bg-card-dark rounded-2xl p-2 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-gray-400 mb-0.5">Chave PIX</p>
                        <p className="font-semibold text-gray-800 dark:text-white">123.456.789-00</p>
                    </div>
                    <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        <CreditCard className="w-4 h-4 text-gray-500" />
                    </div>
                </div>
                <div className="p-3 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-gray-400 mb-0.5">Beneficiário PIX</p>
                        <p className="font-semibold text-gray-800 dark:text-white">Fintech Solutions Ltda</p>
                    </div>
                    <Edit2 className="w-4 h-4 text-gray-300" />
                </div>
             </div>
        </section>

        <section>
             <h3 className="text-xs font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-3 pl-1">Localização</h3>
             <div className="bg-card-light dark:bg-card-dark rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex justify-between items-center">
                <div>
                     <p className="text-xs text-gray-400 mb-0.5">Cidade</p>
                     <p className="font-semibold text-gray-800 dark:text-white">São Paulo, SP</p>
                </div>
                 <Edit2 className="w-4 h-4 text-gray-300" />
             </div>
        </section>

        <section>
            <h3 className="text-xs font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-3 pl-1">Segurança</h3>
             <button className="w-full bg-card-light dark:bg-card-dark rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex justify-between items-center group active:scale-[0.99] transition-transform">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500">
                        <Lock className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-gray-800 dark:text-white">Trocar Senha</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
             </button>
        </section>

        <div className="text-center pt-4 pb-8">
            <button onClick={onLogout} className="text-red-500 text-sm font-semibold hover:underline">Sair da conta</button>
            <p className="text-[10px] text-gray-400 mt-2">Versão 2.5.0</p>
        </div>

      </main>
    </div>
  );
};