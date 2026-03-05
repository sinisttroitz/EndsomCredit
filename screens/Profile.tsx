import React, { useState, useEffect } from 'react';
import { LogOut, Edit2, MapPin, CreditCard, ChevronRight, Lock, Save, X, Loader2, Search, Download, FileText } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { UserSettings } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ProfileProps {
    onLogout: () => void;
    userEmail?: string;
}

export const Profile: React.FC<ProfileProps> = ({ onLogout, userEmail }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  
  // Password Change State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  
  // Estado local para o CEP e carregamento da busca
  const [cep, setCep] = useState('');
  const [loadingCep, setLoadingCep] = useState(false);
  
  const [settings, setSettings] = useState<UserSettings>({
      pix_key: '',
      pix_beneficiary: '',
      city: '',
      state: ''
  });

  const [email, setEmail] = useState(userEmail || '');
  const [name, setName] = useState('');

  // Fetch initial data
  useEffect(() => {
    fetchSettings();
    if (userEmail) setEmail(userEmail);
  }, [userEmail]);

  const fetchSettings = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setName(user.user_metadata.full_name || '');
            
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

  const handleDownloadData = async (format: 'pdf' | 'csv') => {
      setDownloading(true);
      try {
          const { data: loans, error } = await supabase
              .from('loans')
              .select('*, client:clients(name, credit_balance), installment_fines(*)')
              .order('created_at', { ascending: false });

          if (error) throw error;

          if (!loans || loans.length === 0) {
              alert("Nenhum empréstimo encontrado para gerar relatório.");
              return;
          }

          if (format === 'pdf') {
              generatePDF(loans);
          } else {
              generateCSV(loans);
          }
          setShowDownloadModal(false);
      } catch (error) {
          console.error("Erro ao gerar relatório:", error);
          alert("Erro ao gerar relatório. Tente novamente.");
      } finally {
          setDownloading(false);
      }
  };

  const generatePDF = (loans: any[]) => {
      const doc = new jsPDF({ orientation: 'landscape' });
      
      doc.setFontSize(18);
      doc.text("Relatório Detalhado de Empréstimos", 14, 22);
      
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 30);
      doc.text(`Usuário: ${name || email}`, 14, 35);

      const tableData = loans.map(loan => {
          const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
          const contractInterest = Math.max(0, totalDebt - loan.amount);
          const lateInterest = Math.max(0, Number(loan.balance) - totalDebt);
          const totalFines = loan.installment_fines?.reduce((acc: number, curr: any) => acc + curr.fine_value, 0) || 0;

          return [
              loan.client?.name || 'Cliente Removido',
              `R$ ${loan.amount.toFixed(2)}`,
              `R$ ${contractInterest.toFixed(2)}`,
              `R$ ${lateInterest.toFixed(2)}`,
              `R$ ${totalFines.toFixed(2)}`,
              loan.frequency || '-',
              loan.installments || 1,
              new Date(loan.created_at).toLocaleDateString('pt-BR'),
              loan.due_date ? new Date(loan.due_date).toLocaleDateString('pt-BR') : '-',
              `R$ ${(loan.client?.credit_balance || 0).toFixed(2)}`,
              `R$ ${(loan.amount_paid || 0).toFixed(2)}`,
              loan.status === 'paid' ? 'Pago' : (loan.status === 'late' ? 'Atrasado' : 'Em Aberto')
          ];
      });

      autoTable(doc, {
          head: [['Cliente', 'Valor Inicial', 'Juros Contrato', 'Juros Atraso', 'Multas', 'Freq.', 'Parc.', 'Data Sol.', 'Venc.', 'Créditos', 'Total Rec.', 'Status']],
          body: tableData,
          startY: 40,
          theme: 'grid',
          headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: {
              0: { cellWidth: 35 }, // Cliente
              1: { cellWidth: 20 }, // Valor Inicial
              2: { cellWidth: 20 }, // Juros Contrato
              3: { cellWidth: 20 }, // Juros Atraso
              4: { cellWidth: 15 }, // Multas
              5: { cellWidth: 20 }, // Frequência
              6: { cellWidth: 10 }, // Parcelas
              7: { cellWidth: 20 }, // Data Sol.
              8: { cellWidth: 20 }, // Vencimento
              9: { cellWidth: 20 }, // Créditos
              10: { cellWidth: 20 }, // Total Rec.
              11: { cellWidth: 20 }  // Status
          }
      });

      doc.save('relatorio_emprestimos_detalhado.pdf');
  };

  const generateCSV = (loans: any[]) => {
      const headers = ['Cliente,Valor Inicial,Juros Contrato,Juros Atraso,Multas,Frequência,Parcelas,Data Solicitação,Vencimento,Créditos,Total Recebido,Status'];
      const rows = loans.map(loan => {
          const totalDebt = (loan.installment_value || 0) * (loan.installments || 1);
          const contractInterest = Math.max(0, totalDebt - loan.amount);
          const lateInterest = Math.max(0, Number(loan.balance) - totalDebt);
          const totalFines = loan.installment_fines?.reduce((acc: number, curr: any) => acc + curr.fine_value, 0) || 0;

          return [
              `"${loan.client?.name || 'Cliente Removido'}"`,
              `"${loan.amount.toFixed(2).replace('.', ',')}"`,
              `"${contractInterest.toFixed(2).replace('.', ',')}"`,
              `"${lateInterest.toFixed(2).replace('.', ',')}"`,
              `"${totalFines.toFixed(2).replace('.', ',')}"`,
              `"${loan.frequency || '-'}"`,
              `"${loan.installments || 1}"`,
              `"${new Date(loan.created_at).toLocaleDateString('pt-BR')}"`,
              `"${loan.due_date ? new Date(loan.due_date).toLocaleDateString('pt-BR') : '-'}"`,
              `"${(loan.client?.credit_balance || 0).toFixed(2).replace('.', ',')}"`,
              `"${(loan.amount_paid || 0).toFixed(2).replace('.', ',')}"`,
              `"${loan.status === 'paid' ? 'Pago' : (loan.status === 'late' ? 'Atrasado' : 'Em Aberto')}"`
          ];
      });

      const csvContent = [headers, ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'relatorio_emprestimos_detalhado.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword) {
        alert("Por favor, insira sua senha atual.");
        return;
    }
    if (newPassword !== confirmPassword) {
        alert("As senhas não coincidem.");
        return;
    }
    if (newPassword.length < 6) {
        alert("A senha deve ter pelo menos 6 caracteres.");
        return;
    }

    setUpdatingPassword(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !user.email) throw new Error("Usuário não identificado.");

        // Verify current password by attempting to sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: currentPassword
        });

        if (signInError) {
            throw new Error("A senha atual está incorreta.");
        }

        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        
        alert("Senha atualizada com sucesso!");
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordModal(false);
    } catch (error: any) {
        console.error("Erro ao atualizar senha:", error);
        alert(`Erro ao atualizar senha: ${error.message || error}`);
    } finally {
        setUpdatingPassword(false);
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

        // Update email if changed
        if (email !== userEmail) {
            const { error: emailError } = await supabase.auth.updateUser({ email: email });
            if (emailError) throw emailError;
            alert("Email atualizado! Verifique sua caixa de entrada para confirmar a alteração.");
        }

        // Update name if changed
        if (name !== user.user_metadata.full_name) {
            const { error: nameError } = await supabase.auth.updateUser({ data: { full_name: name } });
            if (nameError) throw nameError;
        }

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
    } catch (error: any) {
        console.error("Error saving settings:", error);
        alert(`Erro ao salvar alterações: ${error.message || error}`);
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
                <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                    <div className="w-full">
                        <p className="text-xs text-gray-400 mb-0.5">Nome</p>
                        {isEditing ? (
                            <input 
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="Seu nome completo"
                            />
                        ) : (
                            <p className="font-semibold text-gray-800 dark:text-white">{name || 'Não informado'}</p>
                        )}
                    </div>
                    {!isEditing && <Edit2 className="w-4 h-4 text-gray-300" />}
                </div>
                <div className="p-3 flex justify-between items-center">
                    <div className="w-full">
                        <p className="text-xs text-gray-400 mb-0.5">Email</p>
                        {isEditing ? (
                            <input 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        ) : (
                            <p className="font-semibold text-gray-800 dark:text-white">{email}</p>
                        )}
                    </div>
                    {!isEditing && <Lock className="w-4 h-4 text-gray-300" />}
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
             <button 
                onClick={() => setShowPasswordModal(true)}
                className="w-full bg-card-light dark:bg-card-dark rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex justify-between items-center group active:scale-[0.99] transition-transform"
             >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500">
                        <Lock className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-gray-800 dark:text-white">Trocar Senha</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
             </button>

             <button 
                onClick={() => setShowDownloadModal(true)}
                className="w-full bg-card-light dark:bg-card-dark rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex justify-between items-center group active:scale-[0.99] transition-transform mt-3"
            >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-500">
                        <Download className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-gray-800 dark:text-white">Baixar Dados</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
            </button>
        </section>

        <div className="text-center pt-4 pb-8">
            <button onClick={onLogout} className="text-red-500 text-sm font-semibold hover:underline">Sair da conta</button>
            <p className="text-[10px] text-gray-400 mt-2">Versão 2.7.0</p>
        </div>

        {showPasswordModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPasswordModal(false)}></div>
                <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Trocar Senha</h3>
                        <button onClick={() => setShowPasswordModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Senha Atual</label>
                            <input 
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="Sua senha atual"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Nova Senha</label>
                            <input 
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="Mínimo 6 caracteres"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Confirmar Senha</label>
                            <input 
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-semibold text-primary dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="Repita a nova senha"
                            />
                        </div>

                        <button 
                            onClick={handleUpdatePassword}
                            disabled={updatingPassword || !newPassword || !confirmPassword}
                            className="w-full bg-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                        >
                            {updatingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                            Atualizar Senha
                        </button>
                    </div>
                </div>
            </div>
        )}

        {showDownloadModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDownloadModal(false)}></div>
                <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Baixar Relatório</h3>
                        <button onClick={() => setShowDownloadModal(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>
                    
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                        Escolha o formato para baixar o relatório completo de seus empréstimos.
                    </p>

                    <div className="space-y-3">
                        <button 
                            onClick={() => handleDownloadData('pdf')}
                            disabled={downloading}
                            className="w-full p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 flex items-center gap-4 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-left group"
                        >
                            <div className="w-12 h-12 bg-red-100 dark:bg-red-800/50 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 group-hover:scale-110 transition-transform">
                                <FileText className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 dark:text-white">PDF</h4>
                                <p className="text-xs text-gray-500">Documento para impressão</p>
                            </div>
                            {downloading && <Loader2 className="w-5 h-5 animate-spin ml-auto text-red-500" />}
                        </button>

                        <button 
                            onClick={() => handleDownloadData('csv')}
                            disabled={downloading}
                            className="w-full p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 flex items-center gap-4 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors text-left group"
                        >
                            <div className="w-12 h-12 bg-green-100 dark:bg-green-800/50 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform">
                                <FileText className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 dark:text-white">CSV</h4>
                                <p className="text-xs text-gray-500">Planilha (Excel)</p>
                            </div>
                             {downloading && <Loader2 className="w-5 h-5 animate-spin ml-auto text-green-500" />}
                        </button>
                    </div>
                </div>
            </div>
        )}

      </main>
    </div>
  );
};