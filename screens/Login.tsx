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
  const [showMobileForm, setShowMobileForm] = useState(false);

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
    <>
      {/* ===== MOBILE VIEW ===== */}
      <div className="md:hidden flex flex-col h-full relative overflow-y-auto no-scrollbar">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src="https://wjltsjvdcbrbsunpsqwz.supabase.co/storage/v1/object/public/system/login2bg.webp"
            alt=""
            className="w-full h-full object-cover object-top"
          />
        </div>

        {/* Mobile Login Content */}
        <div className="relative z-10 flex flex-col items-center justify-between h-full px-6 pb-28 pt-14">
          {/* Logo */}
          <div className="pt-2">
            <img src="https://wjltsjvdcbrbsunpsqwz.supabase.co/storage/v1/object/public/system/agilogo3.webp" alt="Logo" className="h-[90px] object-contain drop-shadow-2xl" />
          </div>

          {/* Bottom Actions */}
          <div className="w-full space-y-3">
            {/* Expanded Login Form */}
            {showMobileForm && (
              <form onSubmit={handleSubmit} className="w-full space-y-1 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-4 py-3.5 bg-white rounded-2xl text-gray-900 placeholder-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10 outline-none transition-all text-sm shadow-sm"
                    placeholder="seu@email.com"
                    required
                    autoFocus
                  />
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full px-4 py-3.5 bg-white rounded-2xl text-gray-900 placeholder-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10 outline-none transition-all text-sm shadow-sm"
                    placeholder="Sua senha"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 outline-none transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setForgotEmail(email); setForgotMessage(null); setShowForgotModal(true); }}
                    className="text-[15px] text-black hover:text-black transition-colors font-medium"
                  >
                    Esqueci a senha
                  </button>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl text-xs px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  disabled={loading}
                  type="submit"
                  className="w-full bg-black text-white font-bold py-4 rounded-2xl shadow-2xl active:scale-[0.98] transition-all text-sm disabled:opacity-70"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
                  ) : 'Acessar Conta'}
                </button>

                <button
                  type="button"
                  onClick={() => { setShowMobileForm(false); setError(null); }}
                  className="w-full text-black font-bold py-3 text-sm hover:text-black/70 transition-colors"
                >
                  Voltar
                </button>
              </form>
            )}

            {/* Initial Buttons */}
            {!showMobileForm && (
              <div className="space-y-3 animate-in fade-in duration-300">
                <button
                  onClick={() => setShowMobileForm(true)}
                  className="w-full bg-black text-white font-bold py-4 rounded-2xl shadow-2xl active:scale-[0.98] transition-all text-sm"
                >
                  Entrar
                </button>

                <button
                  onClick={() => setShowAccessModal(true)}
                  className="w-full bg-white text-black font-bold py-4 rounded-2xl shadow-2xl active:scale-[0.98] transition-all text-sm"
                >
                  Solicitar Acesso
                </button>

                <p className="text-center text-black text-[10px] mt-2">
                  Problemas? <a href="https://wa.me/5564992032926" target="_blank" rel="noopener noreferrer" className="text-black hover:text-black underline decoration-black underline-offset-2">Contate o suporte</a>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== DESKTOP VIEW (unchanged) ===== */}
      <div className="hidden md:flex flex-col h-full bg-black relative overflow-y-auto no-scrollbar items-center justify-center p-4">
        <main className="relative z-10 w-full max-w-[380px] bg-[#0a0a0a] border border-white/5 rounded-[2rem] shadow-2xl p-8 sm:p-10">
          {/* Logo and Headings */}
          <div className="mb-8 text-center w-full">
            {logo ? (
              <img src={logo} alt="Empresta Logo" className="h-[100px] mx-auto mb-6 object-contain" />
            ) : (
              <div className="h-[100px] mb-6 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
              </div>
            )}
            <h1 className="text-white text-xl font-semibold tracking-tight">Acesse sua conta</h1>
            <p className="text-white/40 text-sm mt-1.5">Insira seus dados para continuar</p>
          </div>

          {/* Login Form */}
          <div className="w-full">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-medium text-white/60 ml-1">E-mail</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-white/40">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/5 rounded-xl text-white placeholder-white/20 focus:border-white/20 focus:bg-white/[0.05] focus:ring-1 focus:ring-white/20 outline-none transition-all duration-200 text-sm"
                    placeholder="seu@email.com"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center ml-1">
                  <label htmlFor="password" className="text-xs font-medium text-white/60">Senha</label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setForgotMessage(null);
                      setShowForgotModal(true);
                    }}
                    className="text-xs text-white/40 hover:text-white transition-colors font-medium"
                  >
                    Esqueci a senha
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full px-4 py-3 bg-white/[0.03] border border-white/5 rounded-xl text-white placeholder-white/20 focus:border-white/20 focus:bg-white/[0.05] focus:ring-1 focus:ring-white/20 outline-none transition-all duration-200 text-sm"
                    placeholder="••••••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/40 hover:text-white/80 outline-none transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg text-xs px-3 py-2.5 animate-in fade-in zoom-in-95 duration-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="pt-2 space-y-3">
                <button
                  disabled={loading}
                  type="submit"
                  className="w-full bg-white text-black font-semibold py-3 rounded-xl shadow-lg active:scale-[0.98] hover:bg-white/90 transition-all duration-200 flex items-center justify-center text-sm disabled:opacity-70 disabled:active:scale-100"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                  ) : (
                    'Entrar'
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowAccessModal(true)}
                  className="w-full bg-transparent border border-white/10 text-white/80 hover:text-white hover:bg-white/[0.02] font-medium py-3 rounded-xl active:scale-[0.98] transition-all duration-200 flex items-center justify-center text-sm"
                >
                  Solicitar Acesso
                </button>
              </div>
            </form>
          </div>

          {/* Footer Support */}
          <footer className="mt-8 text-center text-white/30">
            <p className="text-xs">
              Problemas com o acesso? <a href="https://wa.me/5564992032926" target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white transition-colors underline decoration-white/20 underline-offset-2">Contate o suporte</a>
            </p>
          </footer>
        </main>
      </div>

      {/* Access Request Modal */}
      {showAccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setShowAccessModal(false)}
          ></div>
          <div className="relative bg-[#111] border border-white/10 rounded-[2rem] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-white mb-6 border border-white/10">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Solicitar Acesso</h3>
              <p className="text-white/50 text-sm mb-8">
                A criação de novas contas está <span className="text-white font-medium">indisponível</span>. Por favor, tente novamente mais tarde.
              </p>
              <button
                onClick={() => setShowAccessModal(false)}
                className="w-full bg-white text-black font-semibold py-3 rounded-xl active:scale-[0.98] hover:bg-white/90 transition-all duration-200 text-sm"
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
            className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => !forgotLoading && setShowForgotModal(false)}
          ></div>
          <div className="relative bg-[#111] border border-white/10 rounded-[2rem] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-white mb-6 border border-white/10">
                <Mail className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Recuperar Senha</h3>
              <p className="text-white/50 text-sm mb-6">
                Enviaremos um link de recuperação para o e-mail abaixo.
              </p>

              <form onSubmit={handleForgotPassword} className="w-full space-y-4">
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="block w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-white/20 focus:bg-white/[0.05] focus:ring-1 focus:ring-white/20 outline-none transition-all duration-200 text-sm"
                  placeholder="Seu e-mail cadastrado"
                  required
                />

                {forgotMessage && (
                  <div className={`p-3 rounded-xl text-xs flex items-center gap-2 text-left animate-in fade-in zoom-in-95 duration-200 ${forgotMessage.type === 'success'
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                    {forgotMessage.type === 'success' ? <ShieldCheck className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{forgotMessage.text}</span>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full bg-white text-black font-semibold py-3 rounded-xl active:scale-[0.98] hover:bg-white/90 transition-all duration-200 text-sm disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {forgotLoading ? (
                      <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                    ) : 'Enviar Link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="w-full text-white/50 font-medium py-2 text-sm hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};