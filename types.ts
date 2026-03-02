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
}

export type ViewState = 'login' | 'dashboard' | 'clients' | 'loans' | 'profile' | 'new-loan' | 'new-client' | 'client-details' | 'loan-details' | 'edit-client' | 'interest-details' | 'collection-calendar';

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