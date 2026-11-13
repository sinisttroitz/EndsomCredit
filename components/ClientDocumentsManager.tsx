import React, { useRef } from 'react';
import { Upload, X, FileText, ExternalLink, Image as ImageIcon } from 'lucide-react';

export interface PendingDocumentItem {
  id: string;
  file: File;
  previewUrl: string;
  isPdf: boolean;
  name: string;
}

interface ClientDocumentsManagerProps {
  existingDocuments: string[];
  pendingDocuments: PendingDocumentItem[];
  onRemoveExisting: (index: number) => void;
  onAddFiles: (files: FileList) => void;
  onRemovePending: (id: string) => void;
  compact?: boolean;
}

const isPdfUrl = (url: string): boolean => {
  const clean = url.split('?')[0].toLowerCase();
  return clean.endsWith('.pdf');
};

export const ClientDocumentsManager: React.FC<ClientDocumentsManagerProps> = ({
  existingDocuments,
  pendingDocuments,
  onRemoveExisting,
  onAddFiles,
  onRemovePending,
  compact = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const totalCount = existingDocuments.length + pendingDocuments.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold text-primary dark:text-white tracking-widest uppercase">
            Fotos e Documentos
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            RG, CNH, comprovante de residência ou fotos adicionais
          </p>
        </div>
        {totalCount > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-[11px] font-bold text-gray-600 dark:text-gray-300">
            {totalCount} {totalCount === 1 ? 'arquivo' : 'arquivos'}
          </span>
        )}
      </div>

      {/* Upload Dropzone / Button */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full py-5 px-4 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40 hover:border-gray-900 dark:hover:border-white hover:bg-gray-100/70 dark:hover:bg-gray-800/80 transition-all flex flex-col items-center justify-center gap-1.5 text-center group"
      >
        <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300 group-hover:scale-105 transition-transform">
          <Upload className="w-5 h-5" />
        </div>
        <span className="text-xs font-bold text-gray-700 dark:text-gray-200 mt-1">
          Adicionar fotos ou documentos
        </span>
        <span className="text-[11px] text-gray-400">
          Selecione uma ou várias imagens / PDFs
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onAddFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Gallery Grid */}
      {totalCount > 0 ? (
        <div className={`grid gap-3 ${compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {/* Existing saved documents */}
          {existingDocuments.map((docUrl, index) => {
            const pdf = isPdfUrl(docUrl);
            return (
              <div
                key={`existing-${index}-${docUrl}`}
                className="relative aspect-square rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 group"
              >
                <a
                  href={docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full h-full"
                  title="Abrir arquivo em nova aba"
                >
                  {pdf ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-gray-500 dark:text-gray-300">
                      <FileText className="w-7 h-7 mb-1 text-red-500" />
                      <span className="text-[10px] font-bold uppercase">PDF</span>
                    </div>
                  ) : (
                    <>
                      <img
                        src={docUrl}
                        alt={`Documento ${index + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <div className="hidden w-full h-full flex flex-col items-center justify-center p-2 text-gray-400">
                        <FileText className="w-7 h-7 mb-1" />
                        <span className="text-[10px] font-semibold">Arquivo</span>
                      </div>
                    </>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <ExternalLink className="w-4 h-4 text-white" />
                  </div>
                </a>

                <button
                  type="button"
                  onClick={() => onRemoveExisting(index)}
                  aria-label="Remover documento"
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-600/90 hover:bg-red-600 text-white flex items-center justify-center shadow-md transition-transform active:scale-95"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}

          {/* Newly staged documents */}
          {pendingDocuments.map((item) => (
            <div
              key={item.id}
              className="relative aspect-square rounded-2xl overflow-hidden border-2 border-emerald-500/70 bg-emerald-50/40 dark:bg-emerald-950/20 group"
            >
              {item.isPdf ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-gray-600 dark:text-gray-300">
                  <FileText className="w-7 h-7 mb-1 text-red-500" />
                  <span className="text-[10px] font-bold truncate w-full px-1">{item.name}</span>
                </div>
              ) : (
                <img
                  src={item.previewUrl}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              )}

              <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-black uppercase tracking-wider shadow">
                Novo
              </span>

              <button
                type="button"
                onClick={() => onRemovePending(item.id)}
                aria-label="Remover novo documento"
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-600/90 hover:bg-red-600 text-white flex items-center justify-center shadow-md transition-transform active:scale-95"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-gray-400">
          <ImageIcon className="w-4 h-4 opacity-50" />
          <span>Nenhum documento anexado ainda.</span>
        </div>
      )}
    </div>
  );
};

