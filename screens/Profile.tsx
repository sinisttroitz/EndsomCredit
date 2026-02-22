import React, { useState, useEffect } from 'react';
import { LogOut, Edit2, MapPin, CreditCard, ChevronRight, Lock, Save, X, Loader2, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { UserSettings } from '../types';

interface ProfileProps {
    onLogout: () => void;
    userEmail?: string;
}

export const Profile: React.FC<ProfileProps> = ({ onLogout, userEmail }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Estado local para o CEP e carregamento da busca
  const [cep, setCep] = useState('');
  const [loadingCep, setLoadingCep] = useState(false);
  
  const [settings, setSettings] = useState<UserSettings>({
      pix_key: '',
      pix_beneficiary: '',
      city: '',
      state: ''
  });

  // Fetch initial data
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data, error } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (data) {
                setSettings({
                    pix_key: data.pix_key || '',
                    pix_beneficiary: data.pix_beneficiary || '',
                    city: data.city || '',
                    state: data.state || ''
                });
            } else if (error && error.code !== 'PGRST116') { // PGRST116 is "not found", which is fine for first run
                console.error("Error fetching settings:", error);
            }
        }
    } catch (error) {
        console.error("Error:", error);
    } finally {
        setLoading(false);
    }
  };

  const handleCepChange = async (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    setCep(numericValue);

    if (numericValue.length === 8) {
        setLoadingCep(true);
        try {
            const response = await fetch(`https://viacep.com.br/ws/${numericValue}/json/`);
            const data = await response.json();
            
            if (!data.erro) {
                setSettings(prev => ({
                    ...prev,
                    city: data.localidade,
                    state: data.uf
                }));
            } else {
                alert("CEP não encontrado.");
            }
        } catch (error) {
            console.error("Erro ao buscar CEP", error);
            alert("Erro ao buscar CEP. Verifique sua conexão.");
        } finally {
            setLoadingCep(false);
        }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: user.id,
                pix_key: settings.pix_key,
                pix_beneficiary: settings.pix_beneficiary,
                city: settings.city,
                state: settings.state,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
        setIsEditing(false);
        setCep(''); // Limpa o CEP após salvar, pois só armazenamos a cidade/uf
    } catch (error) {
        console.error("Error saving settings:", error);
        alert("Erro ao salvar alterações.");
    } finally {
        setSaving(false);
    }
  };

  const handleChange = (field: keyof UserSettings, value: string) => {
      setSettings(prev => ({ ...prev, [field]: value }));
  };

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <header className="bg-primary dark:bg-black text-white px-6 pt-12 pb-20 rounded-b-b-header shadow-lg relative z-10">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold">Configurações</h1>
            <button onClick={onLogout} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                <LogOut className="w-5 h-5 text-gray-300" />
            </button>
        </div>
        <p className="text-gray-400 text-sm max-w-xs">Gerencie sua conta e preferências</p>
        
        {/* Absolute positioned profile picture overlap */}
        <div className="absolute -bottom-14 left-1/2 transform -translate-x-1/2">
            <div className="relative">
                <div className="w-28 h-28 rounded-full border-4 border-background-light dark:border-background-dark overflow-hidden bg-primary shadow-xl flex items-center justify-center text-3xl font-bold text-white">
                     {userEmail ? userEmail.charAt(0).toUpperCase() : 'A'}
                </div>
                {!isEditing && (
                    <button 
                        onClick={() => setIsEditing(true)}
                        className="absolute bottom-1 right-1 bg-secondary text-white p-2 rounded-full shadow-lg border-2 border-background-light dark:border-background-dark hover:scale-105 transition-transform"
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
      </header>

      <main className="flex-1 px-5 pt-20 pb-32 overflow-y-auto no-scrollbar space-y-6">
        
        {isEditing && (
            <div className="bg-yellow-50 text-yellow-800 p-4 rounded-2xl text-sm flex justify-between items-center border border-yellow-100">
                <span>Modo de edição ativado</span>
                <div className="flex gap-2">
                    <button onClick={() => setIsEditing(false)} className="p-2 bg-white rounded-full shadow-sm text-gray-500"><X className="w-4 h-4"/></button>
                    <button onClick={handleSave} disabled={saving} className="p-2 bg-primary text-white rounded-full shadow-sm flex items-center gap-2 px-4">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                        <span className="text-xs font-bold">Salvar</span>
                    </button>
                </div>
            </div>
        )}

        <section>
            <h3 className="text-xs font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-3 pl-1">Informações Pessoais</h3>
            <div className="bg-card-light dark:bg-card-dark rounded-2xl p-2 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="p-3 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-gray-400 mb-0.5">Email (Não editável)</p>
                        <p className="font-semibold text-gray-800 dark:text-white">{userEmail}</p>
                    </div>
                    <Lock className="w-4 h-4 text-gray-300" />
                </div>
            </div>
        </section>

        <section>
            <h3 className="text-xs font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-3 pl-1">Dados de Pagamento</h3>
             <div className="bg-card-light dark:bg-card-dark rounded-2xl p-2 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                    <div className="w-full">
                        <p className="text-xs text-gray-400 mb-0.5">Chave PIX</p>
                        {isEditing ? (
                            <input 
                                value={settings.pix_key}
                                onChange={(e) => handleChange('pix_key', e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="CPF, Email ou Aleatória"
                            />
                        ) : (
                            <p className="font-semibold text-gray-800 dark:text-white">{settings.pix_key || 'Não definida'}</p>
                        )}
                    </div>
                    {!isEditing && (
                        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg ml-3">
                            <CreditCard className="w-4 h-4 text-gray-500" />
                        </div>
                    )}
                </div>
                <div className="p-3 flex justify-between items-center">
                    <div className="w-full">
                        <p className="text-xs text-gray-400 mb-0.5">Beneficiário PIX</p>
                        {isEditing ? (
                            <input 
                                value={settings.pix_beneficiary}
                                onChange={(e) => handleChange('pix_beneficiary', e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="Nome completo"
                            />
                        ) : (
                            <p className="font-semibold text-gray-800 dark:text-white">{settings.pix_beneficiary || 'Não definido'}</p>
                        )}
                    </div>
                </div>
             </div>
        </section>

        <section>
             <h3 className="text-xs font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-3 pl-1">Localização</h3>
             <div className="bg-card-light dark:bg-card-dark rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-center">
                <div className="w-full">
                     <p className="text-xs text-gray-400 mb-1.5 flex justify-between">
                        <span>Cidade / Estado</span>
                        {!isEditing && <MapPin className="w-3 h-3 text-gray-300" />}
                     </p>
                     
                     {isEditing ? (
                        <div className="space-y-3">
                            {/* Busca por CEP */}
                            <div className="relative">
                                <input 
                                    value={cep}
                                    onChange={(e) => handleCepChange(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-10 py-2 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="Digite o CEP"
                                    maxLength={8}
                                />
                                <div className="absolute right-3 top-2.5">
                                    {loadingCep ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Search className="w-4 h-4 text-gray-400" />}
                                </div>
                            </div>

                            {/* Resultados Auto-preenchidos */}
                            <div className="flex gap-2">
                                <input 
                                    value={settings.city}
                                    onChange={(e) => handleChange('city', e.target.value)}
                                    className="flex-1 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm font-semibold text-primary dark:text-white outline-none opacity-80"
                                    placeholder="Cidade"
                                    readOnly={true} // Sugerido manter apenas leitura se a ideia é só usar o CEP, mas deixei onChange caso queira permitir edição manual
                                />
                                <input 
                                    value={settings.state}
                                    onChange={(e) => handleChange('state', e.target.value)}
                                    className="w-16 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm font-semibold text-primary dark:text-white outline-none opacity-80"
                                    placeholder="UF"
                                    readOnly={true}
                                />
                            </div>
                        </div>
                     ) : (
                        <p className="font-semibold text-gray-800 dark:text-white text-base">
                            {settings.city ? `${settings.city}, ${settings.state}` : 'Não informado'}
                        </p>
                     )}
                </div>
             </div>
        </section>

        <section>
            <h3 className="text-xs font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-3 pl-1">Segurança</h3>
             <button className="w-full bg-card-light dark:bg-card-dark rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex justify-between items-center group active:scale-[0.99] transition-transform">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500">
                        <Lock className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-gray-800 dark:text-white">Trocar Senha</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
             </button>
        </section>

        <div className="text-center pt-4 pb-8">
            <button onClick={onLogout} className="text-red-500 text-sm font-semibold hover:underline">Sair da conta</button>
            <p className="text-[10px] text-gray-400 mt-2">Versão 2.7.0</p>
        </div>

      </main>
    </div>
  );
};