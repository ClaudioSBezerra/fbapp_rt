import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, FileText, ArrowRight, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface ImportCounts {
  mercadorias: number;
  energia_agua: number;
  fretes: number;
}

interface ImportResult {
  success: boolean;
  counts: ImportCounts;
  totalRecords: number;
  filialCreated: boolean;
  cnpj: string;
  razaoSocial: string;
  message: string;
}

interface Empresa {
  id: string;
  nome: string;
  grupo_id: string;
}

function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImportarEFD() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const loadEmpresas = async () => {
      const { data: empresasData } = await supabase
        .from('empresas')
        .select('id, nome, grupo_id');
      if (empresasData) {
        setEmpresas(empresasData);
        if (empresasData.length > 0) {
          setSelectedEmpresa(empresasData[0].id);
        }
      }
    };
    loadEmpresas();
  }, []);

  const handleImportEFD = async () => {
    if (!selectedFile || !selectedEmpresa || !session) return;

    setImporting(true);
    setImportResult(null);
    setImportError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('empresa_id', selectedEmpresa);

      const response = await supabase.functions.invoke('parse-efd', {
        body: formData,
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao importar arquivo');
      }

      const data = response.data;
      if (data.error) {
        throw new Error(data.error);
      }

      // Map old format to new format for backwards compatibility
      const result: ImportResult = {
        success: data.success,
        counts: data.counts || { mercadorias: data.count || 0, energia_agua: 0, fretes: 0 },
        totalRecords: data.totalRecords ?? data.count ?? 0,
        filialCreated: data.filialCreated,
        cnpj: data.cnpj,
        razaoSocial: data.razaoSocial,
        message: data.message,
      };

      setImportResult(result);
      setSelectedFile(null);
      toast.success('Arquivo EFD importado com sucesso!');
    } catch (error) {
      console.error('Error importing EFD:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao importar arquivo EFD';
      setImportError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.txt')) {
      toast.error('Por favor, selecione um arquivo .txt');
      return;
    }
    setSelectedFile(file);
    setImportError(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleNewImport = () => {
    setImportResult(null);
    setImportError(null);
    setSelectedFile(null);
  };

  const handleGoToConfig = () => {
    navigate('/configuracoes');
  };

  if (importResult) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-6 px-6">
            <div className="text-center space-y-6">
              <div className="mx-auto w-16 h-16 rounded-full bg-positive/10 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-positive" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-foreground">Importação Concluída</h2>
                <p className="text-sm text-muted-foreground">{importResult.message}</p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">CNPJ</span>
                  <span className="font-medium text-foreground">{formatCNPJ(importResult.cnpj)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Razão Social</span>
                  <span className="font-medium text-foreground truncate max-w-[200px]">{importResult.razaoSocial}</span>
                </div>
                <div className="border-t border-border pt-2 mt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Mercadorias</span>
                    <span className="font-medium text-foreground">{importResult.counts.mercadorias}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Energia/Água</span>
                    <span className="font-medium text-foreground">{importResult.counts.energia_agua}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fretes</span>
                    <span className="font-medium text-foreground">{importResult.counts.fretes}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold border-t border-border pt-1 mt-1">
                    <span className="text-foreground">Total</span>
                    <span className="text-foreground">{importResult.totalRecords}</span>
                  </div>
                </div>
                {importResult.filialCreated && (
                  <div className="pt-2">
                    <Badge variant="secondary" className="w-full justify-center">Nova filial criada</Badge>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button onClick={handleGoToConfig} className="w-full">
                  Ir para Configurações
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="ghost" onClick={handleNewImport} className="w-full">
                  Importar outro arquivo
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-6 px-6">
          <div className="text-center space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-foreground">Importar EFD</h1>
              <p className="text-sm text-muted-foreground">
                Importe arquivos EFD Contribuições para cadastrar mercadorias, energia/água e fretes
              </p>
            </div>

            {importError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2 text-left">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{importError}</p>
              </div>
            )}

            <div className="space-y-2 text-left">
              <Label htmlFor="empresa">Empresa Destino</Label>
              <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa} disabled={importing}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((empresa) => (
                    <SelectItem key={empresa.id} value={empresa.id}>
                      {empresa.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div
              className={`
                relative border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer
                ${isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}
                ${importing ? 'pointer-events-none opacity-60' : ''}
                ${!selectedEmpresa ? 'pointer-events-none opacity-40' : ''}
              `}
              onClick={() => !selectedFile && fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                onChange={handleFileChange}
                className="hidden"
                disabled={importing || !selectedEmpresa}
              />
              
              <div className="flex flex-col items-center gap-3">
                {importing ? (
                  <>
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">Importando arquivo...</p>
                      <p className="text-xs text-muted-foreground">Aguarde enquanto processamos os dados</p>
                    </div>
                  </>
                ) : selectedFile ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    >
                      Remover
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        Arraste o arquivo ou clique para selecionar
                      </p>
                      <p className="text-xs text-muted-foreground">Aceita arquivos .txt (EFD Contribuições)</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {selectedFile && !importing && (
              <Button 
                onClick={handleImportEFD} 
                className="w-full"
                disabled={!selectedEmpresa}
              >
                Importar Arquivo
              </Button>
            )}

            <p className="text-xs text-muted-foreground">
              A filial será identificada automaticamente pelo CNPJ no arquivo
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}