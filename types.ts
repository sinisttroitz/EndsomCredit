export interface Client {
  id: string;
  name: string;
  avatar_url?: string;
  debt?: number; // Calculado no front
  status: 'active' | 'late' | 'paid';
  email?: string;
  phone?: string;
  cpf?: string;
  created_at?: string;
  initials?: string;
}

export interface Loan {
  id: string;
  client_id: string;
  client?: Client; // Join
  amount: number;
  balance: number;
  progress: number;
  status: 'pending' | 'active' | 'late' | 'paid';
  due_date?: string;
  installments?: number;
  installment_value?: number;
  interest_rate?: number;
  created_at?: string;
}

export type ViewState = 'login' | 'dashboard' | 'clients' | 'loans' | 'profile' | 'new-loan' | 'new-client' | 'client-details' | 'loan-details';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  totalLent?: number;
  totalReceived?: number;
}