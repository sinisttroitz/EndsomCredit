import React from 'react';
import { Home, Users, Wallet, User, Plus, X } from 'lucide-react';
import { ViewState } from '../types';

interface BottomNavProps {
    currentView: ViewState;
    onNavigate: (view: ViewState) => void;
    isMenuOpen: boolean;
    setIsMenuOpen: (open: boolean) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onNavigate, isMenuOpen, setIsMenuOpen }) => {

    // Hide nav on specific screens that should be full screen or have their own flow
    if (currentView === 'login' || currentView === 'new-loan' || currentView === 'new-client' || currentView === 'edit-client' || currentView === 'user-notifications' || currentView === 'pix-key-form') return null;

    return (
        <>
            {/* Overlay for FAB Menu */}
            {isMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
                    onClick={() => setIsMenuOpen(false)}
                ></div>
            )}

            {/* FAB Menu */}
            <div className={`fixed bottom-28 left-1/2 transform -translate-x-1/2 z-40 flex flex-row gap-3 w-[min(90vw,400px)] transition-all duration-300 ${isMenuOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-10 scale-90 pointer-events-none'}`}>
                <button
                    onClick={() => { setIsMenuOpen(false); onNavigate('new-loan'); }}
                    className="flex-1 flex flex-row items-center justify-center gap-2 bg-white dark:bg-gray-800 text-primary dark:text-white px-3 py-3 rounded-2xl shadow-2xl font-bold hover:bg-gray-50 active:scale-95 transition-all border border-gray-100 dark:border-gray-700"
                >
                    <Wallet className="w-5 h-5 text-secondary shrink-0" />
                    <span className="text-[10px] leading-none whitespace-nowrap">Novo Empréstimo</span>
                </button>
                <button
                    onClick={() => { setIsMenuOpen(false); onNavigate('new-client'); }}
                    className="flex-1 flex flex-row items-center justify-center gap-2 bg-white dark:bg-gray-800 text-primary dark:text-white px-3 py-3 rounded-2xl shadow-2xl font-bold hover:bg-gray-50 active:scale-95 transition-all border border-gray-100 dark:border-gray-700"
                >
                    <Users className="w-5 h-5 text-accent-blue shrink-0" />
                    <span className="text-[10px] leading-none whitespace-nowrap">Novo Cliente</span>
                </button>
            </div>

            {/* Bottom Nav Bar */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1A1A1A] border-t border-gray-200 dark:border-gray-800 pb-safe pt-2 px-6 pb-6 z-50">
                <div className="flex justify-between items-center max-w-sm mx-auto">
                    <button
                        onClick={() => onNavigate('dashboard')}
                        className={`flex flex-col items-center justify-center w-12 h-12 transition-colors ${currentView === 'dashboard' ? 'text-primary dark:text-white' : 'text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-white'}`}
                    >
                        <div className={`mb-1 p-1.5 rounded-full transition-colors ${currentView === 'dashboard' ? 'bg-primary/10 dark:bg-white/10' : ''}`}>
                            <Home className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium">Início</span>
                    </button>

                    <button
                        onClick={() => onNavigate('clients')}
                        className={`flex flex-col items-center justify-center w-12 h-12 transition-colors ${currentView === 'clients' ? 'text-primary dark:text-white' : 'text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-white'}`}
                    >
                        <div className={`mb-1 p-1.5 rounded-full transition-colors ${currentView === 'clients' ? 'bg-primary/10 dark:bg-white/10' : ''}`}>
                            <Users className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium">Clientes</span>
                    </button>

                    {/* FAB Trigger */}
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className={`relative -top-5 bg-primary text-white w-14 h-14 rounded-full shadow-lg shadow-primary/40 flex items-center justify-center transform transition duration-200 ${isMenuOpen ? 'rotate-45 bg-red-500' : 'active:scale-95 hover:scale-105'}`}
                    >
                        {isMenuOpen ? <Plus className="w-7 h-7" /> : <Plus className="w-7 h-7" />}
                    </button>

                    <button
                        onClick={() => onNavigate('loans')}
                        className={`flex flex-col items-center justify-center w-12 h-12 transition-colors ${currentView === 'loans' ? 'text-primary dark:text-white' : 'text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-white'}`}
                    >
                        <div className={`mb-1 p-1.5 rounded-full transition-colors ${currentView === 'loans' ? 'bg-primary/10 dark:bg-white/10' : ''}`}>
                            <Wallet className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium">Empréstimos</span>
                    </button>

                    <button
                        onClick={() => onNavigate('profile')}
                        className={`flex flex-col items-center justify-center w-12 h-12 transition-colors ${currentView === 'profile' ? 'text-primary dark:text-white' : 'text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-white'}`}
                    >
                        <div className={`mb-1 p-1.5 rounded-full transition-colors ${currentView === 'profile' ? 'bg-primary/10 dark:bg-white/10' : ''}`}>
                            <User className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium">Perfil</span>
                    </button>
                </div>
            </nav>
        </>
    );
};