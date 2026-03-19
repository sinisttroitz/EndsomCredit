import React, { useState } from 'react';
import { Eye, EyeOff, ShieldCheck, AlertCircle, Mail, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface LoginProps {
  onLogin: () => void;
  logo?: string;
}

export const Login: React.FC<LoginProps> = ({ onLogin, logo }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

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
        throw error;
      }

      onLogin();
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar login');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;

    setForgotLoading(true);
    setForgotMessage(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setForgotMessage({
        type: 'success',
        text: 'Link de recuperação enviado! Verifique seu e-mail para continuar.'
      });
    } catch (err: any) {
      console.error(err);
      setForgotMessage({
        type: 'error',
        text: err.message || 'Erro ao enviar e-mail de recuperação.'
      });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-black relative overflow-y-auto no-scrollbar bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.8)), url("https://wjltsjvdcbrbsunpsqwz.supabase.co/storage/v1/object/public/system/bglogin.webp")' }}
    >
      <main className="relative z-10 flex-1 flex flex-col items-center px-8 pt-24 pb-8 w-full max-w-[340px] mx-auto">
        {/* Logo and Headings */}
        <div className="mb-2 text-center w-full">
          {logo ? (
            <img src={logo} alt="Empresta Logo" className="h-[150px] mx-auto mb-20 object-contain" />
          ) : (
            <div className="h-[150px] mb-6 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            </div>
          )}
          <h1 className="text-white text-2xl font-bold tracking-tight mb-2">Acesse sua conta</h1>
        </div>

        {/* Login Form */}
        <div className="w-full space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-6 py-4 bg-[#121212] border-transparent rounded-2xl text-white placeholder-white/60 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200 text-base"
                placeholder="seu@email.com"
                required
              />
            </div>

            <div className="space-y-3">
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-6 py-4 bg-[#121212] border-transparent rounded-2xl text-white placeholder-white/60 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200 text-base"
                  placeholder="••••••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-6 flex items-center text-white/40 hover:text-white/60 outline-none"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <div className="text-right px-1">
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setForgotMessage(null);
                    setShowForgotModal(true);
                  }}
                  className="text-sm text-white/80 hover:text-white transition-colors font-medium"
                >
                  Esqueci a senha
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-xs px-2 py-1">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            <div className="pt-4 space-y-4">
              <button
                disabled={loading}
                type="submit"
                className="w-full bg-white text-[#111827] font-bold py-4 rounded-2xl shadow-xl active:scale-[0.98] transition-all duration-200 flex items-center justify-center text-base disabled:opacity-70"
              >
                <span>{loading ? 'Entrando...' : 'Entrar'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAccessModal(true)}
                className="w-full bg-transparent border-2 border-white text-white font-bold py-4 rounded-2xl active:scale-[0.98] transition-all duration-200 flex items-center justify-center text-base"
              >
                Solicitar Acesso
              </button>
            </div>
          </form>
        </div>

        {/* Footer Support */}
        <footer className="mt-auto py-8 text-center text-white/40">
          <p className="text-xs">
            Problemas com o acesso? <a href="https://wa.me/5564992032926" target="_blank" rel="noopener noreferrer" className="text-white/60 font-semibold underline decoration-white/20 hover:text-white transition-colors">Contate o suporte</a>
          </p>
        </footer>
      </main>

      {/* Access Request Modal */}
      {showAccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setShowAccessModal(false)}
          ></div>
          <div className="relative bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in slide-in-from-bottom-4 duration-300 border border-gray-100">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-primary mb-6">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Solicitar Acesso</h3>
              <p className="text-gray-500 text-sm mb-8">
                Desculpe, a criação de novas contas está <span className="text-primary font-bold">indisponível no momento</span>. Por favor, tente novamente mais tarde.
              </p>
              <button
                onClick={() => setShowAccessModal(false)}
                className="w-full bg-primary text-white font-bold py-4 rounded-2xl active:scale-[0.98] transition-all duration-200 text-lg"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => !forgotLoading && setShowForgotModal(false)}
          ></div>
          <div className="relative bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in slide-in-from-bottom-4 duration-300 border border-gray-100">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-6">
                <Mail className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Recuperar Senha</h3>
              <p className="text-gray-500 text-sm mb-6">
                Enviaremos um link de recuperação para o e-mail abaixo.
              </p>

              <form onSubmit={handleForgotPassword} className="w-full space-y-4">
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="block w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-200"
                  placeholder="Seu e-mail cadastrado"
                  required
                />

                {forgotMessage && (
                  <div className={`p-4 rounded-xl text-xs flex items-start gap-2 text-left ${forgotMessage.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'bg-red-50 text-red-700 border border-red-100'
                    }`}>
                    {forgotMessage.type === 'success' ? <ShieldCheck className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                    <span>{forgotMessage.text}</span>
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full bg-primary text-white font-bold py-4 rounded-2xl active:scale-[0.98] transition-all duration-200 text-lg disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {forgotLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : 'Enviar Link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="w-full text-gray-500 font-bold py-2 text-sm hover:text-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};