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
import { InterestDetails } from './screens/InterestDetails';
import { LoanDetails } from './screens/LoanDetails';
import { CollectionCalendar } from './screens/CollectionCalendar';
import { Reports } from './screens/Reports';
import { Login } from './screens/Login';
import { ResetPassword } from './screens/ResetPassword';
import { AdminUsers } from './screens/AdminUsers';
import { AdminNotifications } from './screens/AdminNotifications';
import { UserNotifications } from './screens/UserNotifications';
import { SubscriptionExpired } from './screens/SubscriptionExpired';
import { Subscription } from './screens/Subscription';
import { BottomNav } from './components/BottomNav';
import { Sidebar } from './components/Sidebar';
import { supabase } from './supabaseClient';
import { Profile as UserProfileData } from './types';

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
  const [newLoanInitialData, setNewLoanInitialData] = useState<any>(null);
  const [systemLogo, setSystemLogo] = useState<string>('');
  const [sidebarLogo, setSidebarLogo] = useState<string>('');
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);

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

  const fetchSystemLogo = async () => {
    try {
      // We assume a bucket named 'system' and a file named 'logo.png'
      const { data } = supabase.storage
        .from('system')
        .getPublicUrl('logo.png');

      if (data && data.publicUrl) {
        // Add cache busting timestamp to ensure fresh logo
        const freshUrl = `${data.publicUrl}?t=${new Date().getTime()}`;
        setSystemLogo(freshUrl);
      }

      // Fetch sidebar logo (logo2.png)
      const { data: sidebarData } = supabase.storage
        .from('system')
        .getPublicUrl('logo2.png');

      if (sidebarData && sidebarData.publicUrl) {
        const freshSidebarUrl = `${sidebarData.publicUrl}?t=${new Date().getTime()}`;
        setSidebarLogo(freshSidebarUrl);
      }
    } catch (err) {
      console.error("Error fetching system logo from storage:", err);
    }
  };

  // Fetch logo on initial load
  useEffect(() => {
    fetchSystemLogo();
  }, []);

  // Refresh logo whenever we go back to login screen
  useEffect(() => {
    if (currentView === 'login') {
      fetchSystemLogo();
    }
  }, [currentView]);

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
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);

      if (event === 'PASSWORD_RECOVERY') {
        setCurrentView('reset-password');
      } else if (!session) {
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

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setUserProfile(data);

      // Check subscription
      const now = new Date();
      const accessUntil = new Date(data.access_until);

      if (!data.is_admin && accessUntil < now) {
        setCurrentView('subscription-expired');
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  useEffect(() => {
    if (session?.user?.id) {
      fetchUserProfile(session.user.id);
    } else {
      setUserProfile(null);
    }
  }, [session]);

  useEffect(() => {
    // Auto-redirect from Dashboard on Desktop
    if (currentView === 'dashboard' && window.innerWidth >= 768) {
      setCurrentView('reports');
    }
  }, [currentView]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentView('login');
    setUserProfile(null);
  };

  const renderView = () => {
    if (loading) return <div className="h-screen flex items-center justify-center bg-background-light dark:bg-background-dark text-primary dark:text-white">Carregando...</div>;

    switch (currentView) {
      case 'login':
        return <Login onLogin={() => setCurrentView(window.innerWidth >= 768 ? 'reports' : 'dashboard')} logo={systemLogo} />;
      case 'dashboard':
        return <Dashboard
          userProfile={userProfile}
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
            setInitialLoansFilter('late');
            setCurrentView('loans');
          }}
          onViewClients={() => {
            setCurrentView('clients');
          }}
          onViewInterestDetails={() => {
            setCurrentView('interest-details');
          }}
          onViewCollectionCalendar={() => {
            setCurrentView('collection-calendar');
          }}
          onViewReports={() => {
            setCurrentView('reports');
          }}
          onViewNotifications={() => {
            setCurrentView('user-notifications');
          }}
          onViewSubscription={() => {
            setCurrentView('subscription');
          }}
        />;
      case 'interest-details':
        return <InterestDetails
          onBack={() => setCurrentView('dashboard')}
          onLoanSelect={(id) => {
            setSelectedLoanId(id);
            setPreviousView('interest-details');
            setCurrentView('loan-details');
          }}
        />;
      case 'collection-calendar':
        return <CollectionCalendar
          onBack={() => setCurrentView('dashboard')}
          onLoanSelect={(id) => {
            setSelectedLoanId(id);
            setPreviousView('collection-calendar');
            setCurrentView('loan-details');
          }}
        />;
      case 'reports':
        return <Reports 
          onBack={() => setCurrentView('dashboard')} 
          onLoanSelect={(id) => {
            setSelectedLoanId(id);
            setPreviousView('reports');
            setCurrentView('loan-details');
          }}
        />;
      case 'clients':
        return <Clients
          onClientSelect={(id) => {
            if (id === 'new') {
              setCurrentView('new-client');
            } else {
              setSelectedClientId(id);
              setCurrentView('client-details');
            }
          }}
          onEditClient={(id) => {
            setSelectedClientId(id);
            setCurrentView('edit-client');
          }}
          onNewLoan={(id) => {
            setSelectedClientId(id);
            setCurrentView('new-loan');
          }}
        />;
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
        return <Profile onLogout={handleLogout} userEmail={session?.user?.email} onNavigate={setCurrentView} />;
      case 'new-loan':
        return <NewLoan
          onBack={() => setCurrentView('dashboard')}
          onSuccess={() => {
            setNewLoanInitialData(null);
            setCurrentView('loans');
          }}
          preSelectedClientId={selectedClientId}
          initialData={newLoanInitialData}
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
          onNewLoan={(data) => {
            setNewLoanInitialData(data);
            setSelectedClientId(data.clientId);
            setCurrentView('new-loan');
          }}
        />;
      case 'admin-users':
        return <AdminUsers onBack={() => setCurrentView('profile')} />;
      case 'admin-notifications':
        return <AdminNotifications onBack={() => setCurrentView('profile')} />;
      case 'user-notifications':
        return <UserNotifications onBack={() => setCurrentView('dashboard')} />;
      case 'subscription':
        return <Subscription onBack={() => setCurrentView('dashboard')} userProfile={userProfile} />;
      case 'subscription-expired':
        return <SubscriptionExpired onLogout={handleLogout} logo={systemLogo} />;
      case 'reset-password':
        return <ResetPassword onSuccess={() => setCurrentView('login')} logo={systemLogo} />;
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
          onViewClients={() => {
            setCurrentView('clients');
          }}
          onViewSubscription={() => {
            setCurrentView('subscription');
          }}
        />;
    }
  };

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden">
      {session && currentView !== 'login' && currentView !== 'subscription-expired' && (
        <div className="hidden md:flex">
          <Sidebar
            currentView={currentView}
            onNavigate={(view) => {
              setCurrentView(view);
              setPreviousView(null);
              // Clear selection when navigating from menu
              if (view !== 'new-loan') setSelectedClientId(null);
            }}
            logo={sidebarLogo || systemLogo}
            userEmail={session.user.email}
            userName={session.user.user_metadata?.full_name}
            onLogout={handleLogout}
          />
        </div>
      )}

      <main className="flex-1 h-full relative overflow-hidden flex flex-col">
        <div className={`w-full h-full mx-auto md:mx-0 ${currentView === 'login' ? '' : 'max-w-md md:max-w-none'} overflow-y-auto no-scrollbar relative shadow-2xl md:shadow-none`}>
          {renderView()}
        </div>
      </main>

      {session && currentView !== 'subscription-expired' && (
        <div className="md:hidden">
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
        </div>
      )}
    </div>
  );
};

export default App;