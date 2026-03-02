import React, { useState, useRef } from 'react';
import { ArrowLeft, User, Camera, MapPin, AlertCircle, Loader2, FileText, Upload, X, Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { compressImage } from '@/utils/imageUtils';

interface NewClientProps {
    onBack: () => void;
    onSuccess: () => void;
}

export const NewClient: React.FC<NewClientProps> = ({ onBack, onSuccess }) => {
    // Dados Pessoais
    const [name, setName] = useState('');
    const [cpf, setCpf] = useState('');
    const [phone, setPhone] = useState('');
    const [birthdate, setBirthdate] = useState('');
    const [email, setEmail] = useState('');

    // Endereço
    const [cep, setCep] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [address, setAddress] = useState(''); // Logradouro
    const [number, setNumber] = useState('');
    const [complement, setComplement] = useState('');
    const [loadingCep, setLoadingCep] = useState(false);

    // Arquivos
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [docFiles, setDocFiles] = useState<File[]>([]);
    const [docPreviews, setDocPreviews] = useState<string[]>([]);
    
    // Refs para inputs de arquivo
    const photoInputRef = useRef<HTMLInputElement>(null);
    const docsInputRef = useRef<HTMLInputElement>(null);

    // Estado Geral
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Máscaras
    const maskCPF = (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})/, '$1-$2')
            .replace(/(-\d{2})\d+?$/, '$1');
    };

    const maskPhone = (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d)/, '$1-$2')
            .replace(/(-\d{4})\d+?$/, '$1');
    };

    const maskCEP = (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/(\d{5})(\d)/, '$1-$2')
            .replace(/(-\d{3})\d+?$/, '$1');
    };

    // Handlers com Máscara
    const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCpf(maskCPF(e.target.value));
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPhone(maskPhone(e.target.value));
    };

    // Busca de CEP
    const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value;
        const formattedCep = maskCEP(rawValue);
        setCep(formattedCep);

        const numericValue = rawValue.replace(/\D/g, '');

        if (numericValue.length === 8) {
            setLoadingCep(true);
            try {
                const response = await fetch(`https://viacep.com.br/ws/${numericValue}/json/`);
                const data = await response.json();
                
                if (!data.erro) {
                    setCity(data.localidade);
                    setState(data.uf);
                    setAddress(data.logradouro);
                }
            } catch (error) {
                console.error("Erro ao buscar CEP", error);
            } finally {
                setLoadingCep(false);
            }
        }
    };

    // Handlers de Arquivos
    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file as Blob));
        }
    };

    const handleDocsSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files) as File[];
            setDocFiles(prev => [...prev, ...newFiles]);
            
            const newPreviews = newFiles.map(file => URL.createObjectURL(file));
            setDocPreviews(prev => [...prev, ...newPreviews]);
        }
    };

    const removePhoto = (e: React.MouseEvent) => {
        e.stopPropagation();
        setPhotoFile(null);
        setPhotoPreview(null);
        if (photoInputRef.current) photoInputRef.current.value = '';
    };

    const removeDoc = (index: number) => {
        setDocFiles(prev => prev.filter((_, i) => i !== index));
        setDocPreviews(prev => prev.filter((_, i) => i !== index));
    };

    const uploadFileToSupabase = async (file: File, path: string): Promise<string | null> => {
        try {
            // Tenta fazer o upload para o bucket 'documents'
            const { data, error } = await supabase.storage
                .from('documents')
                .upload(path, file, { upsert: true });

            if (error) {
                console.warn("Erro no upload (Bucket pode não existir):", error.message);
                // Fallback: Se não conseguir fazer upload, retorna null (app continua funcionando)
                return null;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('documents')
                .getPublicUrl(path);
            
            return publicUrl;
        } catch (e) {
            console.error("Exceção no upload:", e);
            return null;
        }
    };

    const handleSave = async () => {
        if (!name || !cpf || !phone) {
            setError("Nome, CPF e Telefone são campos obrigatórios.");
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) throw new Error("Usuário não autenticado");

            // 1. Upload da Foto de Perfil
            let avatarUrl = `https://ui-avatars.com/api/?name=${name}&background=random`;
            if (photoFile) {
                const compressedPhoto = await compressImage(photoFile);
                const ext = photoFile.name.split('.').pop();
                const fileName = `${user.id}/${Date.now()}_avatar.${ext}`;
                const uploadedUrl = await uploadFileToSupabase(compressedPhoto, fileName);
                if (uploadedUrl) avatarUrl = uploadedUrl;
            }

            // 2. Upload dos Documentos
            let documentUrls: string[] = [];
            if (docFiles.length > 0) {
                for (let i = 0; i < docFiles.length; i++) {
                    const file = docFiles[i];
                    // Compress only if it's an image
                    const isImage = file.type.startsWith('image/');
                    const fileToUpload = isImage ? await compressImage(file) : file;
                    
                    const ext = file.name.split('.').pop();
                    const fileName = `${user.id}/${Date.now()}_doc_${i}.${ext}`;
                    const uploadedUrl = await uploadFileToSupabase(fileToUpload, fileName);
                    if (uploadedUrl) documentUrls.push(uploadedUrl);
                }
            }

            const { error: insertError } = await supabase
                .from('clients')
                .insert([
                    {
                        name,
                        cpf,
                        phone,
                        email,
                        birthdate,
                        cep,
                        city,
                        state,
                        address,
                        number,
                        complement,
                        user_id: user.id,
                        status: 'active',
                        avatar_url: avatarUrl,
                        documents: documentUrls
                    }
                ]);

            if (insertError) throw insertError;
            
            onSuccess();

        } catch (err: any) {
            console.error(err);
            if (err.code === 'PGRST204') {
                setError("Erro de Banco de Dados: Colunas ausentes (address, documents, etc). Execute o script SQL de atualização.");
            } else {
                setError(err.message || "Erro ao salvar cliente.");
            }
        } finally {
            setLoading(false);
        }
    };

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <header className="bg-primary dark:bg-black text-white rounded-b-b-header px-6 pt-12 pb-10 shadow-lg relative z-10">
        <div className="flex items-center justify-between mb-2">
          <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold tracking-tight">Novo Cliente</h1>
          <div className="w-10 h-10 opacity-0"></div>
        </div>
      </header>

      <main className="flex-1 px-5 pt-6 pb-8 overflow-y-auto space-y-6 no-scrollbar">
        
        {/* Error Alert */}
        {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-2 text-sm border border-red-100 animate-fadeIn">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1">{error}</span>
            </div>
        )}
        
        {/* Dados Pessoais */}
        <div className="bg-card-light dark:bg-card-dark p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
             <div className="flex items-center gap-2 mb-6 text-primary dark:text-white">
                <User className="w-5 h-5 text-accent-blue" />
                <h2 className="font-semibold text-lg">Dados Pessoais</h2>
             </div>
             
             <div className="space-y-5">
                 {/* Nome Completo */}
                 <div className="relative">
                    <input 
                        id="fullname"
                        value={name} onChange={(e) => setName(e.target.value)}
                        className="block w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent appearance-none peer" 
                        placeholder=" " 
                        type="text"
                    />
                    <label htmlFor="fullname" className="absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-accent-blue peer-focus:dark:text-blue-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-85 peer-focus:-translate-y-3">
                        Nome Completo <span className="text-red-500">*</span>
                    </label>
                 </div>

                 {/* CPF */}
                 <div className="relative">
                    <input 
                        id="cpf"
                        value={cpf} onChange={handleCpfChange}
                        className="block w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent appearance-none peer" 
                        placeholder=" " 
                        type="text"
                        maxLength={14}
                    />
                    <label htmlFor="cpf" className="absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-accent-blue peer-focus:dark:text-blue-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-85 peer-focus:-translate-y-3">
                        CPF <span className="text-red-500">*</span>
                    </label>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    {/* Telefone */}
                    <div className="relative">
                        <input 
                            id="phone"
                            value={phone} onChange={handlePhoneChange}
                            className="block w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent appearance-none peer" 
                            placeholder=" " 
                            type="tel"
                            maxLength={15}
                        />
                        <label htmlFor="phone" className="absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-accent-blue peer-focus:dark:text-blue-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-85 peer-focus:-translate-y-3">
                            Telefone <span className="text-red-500">*</span>
                        </label>
                    </div>
                    {/* Nascimento */}
                    <div className="relative">
                        <input 
                            id="birthdate"
                            value={birthdate} onChange={(e) => setBirthdate(e.target.value)}
                            className="block w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent appearance-none peer [color-scheme:light]" 
                            placeholder=" " 
                            type="date"
                        />
                        <label htmlFor="birthdate" className="absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-accent-blue peer-focus:dark:text-blue-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-85 peer-focus:-translate-y-3">
                            Nascimento
                        </label>
                    </div>
                 </div>

                 {/* Email */}
                 <div className="relative">
                    <input 
                        id="email"
                        value={email} onChange={(e) => setEmail(e.target.value)}
                        className="block w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent appearance-none peer" 
                        placeholder=" " 
                        type="email"
                    />
                    <label htmlFor="email" className="absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-accent-blue peer-focus:dark:text-blue-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-85 peer-focus:-translate-y-3">
                        E-mail
                    </label>
                 </div>
             </div>
        </div>

        {/* Endereço */}
        <div className="bg-card-light dark:bg-card-dark p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
             <div className="flex items-center gap-2 mb-6 text-primary dark:text-white">
                <MapPin className="w-5 h-5 text-accent-blue" />
                <h2 className="font-semibold text-lg">Endereço</h2>
             </div>
             
             <div className="space-y-5">
                 <div className="grid grid-cols-12 gap-4">
                    {/* CEP */}
                    <div className="relative col-span-4">
                        <input 
                            id="cep"
                            value={cep} onChange={handleCepChange}
                            className="block w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent appearance-none peer" 
                            placeholder=" " 
                            type="text"
                            maxLength={9}
                        />
                        <label htmlFor="cep" className="absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-accent-blue peer-focus:dark:text-blue-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-85 peer-focus:-translate-y-3">
                            CEP
                        </label>
                        {loadingCep && <div className="absolute right-2 top-3.5"><Loader2 className="w-4 h-4 animate-spin text-accent-blue"/></div>}
                    </div>
                    {/* Cidade */}
                    <div className="relative col-span-5">
                        <input 
                            id="city"
                            value={city} onChange={(e) => setCity(e.target.value)}
                            className="block w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent appearance-none peer" 
                            placeholder=" " 
                            type="text"
                        />
                        <label htmlFor="city" className="absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-accent-blue peer-focus:dark:text-blue-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-85 peer-focus:-translate-y-3">
                            Cidade
                        </label>
                    </div>
                    {/* UF */}
                    <div className="relative col-span-3">
                        <input 
                            id="state"
                            value={state} onChange={(e) => setState(e.target.value)}
                            className="block w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent appearance-none peer" 
                            placeholder=" " 
                            type="text"
                            maxLength={2}
                        />
                        <label htmlFor="state" className="absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-accent-blue peer-focus:dark:text-blue-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-85 peer-focus:-translate-y-3">
                            UF
                        </label>
                    </div>
                 </div>

                 {/* Logradouro */}
                 <div className="relative">
                    <input 
                        id="address"
                        value={address} onChange={(e) => setAddress(e.target.value)}
                        className="block w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent appearance-none peer" 
                        placeholder=" " 
                        type="text"
                    />
                    <label htmlFor="address" className="absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-accent-blue peer-focus:dark:text-blue-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-85 peer-focus:-translate-y-3">
                        Logradouro
                    </label>
                 </div>

                 <div className="grid grid-cols-3 gap-4">
                    {/* Número */}
                    <div className="relative col-span-1">
                        <input 
                            id="number"
                            value={number} onChange={(e) => setNumber(e.target.value)}
                            className="block w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent appearance-none peer" 
                            placeholder=" " 
                            type="text"
                        />
                        <label htmlFor="number" className="absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-accent-blue peer-focus:dark:text-blue-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-85 peer-focus:-translate-y-3">
                            Número
                        </label>
                    </div>
                    {/* Complemento */}
                    <div className="relative col-span-2">
                        <input 
                            id="complement"
                            value={complement} onChange={(e) => setComplement(e.target.value)}
                            className="block w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent appearance-none peer" 
                            placeholder=" " 
                            type="text"
                        />
                        <label htmlFor="complement" className="absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-accent-blue peer-focus:dark:text-blue-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-85 peer-focus:-translate-y-3">
                            Complemento
                        </label>
                    </div>
                 </div>
             </div>
        </div>

        {/* Documentos com Upload Real */}
        <div className="bg-card-light dark:bg-card-dark p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 mb-6">
            <div className="flex items-center gap-2 mb-6 text-primary dark:text-white">
                <Camera className="w-5 h-5 text-accent-blue" />
                <h2 className="font-semibold text-lg">Documentos</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Foto do Cliente */}
                <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-text-sub-light dark:text-text-sub-dark ml-1">Foto do Cliente</span>
                    <div 
                        className="group relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-accent-blue dark:hover:border-accent-blue transition-all cursor-pointer overflow-hidden"
                        onClick={() => photoInputRef.current?.click()}
                    >
                        {photoPreview ? (
                            <>
                                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <p className="text-white text-xs font-bold">Alterar Foto</p>
                                </div>
                                <button 
                                    onClick={removePhoto}
                                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full shadow-lg hover:scale-110 transition-transform z-10"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-gray-400 group-hover:text-accent-blue transition-colors">
                                <User className="w-8 h-8 mb-2" />
                                <p className="text-xs text-center">Adicionar foto</p>
                            </div>
                        )}
                        <input 
                            ref={photoInputRef}
                            type="file" 
                            className="hidden" 
                            accept="image/*" 
                            onChange={handlePhotoSelect}
                        />
                    </div>
                </div>

                {/* Documentos (Multiplos) */}
                <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-text-sub-light dark:text-text-sub-dark ml-1">Documento (Frente e Verso)</span>
                    <div className="flex flex-col gap-3">
                         <div 
                            className="group relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-accent-blue dark:hover:border-accent-blue transition-all cursor-pointer"
                            onClick={() => docsInputRef.current?.click()}
                        >
                            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-gray-400 group-hover:text-accent-blue transition-colors">
                                <Upload className="w-8 h-8 mb-2" />
                                <p className="text-xs text-center">Enviar documentos</p>
                            </div>
                            <input 
                                ref={docsInputRef}
                                type="file" 
                                className="hidden" 
                                accept="image/*,application/pdf" 
                                multiple 
                                onChange={handleDocsSelect}
                            />
                        </div>

                        {/* Grid de Previews de Documentos */}
                        {docPreviews.length > 0 && (
                            <div className="grid grid-cols-3 gap-2 mt-1">
                                {docPreviews.map((preview, index) => (
                                    <div key={index} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 group">
                                        <img src={preview} alt={`Doc ${index}`} className="w-full h-full object-cover" />
                                        <button 
                                            onClick={() => removeDoc(index)}
                                            className="absolute top-1 right-1 p-1 bg-red-500/90 text-white rounded-full shadow-sm hover:scale-110 transition-transform opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>

        <div className="pt-2 pb-12">
            <button 
                onClick={handleSave}
                disabled={loading}
                className="w-full bg-primary dark:bg-white text-white dark:text-primary py-4 rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-70 flex items-center justify-center"
            >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Cadastrar Cliente'}
            </button>
        </div>

      </main>
    </div>
  );
};