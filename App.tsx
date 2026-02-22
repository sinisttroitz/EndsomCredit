import React, { useState, useEffect } from 'react';
import { ViewState } from './types';
import { Dashboard } from './screens/Dashboard';
import { Clients } from './screens/Clients';
import { Loans } from './screens/Loans';
import { Profile } from './screens/Profile';
import { NewLoan } from './screens/NewLoan';
import { NewClient } from './screens/NewClient';
import { EditClient } from './screens/EditClient';
import { ClientDetails } from './screens/ClientDetails';
import { LoanDetails } from './screens/LoanDetails';
import { Login } from './screens/Login';
import { BottomNav } from './components/BottomNav';
import { supabase } from './supabaseClient';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('login');
  const [previousView, setPreviousView] = useState<ViewState | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Checar sessão ativa ao iniciar
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) setCurrentView('dashboard');
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setCurrentView('dashboard');
      } else {
        setCurrentView('login');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentView('login');
  };

  const renderView = () => {
    if (loading) return <div className="h-screen flex items-center justify-center bg-background-light dark:bg-background-dark text-primary dark:text-white">Carregando...</div>;

    switch (currentView) {
      case 'login':
        return <Login onLogin={() => setCurrentView('dashboard')} />;
      case 'dashboard':
        return <Dashboard 
            onClientSelect={(id) => {
                setSelectedClientId(id);
                setPreviousView('dashboard');
                setCurrentView('client-details');
            }}
            onLoanSelect={(id) => {
                setSelectedLoanId(id);
                setPreviousView('dashboard');
                setCurrentView('loan-details');
            }}
        />;
      case 'clients':
        return <Clients onClientSelect={(id) => {
            setSelectedClientId(id);
            setCurrentView('client-details');
        }} />;
      case 'loans':
        return <Loans onLoanSelect={(id) => {
            setSelectedLoanId(id);
            setPreviousView(null);
            setCurrentView('loan-details');
        }} />;
      case 'profile':
        return <Profile onLogout={handleLogout} userEmail={session?.user?.email} />;
      case 'new-loan':
        return <NewLoan 
            onBack={() => setCurrentView('dashboard')} 
            onSuccess={() => setCurrentView('loans')}
            preSelectedClientId={selectedClientId} 
        />;
      case 'new-client':
        return <NewClient 
            onBack={() => setCurrentView('clients')} 
            onSuccess={() => setCurrentView('clients')}
        />;
      case 'client-details':
        return <ClientDetails 
            clientId={selectedClientId} 
            onBack={() => {
                if (previousView === 'dashboard') {
                    setCurrentView('dashboard');
                    setPreviousView(null);
                } else {
                    setCurrentView('clients');
                }
            }} 
            onNewLoan={() => setCurrentView('new-loan')}
            onEdit={() => setCurrentView('edit-client')}
            onLoanSelect={(id) => {
                setSelectedLoanId(id);
                setPreviousView('client-details');
                setCurrentView('loan-details');
            }}
        />;
      case 'edit-client':
        return <EditClient 
            clientId={selectedClientId} 
            onBack={() => setCurrentView('client-details')}
            onSuccess={() => setCurrentView('client-details')}
            onDelete={() => {
                setSelectedClientId(null);
                setCurrentView('clients');
            }}
        />;
      case 'loan-details':
        return <LoanDetails 
            loanId={selectedLoanId}
            onBack={() => {
                if (previousView === 'client-details') {
                    setCurrentView('client-details');
                    setPreviousView(null);
                } else if (previousView === 'dashboard') {
                    setCurrentView('dashboard');
                    setPreviousView(null);
                } else {
                    setCurrentView('loans');
                }
            }}
        />;
      default:
        return <Dashboard 
            onClientSelect={(id) => {
                setSelectedClientId(id);
                setPreviousView('dashboard');
                setCurrentView('client-details');
            }}
            onLoanSelect={(id) => {
                setSelectedLoanId(id);
                setPreviousView('dashboard');
                setCurrentView('loan-details');
            }}
        />;
    }
  };

  return (
    <div className="mx-auto max-w-md h-screen relative bg-background-light dark:bg-background-dark overflow-hidden shadow-2xl">
      {renderView()}
      {session && (
        <BottomNav 
            currentView={currentView} 
            onNavigate={(view) => {
                setCurrentView(view);
                setPreviousView(null);
                setIsMenuOpen(false);
                // Limpar seleção ao navegar pelo menu
                if (view !== 'new-loan') setSelectedClientId(null);
            }} 
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
        />
      )}
    </div>
  );
};

export default App;