import React from 'react';
import { LayoutDashboard, Users, FileText, Settings, LogOut, PieChart, Calendar } from 'lucide-react';
import { ViewState } from '../types';

interface SidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  onLogout
}) => {
  const menuItems = [
    { id: 'reports', label: 'Relatórios', icon: PieChart },
    { id: 'collection-calendar', label: 'Calendário', icon: Calendar },
    { id: 'clients', label: 'Clientes', icon: Users },
    { id: 'loans', label: 'Empréstimos', icon: FileText },
  ];

  return (
    <aside className="hidden md:flex flex-col w-30 bg-background-light dark:bg-background-dark h-screen sticky top-0 p-4 z-50">
      <div className="flex-1 bg-[#1E1E24] dark:bg-[#121214] rounded-[20px] flex flex-col items-center py-8 px-2 shadow-2xl border border-white/5 overflow-hidden">
        {/* Top Branding Icon */}
        <div className="mb-12">
          <img
            src="https://wjltsjvdcbrbsunpsqwz.supabase.co/storage/v1/object/public/system/favicon.webp"
            alt="AgiCred"
            className="w-10 h-10 rounded-lg object-contain"
          />
        </div>

        {/* Navigation Group */}
        <nav className="flex flex-col items-center gap-3 flex-1 w-full px-2">
          {menuItems.map((item) => {
            const isActive = currentView === item.id ||
              (item.id === 'clients' && ['new-client', 'client-details', 'edit-client', 'client-loans'].includes(currentView)) ||
              (item.id === 'loans' && ['new-loan', 'loan-details', 'interest-details'].includes(currentView));

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id as ViewState)}
                title={item.label}
                className={`w-14 h-14 flex items-center justify-center rounded-2xl transition-all duration-300 relative group ${isActive
                  ? 'bg-white text-black shadow-lg shadow-white/10'
                  : 'text-zinc-500 hover:text-white'
                  }`}
              >
                <item.icon className="w-6 h-6 relative z-10" />
                {!isActive && (
                  <div className="absolute inset-0 bg-white/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                )}

              </button>
            );
          })}
        </nav>

        {/* Bottom Group */}
        <div className="flex flex-col items-center gap-6 mt-auto pb-4">


          <button
            onClick={() => onNavigate('profile')}
            className={`transition-colors p-2 rounded-xl hover:bg-white/5 ${currentView === 'profile' ? 'text-white' : 'text-zinc-500 hover:text-white'}`}
          >
            <Settings className="w-5 h-5" />
          </button>

          <button
            onClick={onLogout}
            className="w-14 h-14 bg-zinc-800 hover:bg-zinc-700 text-white rounded-[20px] flex items-center justify-center transition-all shadow-lg active:scale-95 mt-2"
            title="Sair"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
