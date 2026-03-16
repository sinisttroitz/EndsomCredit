import React from 'react';
import { LayoutDashboard, Users, FileText, Settings, LogOut, PieChart } from 'lucide-react';
import { ViewState } from '../types';

interface SidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  logo?: string;
  userEmail?: string;
  userName?: string;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onNavigate, 
  logo, 
  userEmail, 
  userName,
  onLogout 
}) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clients', label: 'Clientes', icon: Users },
    { id: 'loans', label: 'Empréstimos', icon: FileText },
    { id: 'collection-calendar', label: 'Relatórios', icon: PieChart }, // Mapping Reports to Calendar/Reports
    { id: 'profile', label: 'Configurações', icon: Settings },
  ];

  const displayName = userName || userEmail?.split('@')[0] || 'Admin';
  const userInitial = displayName.charAt(0).toUpperCase();

  return (
    <aside className="hidden md:flex flex-col w-64 bg-primary text-white h-screen sticky top-0">
      {/* Logo Area */}
      <div className="p-6 flex items-center justify-center border-b border-gray-800">
        {logo ? (
            <img src={logo} alt="Logo" className="h-16 w-auto object-contain" />
        ) : (
            <div className="h-16 w-16 bg-primary rounded-2xl flex items-center justify-center font-bold text-white text-2xl">
                F
            </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-1">
        {menuItems.map((item) => {
          const isActive = currentView === item.id || 
                           (item.id === 'clients' && ['new-client', 'client-details', 'edit-client'].includes(currentView)) ||
                           (item.id === 'loans' && ['new-loan', 'loan-details', 'interest-details'].includes(currentView));
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as ViewState)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive 
                  ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold border border-primary/30">
            {userInitial}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-bold truncate text-white group-hover:text-primary transition-colors">{displayName}</p>
            <p className="text-xs text-gray-500 truncate">Administrador</p>
          </div>
          <button onClick={onLogout} className="text-gray-500 hover:text-red-400 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
