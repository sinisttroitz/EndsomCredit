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
    const [birthDay, setBirthDay] = useState('');
    const [birthMonth, setBirthMonth] = useState('');
    const [birthYear, setBirthYear] = useState('');
    const [birthdate, setBirthdate] = useState(''); // Combined DD/MM/YYYY
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

    // Etapa Atual
    const [currentStep, setCurrentStep] = useState(1);
    const totalSteps = 10;

    // Estado Geral
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Handlers de Navegação
    const nextStep = () => {
        if (currentStep === 1 && !name) {
            setError("Por favor, informe o nome do cliente.");
            return;
        }
        if (currentStep === 2 && cpf.length < 14) {
            setError("Por favor, informe um CPF válido.");
            return;
        }
        if (currentStep === 3 && phone.length < 14) {
            setError("Por favor, informe um telefone válido.");
            return;
        }
        if (currentStep === 4 && (birthDay || birthMonth || birthYear)) {
            if (!birthDay || !birthMonth || !birthYear || birthYear.length < 4) {
                setError("Data de nascimento incompleta.");
                return;
            }
        }
        if (currentStep === 5) {
            if (!cep || cep.length < 9) {
                setError("Por favor, informe um CEP válido.");
                return;
            }
            if (!address) {
                setError("Por favor, informe a rua/logradouro.");
                return;
            }
            if (!city) {
                setError("Por favor, informe a cidade.");
                return;
            }
            if (!state || state.length < 2) {
                setError("Por favor, informe o estado (UF).");
                return;
            }
        }
        if (currentStep === 7 && email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                setError("Por favor, informe um e-mail válido.");
                return;
            }
        }
        setError(null);
        setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    };

    const prevStep = () => {
        setError(null);
        setCurrentStep(prev => Math.max(prev - 1, 1));
    };

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

    const validateDayInMonth = (d: string, m: string, y: string) => {
        if (!d || !m) return true;
        const day = parseInt(d);
        const month = parseInt(m);
        const year = y ? parseInt(y) : 2024; // Use a leap year as default if year not typed yet
        
        const daysInMonth = new Date(year, month, 0).getDate();
        return day <= daysInMonth;
    };

    const handleBirthDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 2);
        if (val && (parseInt(val) < 1 || parseInt(val) > 31)) return;
        
        if (birthMonth && !validateDayInMonth(val, birthMonth, birthYear)) {
            // Day invalid for current month
            setBirthDay(val); // still set it but maybe wait for month? 
            // the user said: "se o usuário escolher o dia 31, mas no proximo campo ele escolher um mês q n tem 31... o campo de dia volta a ficar vazio"
            // So the reset happens on MONTH change.
        }
        setBirthDay(val);
    };

    const handleBirthMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 2);
        if (val && (parseInt(val) < 0 || parseInt(val) > 12)) return;
        
        setBirthMonth(val);
        
        // Reset day if invalid for this month
        if (birthDay && val && !validateDayInMonth(birthDay, val, birthYear)) {
            setBirthDay('');
        }
    };

    const handleBlurMonth = () => {
        if (birthMonth && birthMonth.length === 1) {
            setBirthMonth(birthMonth.padStart(2, '0'));
        }
    };

    const handleBlurDay = () => {
        if (birthDay && birthDay.length === 1) {
            setBirthDay(birthDay.padStart(2, '0'));
        }
    };

    const handleBirthYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
        setBirthYear(val);
        
        // Reset day if leap year invalidity
        if (birthDay && val.length === 4 && !validateDayInMonth(birthDay, birthMonth, val)) {
            setBirthDay('');
        }
    };

    // Update combined birthdate for review and save
    React.useEffect(() => {
        if (birthDay && birthMonth && birthYear) {
            setBirthdate(`${birthDay.padStart(2, '0')}/${birthMonth.padStart(2, '0')}/${birthYear}`);
        } else {
            setBirthdate('');
        }
    }, [birthDay, birthMonth, birthYear]);

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
            setPhotoPreview(URL.createObjectURL(file));
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
            const { data, error } = await supabase.storage
                .from('documents')
                .upload(path, file, { upsert: true });

            if (error) {
                console.warn("Erro no upload:", error.message);
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
            setError("Campos obrigatórios ausentes.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            // Converter data DD/MM/YYYY para YYYY-MM-DD para o DB
            let formattedBirthdate = null;
            if (birthdate && birthdate.length === 10) {
                const [day, month, year] = birthdate.split('/');
                formattedBirthdate = `${year}-${month}-${day}`;
            }

            let avatarUrl: string | null = null;
            if (photoFile) {
                const compressedPhoto = await compressImage(photoFile);
                const ext = photoFile.name.split('.').pop();
                const fileName = `${user.id}/${Date.now()}_avatar.${ext}`;
                const uploadedUrl = await uploadFileToSupabase(compressedPhoto, fileName);
                if (uploadedUrl) avatarUrl = uploadedUrl;
            }

            let documentUrls: string[] = [];
            if (docFiles.length > 0) {
                for (let i = 0; i < docFiles.length; i++) {
                    const file = docFiles[i];
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
                .insert([{
                    name, cpf, phone, email, birthdate: formattedBirthdate, cep, city, state, address, number, complement,
                    user_id: user.id, status: 'active', avatar_url: avatarUrl, documents: documentUrls
                }]);

            if (insertError) throw insertError;
            onSuccess();
        } catch (err: any) {
            setError(err.message || "Erro ao salvar.");
        } finally {
            setLoading(false);
        }
    };

    const renderStep = () => {
        switch (currentStep) {
            case 1:
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Qual o nome completo do cliente?</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Use o nome conforme consta no documento de identidade.</p>
                        </div>
                        <input
                            autoFocus
                            value={name} onChange={(e) => setName(e.target.value)}
                            className="w-full bg-transparent border-b-2 border-gray-200 dark:border-gray-800 py-4 text-2xl font-bold text-primary dark:text-white focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                            placeholder="Nome Completo"
                        />
                    </div>
                );
            case 2:
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">E o CPF dele?</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Isso ajuda a identificar o cliente no sistema.</p>
                        </div>
                        <input
                            autoFocus
                            value={cpf} onChange={handleCpfChange}
                            maxLength={14}
                            className="w-full bg-transparent border-b-2 border-gray-200 dark:border-gray-800 py-4 text-3xl font-bold text-primary dark:text-white focus:outline-none focus:border-black dark:focus:border-white transition-colors tracking-widest"
                            placeholder="000.000.000-00"
                        />
                    </div>
                );
            case 3:
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Qual o telefone de contato?</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Preferencialmente um número com WhatsApp.</p>
                        </div>
                        <input
                            autoFocus
                            value={phone} onChange={handlePhoneChange}
                            maxLength={15}
                            className="w-full bg-transparent border-b-2 border-gray-200 dark:border-gray-800 py-4 text-3xl font-bold text-primary dark:text-white focus:outline-none focus:border-black dark:focus:border-white transition-colors tracking-wider"
                            placeholder="(00) 00000-0000"
                        />
                    </div>
                );
            case 4:
                return (
                    <div className="space-y-6 animate-fadeIn pb-10">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Data de nascimento</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Preencha os campos abaixo.</p>
                        </div>
                        
                        <div className="space-y-8">
                            <div className="border-b-2 border-gray-100 dark:border-gray-800 focus-within:border-gray-900 dark:text-white transition-colors pb-2">
                                <span className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Dia</span>
                                <input
                                    autoFocus
                                    type="tel"
                                    value={birthDay}
                                    onChange={handleBirthDayChange}
                                    onBlur={handleBlurDay}
                                    placeholder="01"
                                    className="w-full bg-transparent text-4xl font-black text-primary dark:text-white focus:outline-none"
                                />
                            </div>

                            <div className="border-b-2 border-gray-100 dark:border-gray-800 focus-within:border-gray-900 dark:text-white transition-colors pb-2">
                                <span className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Mês</span>
                                <input
                                    type="tel"
                                    value={birthMonth}
                                    onChange={handleBirthMonthChange}
                                    onBlur={handleBlurMonth}
                                    placeholder="01"
                                    className="w-full bg-transparent text-4xl font-black text-primary dark:text-white focus:outline-none"
                                />
                            </div>

                            <div className="border-b-2 border-gray-100 dark:border-gray-800 focus-within:border-gray-900 dark:text-white transition-colors pb-2">
                                <span className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Ano</span>
                                <input
                                    type="tel"
                                    value={birthYear}
                                    onChange={handleBirthYearChange}
                                    placeholder="0000"
                                    className="w-full bg-transparent text-4xl font-black text-primary dark:text-white focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>
                );
            case 5:
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Onde o cliente mora?</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Informe o CEP para buscarmos o endereço automaticamente.</p>
                        </div>
                        <div className="relative">
                            <input
                                autoFocus
                                value={cep} onChange={handleCepChange}
                                maxLength={9}
                                className="w-full bg-transparent border-b-2 border-gray-200 dark:border-gray-800 py-4 text-3xl font-bold text-primary dark:text-white focus:outline-none focus:border-black dark:focus:border-white transition-colors tracking-widest"
                                placeholder="00000-000"
                            />
                            {loadingCep && <div className="absolute right-0 top-6"><Loader2 className="w-6 h-6 animate-spin text-gray-900 dark:text-white" /></div>}
                        </div>

                        {(city || address || cep.length === 9) && (
                            <div className="space-y-4 pt-2 animate-slideIn">
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="col-span-3 border-b border-gray-100 dark:border-gray-800 pb-1">
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Logradouro / Rua</span>
                                        <input
                                            value={address}
                                            onChange={(e) => setAddress(e.target.value)}
                                            placeholder="Ex: Rua das Flores"
                                            className="w-full bg-transparent text-lg font-bold text-primary dark:text-white focus:outline-none"
                                        />
                                    </div>
                                    <div className="col-span-1 border-b border-gray-100 dark:border-gray-800 pb-1">
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Nº</span>
                                        <input
                                            value={number}
                                            onChange={(e) => setNumber(e.target.value)}
                                            placeholder="S/N"
                                            className="w-full bg-transparent text-lg font-bold text-primary dark:text-white focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="border-b border-gray-100 dark:border-gray-800 pb-1">
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cidade</span>
                                        <input
                                            value={city}
                                            onChange={(e) => setCity(e.target.value)}
                                            placeholder="Cidade"
                                            className="w-full bg-transparent text-lg font-bold text-primary dark:text-white focus:outline-none"
                                        />
                                    </div>
                                    <div className="border-b border-gray-100 dark:border-gray-800 pb-1">
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Estado (UF)</span>
                                        <input
                                            value={state}
                                            onChange={(e) => setState(e.target.value)}
                                            maxLength={2}
                                            placeholder="UF"
                                            className="w-full bg-transparent text-lg font-bold text-primary dark:text-white focus:outline-none uppercase"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 6:
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Complemento</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Apartamento, bloco, casa nos fundos, etc.</p>
                        </div>
                        <div className="border-b-2 border-gray-200 dark:border-gray-800 focus-within:border-gray-900 dark:text-white transition-colors">
                            <span className="block text-[10px] font-bold text-gray-400 uppercase">Complemento (Opcional)</span>
                            <input
                                autoFocus
                                value={complement}
                                onChange={(e) => setComplement(e.target.value)}
                                className="w-full bg-transparent py-4 text-2xl font-bold text-primary dark:text-white focus:outline-none"
                                placeholder="Ex: Bloco B, Apto 202"
                            />
                        </div>
                    </div>
                );
            case 7:
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Endereço de E-mail</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Para onde enviaremos notificações (opcional).</p>
                        </div>
                        <input
                            autoFocus
                            type="email"
                            value={email} onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-transparent border-b-2 border-gray-200 dark:border-gray-800 py-4 text-2xl font-bold text-primary dark:text-white focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                            placeholder="exemplo@email.com"
                        />
                    </div>
                );
            case 8:
                return (
                    <div className="space-y-6 animate-fadeIn text-center">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Foto do Cliente</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Tire uma foto ou selecione da galeria.</p>
                        </div>
                        <div
                            className="mx-auto w-48 h-48 rounded-[40px] border-2 border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center justify-center overflow-hidden cursor-pointer bg-gray-50 dark:bg-gray-800/50 hover:border-gray-900 dark:text-white transition-all"
                            onClick={() => photoInputRef.current?.click()}
                        >
                            {photoPreview ? (
                                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <>
                                    <Camera className="w-12 h-12 text-gray-300 mb-2" />
                                    <span className="text-xs font-bold text-gray-400">ADD FOTO</span>
                                </>
                            )}
                        </div>
                        <input ref={photoInputRef} type="file" className="hidden" accept="image/*" onChange={handlePhotoSelect} />
                    </div>
                );
            case 9:
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Documentos</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Anexe fotos de documentos importantes (RG, CNH, etc).</p>
                        </div>
                        <div
                            className="w-full h-32 rounded-3xl border-2 border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center justify-center cursor-pointer bg-gray-50 dark:bg-gray-800/50 hover:border-gray-900 dark:text-white transition-all"
                            onClick={() => docsInputRef.current?.click()}
                        >
                            <Upload className="w-8 h-8 text-gray-300 mb-1" />
                            <span className="text-xs font-bold text-gray-400">CLIQUE PARA ENVIAR</span>
                        </div>
                        <input ref={docsInputRef} type="file" className="hidden" accept="image/*,application/pdf" multiple onChange={handleDocsSelect} />

                        <div className="grid grid-cols-3 gap-3">
                            {docPreviews.map((p, idx) => (
                                <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden shadow-sm group">
                                    <img src={p} className="w-full h-full object-cover" />
                                    <button onClick={() => removeDoc(idx)} className="absolute top-1 right-1 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 10:
                return (
                    <div className="space-y-6 animate-fadeIn pb-10">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Revise tudo com calma</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Toque em qualquer seção para editar se houver erros.</p>
                        </div>

                        <div className="space-y-4">
                            {/* Bloco Identificação */}
                            <button 
                                onClick={() => setCurrentStep(1)}
                                className="w-full text-left p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-transparent active:border-gray-900/30 dark:border-white/30 transition-all hover:bg-gray-100 dark:hover:bg-gray-800 group"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-gray-900 dark:bg-white/10 flex items-center justify-center">
                                            <User className="w-3.5 h-3.5 text-gray-900 dark:text-white" />
                                        </div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Identificação</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-900 dark:text-white opacity-0 group-hover:opacity-100 transition-opacity">EDITAR</span>
                                </div>
                                <p className="font-bold text-gray-900 dark:text-white text-lg">{name}</p>
                                <div className="grid grid-cols-2 gap-4 mt-2">
                                    <div>
                                        <p className="text-[9px] text-gray-400 uppercase font-bold">CPF</p>
                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{cpf}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-gray-400 uppercase font-bold">Nascimento</p>
                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{birthdate || '-'}</p>
                                    </div>
                                </div>
                            </button>

                            {/* Bloco Contato */}
                            <button 
                                onClick={() => setCurrentStep(3)}
                                className="w-full text-left p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-transparent active:border-gray-900/30 dark:border-white/30 transition-all hover:bg-gray-100 dark:hover:bg-gray-800 group"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Contato</span>
                                    <span className="text-[10px] font-bold text-gray-900 dark:text-white opacity-0 group-hover:opacity-100 transition-opacity">EDITAR</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[9px] text-gray-400 uppercase font-bold">Telefone</p>
                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{phone}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-gray-400 uppercase font-bold">E-mail</p>
                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 truncate">{email || '-'}</p>
                                    </div>
                                </div>
                            </button>

                            {/* Bloco Endereço */}
                            <button 
                                onClick={() => setCurrentStep(5)}
                                className="w-full text-left p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-transparent active:border-gray-900 dark:text-white/30 transition-all hover:bg-gray-100 dark:hover:bg-gray-800 group"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-gray-900 dark:text-white/10 flex items-center justify-center">
                                            <MapPin className="w-3.5 h-3.5 text-gray-900 dark:text-white" />
                                        </div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Endereço</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-900 dark:text-white opacity-0 group-hover:opacity-100 transition-opacity">EDITAR</span>
                                </div>
                                <p className="font-bold text-gray-900 dark:text-white">{address}{number ? `, ${number}` : ''}</p>
                                <div className="grid grid-cols-2 gap-4 mt-2">
                                    <div>
                                        <p className="text-[9px] text-gray-400 uppercase font-bold">Cidade</p>
                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{city} - {state}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-gray-400 uppercase font-bold">CEP</p>
                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{cep}</p>
                                    </div>
                                </div>
                            </button>

                            {/* Bloco Mídia */}
                            <button 
                                onClick={() => setCurrentStep(8)}
                                className="w-full text-left p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-transparent active:border-gray-900 dark:text-white/30 transition-all hover:bg-gray-100 dark:hover:bg-gray-800 group"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Mídia</span>
                                    <span className="text-[10px] font-bold text-gray-900 dark:text-white opacity-0 group-hover:opacity-100 transition-opacity">EDITAR</span>
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                                    {photoPreview ? (
                                        <img src={photoPreview} className="w-14 h-14 rounded-xl object-cover ring-2 ring-white dark:ring-gray-700" />
                                    ) : (
                                        <div className="w-14 h-14 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                            <Camera className="w-5 h-5 text-gray-400" />
                                        </div>
                                    )}
                                    {docPreviews.map((p, i) => <img key={i} src={p} className="w-14 h-14 rounded-xl object-cover opacity-60" />)}
                                </div>
                            </button>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-[#0a0a0a]">
            {/* Header com Barra de Progresso Segmentada */}
            <header className="px-6 pt-8 pb-4">
                <div className="flex items-center gap-4 mb-6">
                    <button onClick={currentStep === 1 ? onBack : prevStep} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white active:scale-95 transition-transform shrink-0">
                        <ArrowLeft className="w-5 h-5" />
                    </button>

                    {/* Segmented Progress Bar */}
                    <div className="flex-1 flex gap-1.5 h-1.5 items-center">
                        {Array.from({ length: totalSteps }).map((_, i) => (
                            <div
                                key={i}
                                className={`flex-1 h-full rounded-full transition-all duration-300 ${i + 1 <= currentStep
                                        ? 'bg-gray-900 dark:bg-white shadow-black/5 dark:shadow-white/5'
                                        : 'bg-gray-200 dark:bg-gray-800'
                                    }`}
                            />
                        ))}
                    </div>

                    <div className="w-10 h-10 opacity-0"></div> {/* Spacer for symmetry */}
                </div>
            </header>

            <main className="flex-1 shrink-0 px-8 pt-10 pb-20 overflow-y-auto no-scrollbar">
                {error && (
                    <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/30 flex items-center gap-3 animate-shake">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-sm font-bold">{error}</span>
                    </div>
                )}

                {renderStep()}
            </main>

            {/* Footer com Botão de Ação Dinâmico */}
            <footer className="p-6 pb-12 bg-white dark:bg-[#0a0a0a] border-t border-gray-100 dark:border-gray-900">
                {currentStep === totalSteps ? (
                    <button 
                        onClick={handleSave}
                        disabled={loading}
                        className="w-full h-16 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-bold text-lg shadow-xl shadow-black/5 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                    >
                        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                            <>
                                <User className="w-5 h-5" />
                                Confirmar e Salvar
                            </>
                        )}
                    </button>
                ) : (
                    <button 
                        onClick={nextStep}
                        className="w-full h-16 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-3xl font-bold text-lg shadow-xl shadow-black/20 dark:shadow-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                    >
                        {currentStep === 9 ? 'Revisar Cadastro' : 'Próximo passo'}
                        <ArrowLeft className="w-5 h-5 rotate-180" />
                    </button>
                )}
            </footer>
        </div>
    );
};