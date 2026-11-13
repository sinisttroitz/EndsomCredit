import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Save,
  Camera,
  Loader2,
  AlertCircle,
  Trash2,
  X,
  AlertTriangle,
  User,
  MapPin,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { compressImage } from '@/utils/imageUtils';
import { ClientContact } from '../types';
import { AdditionalContactsInput } from '../components/AdditionalContactsInput';
import {
  ClientDocumentsManager,
  PendingDocumentItem,
} from '../components/ClientDocumentsManager';
import {
  executeWithClientColumnsFallback,
  maskPhoneValue,
  sanitizeAdditionalContacts,
  validateAdditionalContacts,
} from '../utils/clientUtils';

interface EditClientProps {
  clientId: string | null;
  onBack: () => void;
  onSuccess: () => void;
  onDelete: () => void;
}

export const EditClient: React.FC<EditClientProps> = ({
  clientId,
  onBack,
  onSuccess,
  onDelete,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delete states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [additionalContacts, setAdditionalContacts] = useState<ClientContact[]>([]);
  const [email, setEmail] = useState('');
  const [cep, setCep] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [address, setAddress] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Avatar & Documents upload
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [existingDocuments, setExistingDocuments] = useState<string[]>([]);
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocumentItem[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const maskCPF = (value: string) =>
    value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');

  const maskCEP = (value: string) =>
    value
      .replace(/\D/g, '')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{3})\d+?$/, '$1');

  useEffect(() => {
    if (clientId) {
      fetchClientData(clientId);
    }
  }, [clientId]);

  // Revoke preview object URLs on unmount to avoid leaking memory
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const fetchClientData = async (id: string) => {
    setLoading(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;
      if (data) {
        setName(data.name || '');
        setCpf(data.cpf || '');
        setPhone(data.phone || '');
        setAdditionalContacts(
          Array.isArray(data.additional_contacts) ? data.additional_contacts : []
        );
        setEmail(data.email || '');
        setCep(data.cep || '');
        setCity(data.city || '');
        setState(data.state || '');
        setNeighborhood(data.neighborhood || '');
        setAddress(data.address || '');
        setNumber(data.number || '');
        setComplement(data.complement || '');
        setAvatarUrl(data.avatar_url || '');
        setRemoveAvatar(false);
        setExistingDocuments(Array.isArray(data.documents) ? data.documents : []);
      }
    } catch (err: any) {
      console.error(err);
      setError('Erro ao carregar dados do cliente.');
    } finally {
      setLoading(false);
    }
  };

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const formatted = maskCEP(rawValue);
    setCep(formatted);
    const numeric = rawValue.replace(/\D/g, '');
    if (numeric.length === 8) {
      setLoadingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${numeric}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setCity(data.localidade || '');
          setState(data.uf || '');
          setAddress(data.logradouro || '');
          setNeighborhood(data.bairro || '');
        }
      } catch (err) {
        console.error('Erro no CEP', err);
      } finally {
        setLoadingCep(false);
      }
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
      setRemoveAvatar(false);
      e.target.value = '';
    }
  };

  const handleRemoveAvatar = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemoveAvatar(true);
  };

  const handleAddDocuments = (files: FileList) => {
    const additions: PendingDocumentItem[] = Array.from(files).map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      isPdf: file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
      name: file.name,
    }));
    setPendingDocuments((prev) => [...prev, ...additions]);
  };

  const handleRemoveExistingDocument = (index: number) => {
    setExistingDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemovePendingDocument = (id: string) => {
    setPendingDocuments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const uploadToDocumentsBucket = async (file: File, path: string): Promise<string | null> => {
    try {
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from('documents').getPublicUrl(path);
      return publicUrl;
    } catch (err) {
      console.error('Upload error:', err);
      return null;
    }
  };

  const handleSave = async () => {
    if (!clientId || !name.trim()) {
      setError('Informe o nome completo do cliente.');
      return;
    }
    const additionalErr = validateAdditionalContacts(additionalContacts);
    if (additionalErr) {
      setError(additionalErr);
      return;
    }
    setError(null);
    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const folderOwner = user?.id || clientId;

      let finalAvatarUrl: string | null = removeAvatar ? null : avatarUrl || null;
      if (photoFile) {
        const compressedPhoto = await compressImage(photoFile);
        const ext = photoFile.name.split('.').pop() || 'jpg';
        const uploadedAvatar = await uploadToDocumentsBucket(
          compressedPhoto,
          `avatars/${Date.now()}.${ext}`
        );
        if (!uploadedAvatar) {
          throw new Error('Não foi possível enviar a nova foto de perfil.');
        }
        finalAvatarUrl = uploadedAvatar;
      }

      const uploadedDocUrls: string[] = [];
      for (let i = 0; i < pendingDocuments.length; i += 1) {
        const item = pendingDocuments[i];
        const fileToUpload = item.isPdf ? item.file : await compressImage(item.file);
        const ext = item.name.split('.').pop() || (item.isPdf ? 'pdf' : 'jpg');
        const path = `${folderOwner}/${Date.now()}_doc_${i}.${ext}`;
        const url = await uploadToDocumentsBucket(fileToUpload, path);
        if (!url) {
          throw new Error(`Não foi possível enviar o arquivo "${item.name}".`);
        }
        uploadedDocUrls.push(url);
      }

      const finalDocuments = [...existingDocuments, ...uploadedDocUrls];
      const cleanAdditionalContacts = sanitizeAdditionalContacts(additionalContacts);

      const { error: updateError } = await executeWithClientColumnsFallback(
        {
          name: name.trim(),
          cpf,
          phone,
          additional_contacts: cleanAdditionalContacts,
          email: email.trim(),
          cep,
          city: city.trim(),
          state: state.trim().toUpperCase(),
          neighborhood: neighborhood.trim(),
          address: address.trim(),
          number: number.trim(),
          complement: complement.trim(),
          avatar_url: finalAvatarUrl,
          documents: finalDocuments,
        },
        async (payload) => await supabase.from('clients').update(payload).eq('id', clientId)
      );

      if (updateError) throw updateError;
      pendingDocuments.forEach((doc) => URL.revokeObjectURL(doc.previewUrl));
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao salvar alterações.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletePassword) {
      setDeleteError('Por favor, digite sua senha.');
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !user.email) throw new Error('Usuário não identificado.');

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: deletePassword,
      });

      if (authError) {
        throw new Error('Senha incorreta.');
      }

      const { error: loansError } = await supabase.from('loans').delete().eq('client_id', clientId);
      if (loansError) {
        console.error('Erro ao excluir empréstimos:', loansError);
        throw new Error('Erro ao excluir empréstimos vinculados.');
      }

      const { error: deleteErrorRes } = await supabase.from('clients').delete().eq('id', clientId);
      if (deleteErrorRes) throw deleteErrorRes;

      setShowDeleteModal(false);
      onDelete();
    } catch (err: any) {
      console.error(err);
      setDeleteError(err.message || 'Erro ao excluir cliente.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  const displayedAvatar = photoPreview || (removeAvatar ? null : avatarUrl || null);
  const initials = (name || 'CL').trim().substring(0, 2).toUpperCase();

  const renderPersonalCard = (isDesktop: boolean) => (
    <div
      className={
        isDesktop
          ? 'bg-white dark:bg-card-dark rounded-3xl p-7 shadow-sm border border-gray-100 dark:border-gray-800 space-y-5'
          : 'bg-white dark:bg-card-dark rounded-xl p-5 shadow-sm space-y-4 border border-gray-100 dark:border-gray-800'
      }
    >
      <div className="flex items-center gap-2">
        {isDesktop && <User className="w-4 h-4 text-primary" />}
        <h2
          className={
            isDesktop
              ? 'text-xs font-black text-primary tracking-[0.18em] uppercase'
              : 'text-xs font-bold text-primary tracking-widest uppercase'
          }
        >
          Dados Pessoais e Contatos
        </h2>
      </div>

      <div className={isDesktop ? 'grid grid-cols-12 gap-5' : 'space-y-4'}>
        <label className={isDesktop ? 'block col-span-7' : 'block'}>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
            Nome Completo
          </span>
          <input
            className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:outline-none h-12 px-4 text-base transition-all"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className={isDesktop ? 'block col-span-5' : 'block'}>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
            CPF
          </span>
          <input
            className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-gray-500 h-12 px-4 text-base cursor-not-allowed"
            type="text"
            value={cpf}
            onChange={(e) => setCpf(maskCPF(e.target.value))}
            disabled
          />
        </label>

        <div
          className={
            isDesktop
              ? 'col-span-12 grid grid-cols-2 gap-5'
              : 'grid grid-cols-1 md:grid-cols-2 gap-4'
          }
        >
          <label className="block">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
              Telefone Principal
            </span>
            <input
              className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:outline-none h-12 px-4 text-base"
              type="tel"
              value={phone}
              maxLength={15}
              onChange={(e) => setPhone(maskPhoneValue(e.target.value))}
              placeholder="(00) 00000-0000"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
              E-mail
            </span>
            <input
              className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:outline-none h-12 px-4 text-base"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@email.com"
            />
          </label>
        </div>

        <div className={isDesktop ? 'col-span-12 pt-2 border-t border-gray-100 dark:border-gray-800' : 'pt-2'}>
          <AdditionalContactsInput
            contacts={additionalContacts}
            onChange={setAdditionalContacts}
            variant="form"
          />
        </div>
      </div>
    </div>
  );

  const renderAddressCard = (isDesktop: boolean) => (
    <div
      className={
        isDesktop
          ? 'bg-white dark:bg-card-dark rounded-3xl p-7 shadow-sm border border-gray-100 dark:border-gray-800 space-y-5'
          : 'bg-white dark:bg-card-dark rounded-xl p-5 shadow-sm space-y-4 border border-gray-100 dark:border-gray-800'
      }
    >
      <div className="flex items-center gap-2">
        {isDesktop && <MapPin className="w-4 h-4 text-primary" />}
        <h2
          className={
            isDesktop
              ? 'text-xs font-black text-primary tracking-[0.18em] uppercase'
              : 'text-xs font-bold text-primary tracking-widest uppercase'
          }
        >
          Endereço
        </h2>
      </div>

      <div className={isDesktop ? 'grid grid-cols-12 gap-5' : 'space-y-4'}>
        <label className={isDesktop ? 'block col-span-4 relative' : 'block relative'}>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
            CEP
          </span>
          <div className="relative mt-1">
            <input
              className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:outline-none h-12 px-4 pr-10 text-base"
              type="text"
              value={cep}
              onChange={handleCepChange}
              maxLength={9}
              placeholder="00000-000"
            />
            {loadingCep && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>
        </label>

        <div className={isDesktop ? 'col-span-8 grid grid-cols-12 gap-4' : 'grid grid-cols-4 gap-3'}>
          <label className={isDesktop ? 'block col-span-9' : 'block col-span-3'}>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
              Cidade
            </span>
            <input
              className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:outline-none h-12 px-4 text-base"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Cidade"
            />
          </label>
          <label className={isDesktop ? 'block col-span-3' : 'block col-span-1'}>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
              UF
            </span>
            <input
              className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:outline-none h-12 px-3 text-base uppercase text-center"
              type="text"
              value={state}
              maxLength={2}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              placeholder="UF"
            />
          </label>
        </div>

        <label className={isDesktop ? 'block col-span-8' : 'block'}>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
            Logradouro
          </span>
          <input
            className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:outline-none h-12 px-4 text-base"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Rua, Avenida..."
          />
        </label>

        <label className={isDesktop ? 'block col-span-4' : 'hidden'}>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
            Número
          </span>
          <input
            className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:outline-none h-12 px-4 text-base"
            type="text"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="S/N"
          />
        </label>

        <label className={isDesktop ? 'block col-span-6' : 'block'}>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
            Bairro
          </span>
          <input
            className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:outline-none h-12 px-4 text-base"
            type="text"
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
            placeholder="Ex: Centro"
          />
        </label>

        <label className={isDesktop ? 'block col-span-6' : 'hidden'}>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
            Complemento
          </span>
          <input
            className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:outline-none h-12 px-4 text-base"
            type="text"
            value={complement}
            onChange={(e) => setComplement(e.target.value)}
            placeholder="Apto, Bloco, Casa..."
          />
        </label>

        {!isDesktop && (
          <div className="grid grid-cols-3 gap-4">
            <label className="block col-span-1">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
                Número
              </span>
              <input
                className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:outline-none h-12 px-4 text-base"
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="S/N"
              />
            </label>
            <label className="block col-span-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
                Complemento
              </span>
              <input
                className="mt-1 block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-black dark:text-white focus:border-primary focus:outline-none h-12 px-4 text-base"
                type="text"
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                placeholder="Apto, Bloco..."
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark relative">
      {/* Shared hidden avatar input */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoSelect}
      />

      {/* ==================== MOBILE VIEW (Preserved) ==================== */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden relative">
        <header className="sticky top-0 z-50 bg-black text-white px-6 pt-10 pb-12 rounded-b-[40px]">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center justify-center p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold flex-1 text-center pr-10">Editar Cadastro</h1>
          </div>
        </header>

        <main className="flex-1 max-w-md mx-auto pb-48 overflow-y-auto no-scrollbar w-full">
          {error && (
            <div className="m-4 bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-2 text-sm border border-red-100">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Profile Picture Section */}
          <section className="flex flex-col items-center py-8">
            <div
              className="relative group cursor-pointer"
              onClick={() => photoInputRef.current?.click()}
            >
              <div className="w-32 h-32 rounded-full border-4 border-white dark:border-gray-800 shadow-xl overflow-hidden bg-gray-200 dark:bg-gray-700">
                {displayedAvatar ? (
                  <img
                    src={displayedAvatar}
                    alt="Foto do cliente"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl text-gray-400 font-bold">
                    {initials}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full shadow-lg border-2 border-white dark:border-background-dark flex items-center justify-center hover:scale-105 transition-transform"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="text-gray-500 dark:text-gray-400 text-sm font-medium"
              >
                Toque para alterar foto
              </button>
              {displayedAvatar && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="text-xs font-bold text-red-500 hover:underline"
                >
                  Remover
                </button>
              )}
            </div>
          </section>

          <div className="px-4 space-y-6">
            {renderPersonalCard(false)}
            {renderAddressCard(false)}

            <div className="bg-white dark:bg-card-dark rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
              <ClientDocumentsManager
                existingDocuments={existingDocuments}
                pendingDocuments={pendingDocuments}
                onRemoveExisting={handleRemoveExistingDocument}
                onAddFiles={handleAddDocuments}
                onRemovePending={handleRemovePendingDocument}
                compact
              />
            </div>
          </div>
        </main>

        {/* Sticky Bottom Buttons (Mobile only) */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 z-30 flex flex-col gap-3">
          <div className="max-w-md mx-auto w-full space-y-3">
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {saving ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
              Salvar Alterações
            </button>

            <button
              onClick={() => setShowDeleteModal(true)}
              disabled={saving || deleting}
              className="w-full bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold py-3 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-red-200 dark:border-red-900/30"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Cliente
            </button>
          </div>
        </div>
      </div>

      {/* ==================== DESKTOP VIEW ==================== */}
      <div className="hidden md:flex flex-1 flex-col overflow-hidden">
        <header className="px-8 py-5 bg-white dark:bg-card-dark border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="max-w-6xl mx-auto w-full flex justify-between items-center gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <button
                onClick={onBack}
                className="w-10 h-10 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">
                  <span>Clientes</span>
                  <span>/</span>
                  <span>Perfil</span>
                  <span>/</span>
                  <span className="text-gray-900 dark:text-white">Editar Cadastro</span>
                </div>
                <h1 className="text-xl font-black text-gray-900 dark:text-white truncate">
                  {name || 'Editar Cliente'}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={saving || deleting}
                className="px-5 py-2.5 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-2xl text-[11px] font-black uppercase tracking-widest text-red-600 dark:text-red-400 transition-all flex items-center gap-2 disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" />
                Excluir Cliente
              </button>
              <button
                onClick={handleSave}
                disabled={saving || deleting}
                className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:opacity-90 shadow-lg transition-all active:scale-95 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="animate-spin w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-8 bg-gray-50/50 dark:bg-background-dark no-scrollbar">
          <div className="max-w-6xl mx-auto space-y-6 pb-12">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-2xl flex items-center gap-3 text-sm font-semibold border border-red-100 dark:border-red-900/30">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Avatar & Documents */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white dark:bg-card-dark rounded-3xl p-7 border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col items-center text-center">
                  <div
                    className="relative group cursor-pointer"
                    onClick={() => photoInputRef.current?.click()}
                  >
                    <div className="w-28 h-28 rounded-3xl border-4 border-gray-50 dark:border-gray-800 shadow-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                      {displayedAvatar ? (
                        <img
                          src={displayedAvatar}
                          alt="Foto do cliente"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl text-gray-400 font-black">
                          {initials}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="absolute -bottom-2 -right-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 p-2.5 rounded-xl shadow-lg border-2 border-white dark:border-card-dark hover:scale-105 transition-transform"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>

                  <h3 className="text-lg font-black text-gray-900 dark:text-white mt-5">
                    {name || 'Sem nome'}
                  </h3>
                  {cpf && (
                    <span className="mt-1 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-[11px] font-bold text-gray-500 dark:text-gray-400">
                      CPF: {cpf}
                    </span>
                  )}

                  <div className="mt-5 flex items-center gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-bold text-gray-700 dark:text-gray-200 transition-colors"
                    >
                      Alterar Foto
                    </button>
                    {displayedAvatar && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="py-2.5 px-3 rounded-xl bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-xs font-bold text-red-600 dark:text-red-400 transition-colors"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-card-dark rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
                  <ClientDocumentsManager
                    existingDocuments={existingDocuments}
                    pendingDocuments={pendingDocuments}
                    onRemoveExisting={handleRemoveExistingDocument}
                    onAddFiles={handleAddDocuments}
                    onRemovePending={handleRemovePendingDocument}
                  />
                </div>
              </div>

              {/* Right Column: Form Cards */}
              <div className="lg:col-span-8 space-y-6">
                {renderPersonalCard(true)}
                {renderAddressCard(true)}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDeleteModal(false)}
          ></div>
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Excluir Cliente?
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Esta ação não pode ser desfeita. Todos os dados e empréstimos deste cliente serão
                apagados.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Confirme sua senha
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none transition-all"
                  placeholder="Sua senha de login"
                />
              </div>

              {deleteError && (
                <p className="text-xs text-red-600 font-medium bg-red-50 dark:bg-red-900/20 p-2 rounded-lg text-center">
                  {deleteError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="py-3 px-4 rounded-xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="py-3 px-4 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 disabled:opacity-70 transition-colors"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
