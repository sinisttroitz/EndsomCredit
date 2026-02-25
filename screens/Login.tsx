import React, { useState } from 'react';
import { Landmark, Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface LoginProps {
  onLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Se falhar login, tenta cadastro automatico (para facilitar teste, em prod nao faria isso)
        // O usuario disse que o app deve ficar totalmente funcional, entao vamos garantir acesso.
        // Porem, login e signup sao endpoints diferentes. Vamos assumir login e mostrar erro.
        throw error;
      }
      
      onLogin();
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F8F9FA] relative">
      {/* Top Background Shape */}
      <div className="absolute top-0 left-0 right-0 h-[45vh] bg-gradient-to-b from-[#1E1E24] to-[#111827] rounded-b-[3.5rem] z-0"></div>
      
      <main className="relative z-10 flex-1 flex flex-col items-center px-8 pt-16 overflow-y-auto no-scrollbar">
        <div className="mb-12 text-center w-full">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/20 shadow-2xl">
            <Landmark className="text-white w-10 h-10" />
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight mb-1">Acesse sua conta</h1>
          <p className="text-white/50 text-sm">Painel Administrativo Restrito</p>
        </div>

        <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-xl p-8 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider ml-1" htmlFor="email">E-mail</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="text-gray-400 w-5 h-5" />
                </div>
                <input 
                  id="email" 
                  name="email" 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-11 pr-4 py-4 bg-gray-50 border-transparent rounded-2xl text-gray-900 focus:bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all duration-200 outline-none placeholder-gray-400" 
                  placeholder="seu@email.com" 
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider" htmlFor="password">Senha</label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="text-gray-400 w-5 h-5" />
                </div>
                <input 
                  id="password" 
                  name="password" 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-12 py-4 bg-gray-50 border-transparent rounded-2xl text-gray-900 focus:bg-white focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all duration-200 outline-none placeholder-gray-400" 
                  placeholder="••••••••" 
                  required
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 outline-none"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-500 text-xs px-1">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            <button disabled={loading} type="submit" className="w-full bg-primary text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-70">
              <span>{loading ? 'Entrando...' : 'Entrar'}</span>
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>
        </div>

        <div className="mt-12 flex items-center space-x-2 opacity-40">
          <ShieldCheck className="w-4 h-4 text-gray-600" />
          <span className="text-[10px] uppercase font-bold tracking-[0.1em] text-gray-600">Conexão Segura SSL</span>
        </div>
      </main>

      <footer className="relative z-10 py-8 text-center bg-[#F8F9FA]">
        <p className="text-xs text-gray-400">
            Problemas com o acesso? <a href="wa.me/5599981859218" className="text-primary font-semibold underline decoration-primary/20">Contate o suporte</a>
        </p>
      </footer>
    </div>
  );
};