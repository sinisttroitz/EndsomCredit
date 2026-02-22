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
  frequency?: 'Diária' | 'Semanal' | 'Mensal';
  skip_saturday?: boolean;
  skip_sunday?: boolean;
  created_at?: string;
}

export type ViewState = 'login' | 'dashboard' | 'clients' | 'loans' | 'profile' | 'new-loan' | 'new-client' | 'client-details' | 'loan-details' | 'edit-client';

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