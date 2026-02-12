import React, { useState } from 'react';
import { ArrowLeft, User, Camera, Calendar, MapPin, Upload, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface NewClientProps {
    onBack: () => void;
    onSuccess: () => void;
}

export const NewClient: React.FC<NewClientProps> = ({ onBack, onSuccess }) => {
    const [name, setName] = useState('');
    const [cpf, setCpf] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        if (!name) {
            setError("O nome é obrigatório.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) throw new Error("Usuário não autenticado");

            const { error: insertError } = await supabase
                .from('clients')
                .insert([
                    {
                        name,
                        cpf,
                        phone,
                        email,
                        user_id: user.id,
                        status: 'active',
                        // Avatar url placeholder for now
                        avatar_url: `https://ui-avatars.com/api/?name=${name}&background=random`
                    }
                ]);

            if (insertError) throw insertError;
            
            onSuccess();

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Erro ao salvar cliente.");
        } finally {
            setLoading(false);
        }
    };

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <header className="bg-primary dark:bg-black text-white rounded-b-b-header px-6 pt-12 pb-8 shadow-lg relative z-10">
        <div className="flex items-center mb-2">
          <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 mr-4 hover:bg-white/20 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold tracking-tight">Novo Cliente</h1>
        </div>
      </header>

      <main className="flex-1 px-5 pt-6 pb-8 overflow-y-auto space-y-6 no-scrollbar">
        
        <div className="bg-card-light dark:bg-card-dark p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
             <h2 className="text-lg font-bold text-text-main-light dark:text-text-main-dark mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-accent-blue" />
                Dados Pessoais
             </h2>
             <div className="space-y-4">
                 <input 
                    value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-primary transition-colors" placeholder="Nome Completo *" 
                 />
                 <input 
                    value={cpf} onChange={(e) => setCpf(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-primary transition-colors" placeholder="CPF" 
                 />
                 <div className="flex gap-4">
                    <input 
                        value={phone} onChange={(e) => setPhone(e.target.value)}
                        className="flex-1 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-primary transition-colors" placeholder="Telefone" 
                    />
                    <div className="relative flex-1">
                        <input className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-primary transition-colors" placeholder="Nascimento" type="text" onFocus={(e) => e.target.type='date'} onBlur={(e) => e.target.type='text'} />
                        <Calendar className="absolute right-3 top-3.5 w-5 h-5 text-gray-400 pointer-events-none" />
                    </div>
                 </div>
                 <input 
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-primary transition-colors" placeholder="E-mail" type="email" 
                 />
             </div>
        </div>

        <div className="bg-card-light dark:bg-card-dark p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
             <h2 className="text-lg font-bold text-text-main-light dark:text-text-main-dark mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-accent-blue" />
                Endereço
             </h2>
             <div className="space-y-4">
                 <div className="flex gap-4">
                    <input className="w-32 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-primary transition-colors" placeholder="CEP" />
                    <input className="flex-1 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-primary transition-colors" placeholder="Cidade" />
                 </div>
                 <input className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-primary transition-colors" placeholder="Logradouro" />
                 <div className="flex gap-4">
                    <input className="w-24 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-primary transition-colors" placeholder="Nº" />
                    <input className="flex-1 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-primary transition-colors" placeholder="Complemento" />
                 </div>
             </div>
        </div>

        {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-2 text-sm">
                <AlertCircle className="w-5 h-5" />
                {error}
            </div>
        )}

        <div className="pt-4 pb-12">
            <button 
                onClick={handleSave}
                disabled={loading}
                className="w-full bg-primary dark:bg-white text-white dark:text-primary py-4 rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-70"
            >
                {loading ? 'Salvando...' : 'Cadastrar Cliente'}
            </button>
        </div>

      </main>
    </div>
  );
};