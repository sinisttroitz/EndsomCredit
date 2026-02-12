
import { Client, Loan, UserProfile } from './types';

export const currentUser: UserProfile = {
  id: '1',
  name: "Ricardo Mendes",
  email: "ricardo.mendes@fintech.com",
  avatarUrl: "https://i.pravatar.cc/150?u=Ricardo",
  totalLent: 45000.00,
  totalReceived: 12450.00
};

export const clients: Client[] = [
  {
    id: '1',
    name: 'Carlos Silva',
    initials: 'CS',
    avatar_url: 'https://i.pravatar.cc/150?u=Carlos',
    debt: 1250.00,
    status: 'active',
    email: 'carlos.silva@email.com',
    phone: '(11) 98765-4321',
    cpf: '123.456.789-00'
  },
  {
    id: '2',
    name: 'Ana Maria',
    initials: 'AM',
    debt: 5400.00,
    status: 'late',
    email: 'ana.maria@email.com',
    phone: '(11) 99999-9999',
    cpf: '987.654.321-99'
  },
  {
    id: '3',
    name: 'Roberto Oliveira',
    initials: 'RO',
    debt: 890.00,
    status: 'active',
    email: 'roberto.o@email.com'
  },
  {
    id: '4',
    name: 'Fernanda Lima',
    initials: 'FL',
    avatar_url: 'https://i.pravatar.cc/150?u=Fernanda',
    debt: 2150.00,
    status: 'active',
    email: 'fernanda.l@email.com'
  },
  {
    id: '5',
    name: 'João Pedro',
    initials: 'JP',
    debt: 15000.00,
    status: 'late',
    email: 'joao.pedro@email.com'
  },
  {
    id: '6',
    name: 'Marcos Alves',
    initials: 'MA',
    debt: 450.00,
    status: 'active',
    email: 'marcos.a@email.com'
  }
];

export const loans: Loan[] = [
  {
    id: '3920',
    client_id: '1',
    client: {
        id: '1',
        name: 'Carlos Silva',
        avatar_url: 'https://i.pravatar.cc/150?u=Carlos',
        status: 'active'
    } as Client,
    amount: 5000.00,
    balance: 1250.00,
    progress: 75,
    status: 'active',
    due_date: '15/11/2023'
  },
  {
    id: '3921',
    client_id: '2',
    client: {
        id: '2',
        name: 'Ana Maria',
        status: 'late'
    } as Client,
    amount: 10000.00,
    balance: 5400.00,
    progress: 46,
    status: 'late',
    due_date: '05/11/2023'
  },
  {
    id: '3922',
    client_id: '3',
    client: {
        id: '3',
        name: 'Roberto Oliveira',
        status: 'active'
    } as Client,
    amount: 2000.00,
    balance: 2000.00,
    progress: 0,
    status: 'pending',
    due_date: ''
  },
  {
    id: '3905',
    client_id: '4',
    client: {
        id: '4',
        name: 'Fernanda Lima',
        avatar_url: 'https://i.pravatar.cc/150?u=Fernanda',
        status: 'active'
    } as Client,
    amount: 8500.00,
    balance: 2150.00,
    progress: 74,
    status: 'active',
    due_date: '20/11/2023'
  },
  {
    id: '3880',
    client_id: '5',
    client: {
        id: '5',
        name: 'João Pedro',
        status: 'late'
    } as Client,
    amount: 20000.00,
    balance: 15000.00,
    progress: 25,
    status: 'late',
    due_date: '01/11/2023'
  },
  {
    id: '2815',
    client_id: '1',
    client: {
        id: '1',
        name: 'Carlos Silva',
        avatar_url: 'https://i.pravatar.cc/150?u=Carlos',
        status: 'active'
    } as Client,
    amount: 2500.00,
    balance: 0.00,
    progress: 100,
    status: 'paid',
    due_date: '10/08/2023'
  }
];
