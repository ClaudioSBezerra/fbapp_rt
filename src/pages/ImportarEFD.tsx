import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, Upload, FileText, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface ImportResult {
  success: boolean;
  count: number;
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

export default function ImportarEFD() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
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

  const handleImportEFD = async (file: File) => {
    if (!file || !selectedEmpresa || !session) return;

    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
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

      setImportResult(data);
      toast.success('Arquivo EFD importado com sucesso!');
    } catch (error) {
      console.error('Error importing EFD:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao importar arquivo EFD');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleImportEFD(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.txt')) {
      handleImportEFD(file);
    } else {
      toast.error('Por favor, selecione um arquivo .txt');
    }
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
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Registros</span>
                  <span className="font-medium text-foreground">{importResult.count} mercadorias</span>
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
                Importe arquivos EFD Contribuições para cadastrar mercadorias automaticamente
              </p>
            </div>

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
              onClick={() => fileInputRef.current?.click()}
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

            <p className="text-xs text-muted-foreground">
              A filial será identificada automaticamente pelo CNPJ no arquivo
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
