import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, User, Camera, Upload, X, Loader2, AlertCircle, CheckCircle2, Shield, FileText } from 'lucide-react';
import { fetchRegistrationData, submitRegistration, uploadRegistrationFile } from '../utils/registrationUtils';
import { compressImage } from '../utils/imageUtils';

interface Props { token: string; }

type RegView = 'loading' | 'error' | 'form' | 'success';

export const ClientRegistration: React.FC<Props> = ({ token }) => {
    const [view, setView] = useState<RegView>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const [lenderName, setLenderName] = useState('');
    const [lenderId, setLenderId] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [step, setStep] = useState(1);
    const totalSteps = 8;
    const [name, setName] = useState('');
    const [cpf, setCpf] = useState('');
    const [phone, setPhone] = useState('');
    const [birthdate, setBirthdate] = useState('');
    const [email, setEmail] = useState('');
    const [cep, setCep] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [address, setAddress] = useState('');
    const [number, setNumber] = useState('');
    const [complement, setComplement] = useState('');
    const [loadingCep, setLoadingCep] = useState(false);

    // Files
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [docFiles, setDocFiles] = useState<File[]>([]);
    const [docPreviews, setDocPreviews] = useState<string[]>([]);
    const photoRef = useRef<HTMLInputElement>(null);
    const docsRef = useRef<HTMLInputElement>(null);

    useEffect(() => { loadData(); }, [token]);

    const loadData = async () => {
        const data = await fetchRegistrationData(token);
        if (!data) { setErrorMsg('Link inválido ou desativado.'); setView('error'); return; }
        if (data.pendingCount >= data.maxPending) { setErrorMsg('O limite de pré-cadastros foi atingido. Tente novamente mais tarde.'); setView('error'); return; }
        setLenderName(data.lenderName);
        setLenderId(data.link.lender_id);
        setView('form');
    };

    // Masks
    const maskCPF = (v: string) => v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').replace(/(-\d{2})\d+?$/, '$1');
    const maskPhone = (v: string) => v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').replace(/(-\d{4})\d+?$/, '$1');
    const maskCEP = (v: string) => v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').replace(/(-\d{3})\d+?$/, '$1');
    const maskDate = (v: string) => v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})(\d)/, '$1/$2').replace(/(\/\d{4})\d+?$/, '$1');

    const handleCepChange = async (v: string) => {
        const formatted = maskCEP(v);
        setCep(formatted);
        const numeric = v.replace(/\D/g, '');
        if (numeric.length === 8) {
            setLoadingCep(true);
            try {
                const res = await fetch(`https://viacep.com.br/ws/${numeric}/json/`);
                const data = await res.json();
                if (!data.erro) { setCity(data.localidade); setState(data.uf); setAddress(data.logradouro); }
            } catch { } finally { setLoadingCep(false); }
        }
    };

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) { setPhotoFile(e.target.files[0]); setPhotoPreview(URL.createObjectURL(e.target.files[0])); }
    };

    const handleDocsSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            setDocFiles(p => [...p, ...files]);
            setDocPreviews(p => [...p, ...files.map(f => URL.createObjectURL(f))]);
        }
    };

    const nextStep = () => {
        if (step === 1 && !name) { setFormError('Informe seu nome completo.'); return; }
        if (step === 2 && cpf.length < 14) { setFormError('Informe um CPF válido.'); return; }
        if (step === 3 && phone.length < 14) { setFormError('Informe um telefone válido.'); return; }
        setFormError(null);
        setStep(s => Math.min(s + 1, totalSteps));
    };

    const handleSubmit = async () => {
        if (!name || !cpf || !phone) { setFormError('Preencha os campos obrigatórios.'); return; }
        setSaving(true); setFormError(null);
        try {
            let avatarUrl: string | null = null;
            if (photoFile) {
                const compressed = await compressImage(photoFile);
                const ext = photoFile.name.split('.').pop();
                avatarUrl = await uploadRegistrationFile(compressed, `registrations/${lenderId}/${Date.now()}_avatar.${ext}`);
            }
            let documentUrls: string[] = [];
            for (let i = 0; i < docFiles.length; i++) {
                const f = docFiles[i];
                const toUpload = f.type.startsWith('image/') ? await compressImage(f) : f;
                const ext = f.name.split('.').pop();
                const url = await uploadRegistrationFile(toUpload, `registrations/${lenderId}/${Date.now()}_doc_${i}.${ext}`);
                if (url) documentUrls.push(url);
            }

            let formattedBirth: string | undefined;
            if (birthdate && birthdate.length === 10) {
                const [d, m, y] = birthdate.split('/');
                formattedBirth = `${y}-${m}-${d}`;
            }

            const result = await submitRegistration(lenderId, token, {
                name, cpf, phone, email: email || undefined, birthdate: formattedBirth,
                cep: cep || undefined, city: city || undefined, state: state || undefined,
                address: address || undefined, number: number || undefined, complement: complement || undefined,
                avatar_url: avatarUrl || undefined, documents: documentUrls.length > 0 ? documentUrls : undefined,
            });

            if (result.success) { setView('success'); }
            else { setFormError(result.error || 'Erro ao enviar cadastro.'); }
        } catch { setFormError('Erro inesperado. Tente novamente.'); }
        finally { setSaving(false); }
    };

    // --- LOADING ---
    if (view === 'loading') return (
        <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center">
            <div className="text-center">
                <Loader2 className="w-10 h-10 animate-spin text-gray-400 mx-auto mb-4" />
                <p className="text-sm text-gray-400 font-medium">Carregando formulário...</p>
            </div>
        </div>
    );

    // --- ERROR ---
    if (view === 'error') return (
        <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center px-6">
            <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 max-w-sm w-full text-center">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-xl font-black text-gray-900 mb-2">Ops!</h2>
                <p className="text-sm text-gray-500">{errorMsg}</p>
            </div>
        </div>
    );

    // --- SUCCESS ---
    if (view === 'success') return (
        <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center px-6">
            <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 max-w-sm w-full text-center">
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-green-200">
                    <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <h2 className="text-2xl font-black text-gray-900 mb-2">Cadastro Enviado!</h2>
                <p className="text-sm text-gray-500 mb-6">
                    Seus dados foram enviados para <strong>{lenderName}</strong>. Você receberá um retorno em breve.
                </p>
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex items-center gap-3">
                    <Shield className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    <p className="text-xs text-blue-800 text-left">Seus dados estão protegidos e serão analisados apenas pelo credor responsável.</p>
                </div>
            </div>
        </div>
    );

    // --- FORM ---
    const renderStep = () => {
        switch (step) {
            case 1: return (
                <div className="space-y-4 animate-fadeIn">
                    <div><h2 className="text-2xl font-black text-gray-900 leading-tight">Qual seu nome completo?</h2>
                    <p className="text-gray-500 text-sm mt-1">Use o nome conforme consta no documento.</p></div>
                    <input autoFocus value={name} onChange={e => setName(e.target.value)}
                        className="w-full bg-transparent border-b-2 border-gray-200 py-4 text-2xl font-bold text-gray-900 focus:outline-none focus:border-black transition-colors" placeholder="Nome Completo" />
                </div>
            );
            case 2: return (
                <div className="space-y-4 animate-fadeIn">
                    <div><h2 className="text-2xl font-black text-gray-900 leading-tight">Seu CPF</h2>
                    <p className="text-gray-500 text-sm mt-1">Necessário para identificação.</p></div>
                    <input autoFocus value={cpf} onChange={e => setCpf(maskCPF(e.target.value))} maxLength={14}
                        className="w-full bg-transparent border-b-2 border-gray-200 py-4 text-3xl font-bold text-gray-900 focus:outline-none focus:border-black transition-colors tracking-widest" placeholder="000.000.000-00" />
                </div>
            );
            case 3: return (
                <div className="space-y-4 animate-fadeIn">
                    <div><h2 className="text-2xl font-black text-gray-900 leading-tight">Telefone com WhatsApp</h2>
                    <p className="text-gray-500 text-sm mt-1">Para que o credor entre em contato.</p></div>
                    <input autoFocus value={phone} onChange={e => setPhone(maskPhone(e.target.value))} maxLength={15}
                        className="w-full bg-transparent border-b-2 border-gray-200 py-4 text-3xl font-bold text-gray-900 focus:outline-none focus:border-black transition-colors tracking-wider" placeholder="(00) 00000-0000" />
                </div>
            );
            case 4: return (
                <div className="space-y-4 animate-fadeIn">
                    <div><h2 className="text-2xl font-black text-gray-900 leading-tight">Data de nascimento</h2>
                    <p className="text-gray-500 text-sm mt-1">Opcional, mas ajuda na identificação.</p></div>
                    <input autoFocus value={birthdate} onChange={e => setBirthdate(maskDate(e.target.value))} maxLength={10}
                        className="w-full bg-transparent border-b-2 border-gray-200 py-4 text-3xl font-bold text-gray-900 focus:outline-none focus:border-black transition-colors tracking-widest" placeholder="DD/MM/AAAA" />
                    <div className="space-y-3 pt-4">
                        <div><span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">E-mail (opcional)</span>
                        <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                            className="w-full bg-transparent border-b border-gray-100 py-2 text-lg font-bold text-gray-900 focus:outline-none focus:border-black transition-colors" placeholder="exemplo@email.com" /></div>
                    </div>
                </div>
            );
            case 5: return (
                <div className="space-y-4 animate-fadeIn">
                    <div><h2 className="text-2xl font-black text-gray-900 leading-tight">Onde você mora?</h2>
                    <p className="text-gray-500 text-sm mt-1">Informe seu CEP para preenchermos automaticamente.</p></div>
                    <div className="relative">
                        <input autoFocus value={cep} onChange={e => handleCepChange(e.target.value)} maxLength={9}
                            className="w-full bg-transparent border-b-2 border-gray-200 py-4 text-3xl font-bold text-gray-900 focus:outline-none focus:border-black transition-colors tracking-widest" placeholder="00000-000" />
                        {loadingCep && <Loader2 className="absolute right-0 top-6 w-6 h-6 animate-spin text-gray-400" />}
                    </div>
                    {(city || address) && (
                        <div className="space-y-3 pt-2 animate-slideIn">
                            <div className="grid grid-cols-4 gap-3">
                                <div className="col-span-3 border-b border-gray-100 pb-1">
                                    <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Rua</span>
                                    <input value={address} onChange={e => setAddress(e.target.value)} className="w-full bg-transparent text-lg font-bold text-gray-900 focus:outline-none" placeholder="Rua" />
                                </div>
                                <div className="col-span-1 border-b border-gray-100 pb-1">
                                    <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nº</span>
                                    <input value={number} onChange={e => setNumber(e.target.value)} className="w-full bg-transparent text-lg font-bold text-gray-900 focus:outline-none" placeholder="S/N" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="border-b border-gray-100 pb-1">
                                    <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Cidade</span>
                                    <input value={city} onChange={e => setCity(e.target.value)} className="w-full bg-transparent text-lg font-bold text-gray-900 focus:outline-none" />
                                </div>
                                <div className="border-b border-gray-100 pb-1">
                                    <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">UF</span>
                                    <input value={state} onChange={e => setState(e.target.value)} maxLength={2} className="w-full bg-transparent text-lg font-bold text-gray-900 focus:outline-none uppercase" />
                                </div>
                            </div>
                            <div className="border-b border-gray-100 pb-1">
                                <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Complemento (opcional)</span>
                                <input value={complement} onChange={e => setComplement(e.target.value)} className="w-full bg-transparent text-lg font-bold text-gray-900 focus:outline-none" placeholder="Apto, Bloco..." />
                            </div>
                        </div>
                    )}
                </div>
            );
            case 6: return (
                <div className="space-y-6 animate-fadeIn text-center">
                    <div><h2 className="text-2xl font-black text-gray-900 leading-tight">Sua Foto</h2>
                    <p className="text-gray-500 text-sm mt-1">Opcional. Tire uma selfie ou selecione da galeria.</p></div>
                    <div className="mx-auto w-48 h-48 rounded-[40px] border-2 border-dashed border-gray-300 flex flex-col items-center justify-center overflow-hidden cursor-pointer bg-gray-50 hover:border-gray-900 transition-all"
                        onClick={() => photoRef.current?.click()}>
                        {photoPreview ? <img src={photoPreview} alt="" className="w-full h-full object-cover" /> :
                            <><Camera className="w-12 h-12 text-gray-300 mb-2" /><span className="text-xs font-bold text-gray-400">ADD FOTO</span></>}
                    </div>
                    {photoPreview && <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="text-xs text-red-500 font-bold">Remover foto</button>}
                    <input ref={photoRef} type="file" className="hidden" accept="image/*" onChange={handlePhotoSelect} />
                </div>
            );
            case 7: return (
                <div className="space-y-6 animate-fadeIn">
                    <div><h2 className="text-2xl font-black text-gray-900 leading-tight">Documentos</h2>
                    <p className="text-gray-500 text-sm mt-1">Anexe fotos do RG, CNH ou comprovante de residência.</p></div>
                    <div className="w-full h-32 rounded-3xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer bg-gray-50 hover:border-gray-900 transition-all"
                        onClick={() => docsRef.current?.click()}>
                        <Upload className="w-8 h-8 text-gray-300 mb-1" /><span className="text-xs font-bold text-gray-400">CLIQUE PARA ENVIAR</span>
                    </div>
                    <input ref={docsRef} type="file" className="hidden" accept="image/*,application/pdf" multiple onChange={handleDocsSelect} />
                    <div className="grid grid-cols-3 gap-3">
                        {docPreviews.map((p, i) => (
                            <div key={i} className="relative aspect-square rounded-2xl overflow-hidden shadow-sm group">
                                <img src={p} className="w-full h-full object-cover" />
                                <button onClick={() => { setDocFiles(f => f.filter((_, j) => j !== i)); setDocPreviews(f => f.filter((_, j) => j !== i)); }}
                                    className="absolute top-1 right-1 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                            </div>
                        ))}
                    </div>
                </div>
            );
            case 8: return (
                <div className="space-y-5 animate-fadeIn pb-10">
                    <div><h2 className="text-2xl font-black text-gray-900 leading-tight">Revise seus dados</h2>
                    <p className="text-gray-500 text-sm mt-1">Confira se está tudo correto antes de enviar.</p></div>
                    <div className="space-y-3">
                        <button onClick={() => setStep(1)} className="w-full text-left p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all group">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Identificação</span>
                                <span className="text-[10px] font-bold text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity">EDITAR</span>
                            </div>
                            <p className="font-bold text-gray-900 text-lg">{name}</p>
                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <div><p className="text-[9px] text-gray-400 uppercase font-bold">CPF</p><p className="text-sm font-bold text-gray-700">{cpf}</p></div>
                                <div><p className="text-[9px] text-gray-400 uppercase font-bold">Nascimento</p><p className="text-sm font-bold text-gray-700">{birthdate || '-'}</p></div>
                            </div>
                        </button>
                        <button onClick={() => setStep(3)} className="w-full text-left p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all group">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Contato</span>
                                <span className="text-[10px] font-bold text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity">EDITAR</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><p className="text-[9px] text-gray-400 uppercase font-bold">Telefone</p><p className="text-sm font-bold text-gray-700">{phone}</p></div>
                                <div><p className="text-[9px] text-gray-400 uppercase font-bold">E-mail</p><p className="text-sm font-bold text-gray-700 truncate">{email || '-'}</p></div>
                            </div>
                        </button>
                        {(address || city) && (
                            <button onClick={() => setStep(5)} className="w-full text-left p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all group">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Endereço</span>
                                    <span className="text-[10px] font-bold text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity">EDITAR</span>
                                </div>
                                <p className="font-bold text-gray-900">{address}{number ? `, ${number}` : ''}</p>
                                <p className="text-sm text-gray-500">{city}{state ? ` - ${state}` : ''} • {cep}</p>
                            </button>
                        )}
                        {(photoPreview || docPreviews.length > 0) && (
                            <button onClick={() => setStep(6)} className="w-full text-left p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all group">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mídia</span>
                                    <span className="text-[10px] font-bold text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity">EDITAR</span>
                                </div>
                                <div className="flex gap-2">
                                    {photoPreview && <img src={photoPreview} className="w-14 h-14 rounded-xl object-cover ring-2 ring-white" />}
                                    {docPreviews.map((p, i) => <img key={i} src={p} className="w-14 h-14 rounded-xl object-cover opacity-60" />)}
                                </div>
                            </button>
                        )}
                    </div>
                </div>
            );
            default: return null;
        }
    };

    return (
        <div className="flex flex-col h-full min-h-screen bg-white">
            {/* Header */}
            <header className="px-6 pt-8 pb-4">
                <div className="flex items-center gap-4 mb-4">
                    {step > 1 && (
                        <button onClick={() => { setFormError(null); setStep(s => s - 1); }} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-900 active:scale-95 transition-transform shrink-0">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}
                    {step === 1 && <div className="w-10 h-10" />}
                    <div className="flex-1 flex gap-1.5 h-1.5">
                        {Array.from({ length: totalSteps }).map((_, i) => (
                            <div key={i} className={`flex-1 h-full rounded-full transition-all duration-300 ${i + 1 <= step ? 'bg-gray-900' : 'bg-gray-200'}`} />
                        ))}
                    </div>
                    <div className="w-10 h-10" />
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Pré-cadastro • {lenderName}</p>
            </header>

            {/* Content */}
            <main className="flex-1 px-8 pt-6 pb-20 overflow-y-auto no-scrollbar">
                {formError && (
                    <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-center gap-3 animate-shake">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" /><span className="text-sm font-bold">{formError}</span>
                    </div>
                )}
                {renderStep()}
            </main>

            {/* Footer */}
            <footer className="p-6 pb-10 bg-white border-t border-gray-100">
                {step === totalSteps ? (
                    <button onClick={handleSubmit} disabled={saving}
                        className="w-full h-16 bg-gray-900 text-white rounded-2xl font-bold text-lg shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                        {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <><User className="w-5 h-5" />Enviar Pré-Cadastro</>}
                    </button>
                ) : (
                    <button onClick={nextStep}
                        className="w-full h-16 bg-gray-900 text-white rounded-3xl font-bold text-lg shadow-xl shadow-black/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                        {step === 7 ? 'Revisar Cadastro' : 'Próximo'}<ArrowLeft className="w-5 h-5 rotate-180" />
                    </button>
                )}
            </footer>
        </div>
    );
};
