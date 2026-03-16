import React, { useState } from 'react';
import { Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface ResetPasswordProps {
  onSuccess: () => void;
  logo?: string;
}

export const ResetPassword: React.FC<ResetPasswordProps> = ({ onSuccess, logo }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao redefinir senha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black relative overflow-y-auto no-scrollbar">
      <main className="relative z-10 flex-1 flex flex-col items-center px-8 pt-12 pb-8 w-full max-w-sm mx-auto">
        {/* Logo and Headings */}
        <div className="mb-12 text-center w-full">
          {logo ? (
            <img src={logo} alt="Empresta Logo" className="h-28 mx-auto mb-6 object-contain" />
          ) : (
            <div className="h-28 mb-6 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            </div>
          )}
          <h1 className="text-white text-3xl font-bold tracking-tight mb-2">
            {success ? 'Senha Alterada!' : 'Nova Senha'}
          </h1>
          <p className="text-white/40 text-sm">
            {success ? 'Sua senha foi redefinida com sucesso.' : 'Defina sua nova senha de acesso abaixo.'}
          </p>
        </div>

        {success ? (
          <div className="w-full py-12 flex flex-col items-center animate-in zoom-in duration-500">
            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center text-green-500 mb-6">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <p className="text-center text-white/60 mb-8">Redirecionando para o login...</p>
            <button 
                onClick={onSuccess}
                className="w-full bg-white text-black font-black py-5 rounded-2xl active:scale-[0.98] transition-all duration-200 text-lg shadow-xl"
            >
                Entrar Agora
            </button>
          </div>
        ) : (
          <div className="w-full space-y-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-6 py-5 bg-[#121212] border-transparent rounded-2xl text-white placeholder-white/60 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200 text-lg"
                  placeholder="Nova senha"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-6 flex items-center text-white/40 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full px-6 py-5 bg-[#121212] border-transparent rounded-2xl text-white placeholder-white/60 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200 text-lg"
                  placeholder="Confirmar nova senha"
                  required
                />
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-white text-black font-black py-5 rounded-3xl active:scale-[0.98] transition-all duration-200 text-lg shadow-xl shadow-white/5 flex items-center justify-center gap-2 group disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-6 h-6 border-4 border-black/20 border-t-black rounded-full animate-spin"></div>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    Salvar Nova Senha
                  </>
                )}
              </button>
            </form>

            <button
              onClick={onSuccess}
              className="w-full py-4 text-white/40 text-sm font-medium hover:text-white transition-colors"
            >
              Voltar ao Login
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
