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
  // Helper to load state from localStorage
  const loadState = <T,>(key: string, fallback: T): T => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : fallback;
    } catch (e) {
      return fallback;
    }
  };

  const [currentView, setCurrentView] = useState<ViewState>(() => loadState('currentView', 'login'));
  const [previousView, setPreviousView] = useState<ViewState | null>(() => loadState('previousView', null));
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(() => loadState('selectedClientId', null));
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(() => loadState('selectedLoanId', null));
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoansFilter, setInitialLoansFilter] = useState<'all' | 'pending' | 'late'>(() => loadState('initialLoansFilter', 'all'));

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (currentView !== 'login') {
        localStorage.setItem('currentView', JSON.stringify(currentView));
    }
    localStorage.setItem('previousView', JSON.stringify(previousView));
    localStorage.setItem('selectedClientId', JSON.stringify(selectedClientId));
    localStorage.setItem('selectedLoanId', JSON.stringify(selectedLoanId));
    localStorage.setItem('initialLoansFilter', JSON.stringify(initialLoansFilter));
  }, [currentView, previousView, selectedClientId, selectedLoanId, initialLoansFilter]);

  useEffect(() => {
    // Checar sessão ativa ao iniciar
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
          setCurrentView('login');
      }
      // If session exists, we keep the initialized currentView (restored from localStorage)
      // unless it is 'login', which is handled by the redirect effect below.
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        setCurrentView('login');
        // Clear storage on logout
        localStorage.removeItem('currentView');
        localStorage.removeItem('previousView');
        localStorage.removeItem('selectedClientId');
        localStorage.removeItem('selectedLoanId');
        localStorage.removeItem('initialLoansFilter');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Redirect to dashboard if logged in but on login screen
  useEffect(() => {
      if (session && currentView === 'login') {
          setCurrentView('dashboard');
      }
  }, [session, currentView]);

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
            onViewLateLoans={() => {
                // We need to pass the filter to Loans component
                // Since Loans component state is internal, we can force a remount or pass a prop
                // Ideally we should have a state in App for loans filter, but for now let's just switch view
                // and rely on Loans component to handle 'late' filter if we passed it.
                // But we only passed initialFilter prop to Loans.
                // So if we switch view, Loans will mount with default 'all' unless we change how we render it.
                // Let's add a state for initialLoansFilter in App.
                setInitialLoansFilter('late');
                setCurrentView('loans');
            }}
        />;
      case 'clients':
        return <Clients onClientSelect={(id) => {
            setSelectedClientId(id);
            setCurrentView('client-details');
        }} />;
      case 'loans':
        return <Loans 
            onLoanSelect={(id) => {
                setSelectedLoanId(id);
                setPreviousView(null);
                setCurrentView('loan-details');
            }} 
            initialFilter={initialLoansFilter}
            onFilterChange={setInitialLoansFilter}
        />;
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