export interface Client {
  id: string;
  name: string;
  avatar_url?: string;
  debt?: number; // Calculado no front
  status: 'active' | 'late' | 'paid';
  email?: string;
  phone?: string;
  cpf?: string;
  birthdate?: string;
  cep?: string;
  city?: string;
  state?: string;
  address?: string;
  number?: string;
  complement?: string;
  documents?: string[]; // URLs dos documentos
  created_at?: string;
  initials?: string;
  credit_balance?: number;
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
  frequency?: 'Diária' | 'Semanal' | 'Quinzenal' | 'Mensal';
  skip_saturday?: boolean;
  skip_sunday?: boolean;
  total_interest_paid?: number;
  amount_paid?: number;
  installment_fines?: InstallmentFine[];
  created_at?: string;
}

export interface InstallmentFine {
    id: string;
    loan_id: string;
    installment_number: number;
    fine_value: number;
    fine_type: 'percent' | 'fixed';
    created_at?: string;
}

export interface Installment {
    number: number;
    date: Date;
    value: number;
    status: 'paid' | 'pending' | 'late' | 'future';
    originalValue?: number;
    accumulatedInterest?: number;
    originalDate?: Date;
    fine?: InstallmentFine;
}

export interface LoanAmortization {
    id: string;
    loan_id: string;
    payment_date: string;
    amount_paid: number;
    interest_paid: number;
    principal_paid: number;
    fine_paid: number;
    previous_balance: number;
    new_balance: number;
    created_at: string;
}

export type ViewState = 'login' | 'dashboard' | 'clients' | 'loans' | 'profile' | 'new-loan' | 'new-client' | 'client-details' | 'loan-details' | 'edit-client' | 'interest-details' | 'collection-calendar' | 'admin-users' | 'admin-notifications' | 'subscription-expired' | 'reports' | 'reset-password';

export interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  created_by: string;
  is_global: boolean;
  target_user_id?: string;
}

export interface NotificationRead {
  id: string;
  notification_id: string;
  user_id: string;
  read_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  access_until: string;
  is_admin: boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  totalLent?: number;
  totalReceived?: number;
}

export interface UserSettings {
  user_id?: string;
  pix_key: string;
  pix_beneficiary: string;
  city: string;
  state: string;
}