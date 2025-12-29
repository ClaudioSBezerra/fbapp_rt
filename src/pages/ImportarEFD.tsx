import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, Upload, FileText } from 'lucide-react';
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

  const handleImportEFD = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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
      
      // Redirect to Configurações after 2 seconds
      setTimeout(() => {
        navigate('/configuracoes');
      }, 2000);
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

  const handleNewImport = () => {
    setImportResult(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Importar EFD</h1>
        <p className="text-muted-foreground mt-1">
          Importe arquivos EFD Contribuições para cadastrar mercadorias automaticamente
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload de Arquivo
            </CardTitle>
            <CardDescription>
              Selecione a empresa destino e o arquivo TXT da EFD Contribuições. 
              A filial será criada automaticamente com base no CNPJ do arquivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
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
              <p className="text-xs text-muted-foreground">
                A filial será identificada pelo CNPJ no arquivo EFD.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="file">Arquivo EFD (TXT)</Label>
              <Input
                ref={fileInputRef}
                id="file"
                type="file"
                accept=".txt"
                onChange={handleImportEFD}
                disabled={importing || !selectedEmpresa}
              />
            </div>
            {importing && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Importando arquivo...</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Resultado da Importação
            </CardTitle>
            <CardDescription>
              Informações sobre o último arquivo importado
            </CardDescription>
          </CardHeader>
          <CardContent>
            {importResult ? (
              <div className="space-y-4">
                <div className={`p-4 rounded-lg ${importResult.filialCreated ? 'bg-positive/10 border border-positive/20' : 'bg-muted'}`}>
                  <div className="flex items-start gap-3">
                    <CheckCircle className={`h-5 w-5 mt-0.5 ${importResult.filialCreated ? 'text-positive' : 'text-primary'}`} />
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{importResult.message}</p>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p><strong>CNPJ:</strong> {formatCNPJ(importResult.cnpj)}</p>
                        <p><strong>Razão Social:</strong> {importResult.razaoSocial}</p>
                        <p><strong>Registros:</strong> {importResult.count} mercadorias importadas</p>
                        {importResult.filialCreated && (
                          <Badge variant="secondary" className="mt-2">Nova filial criada</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Redirecionando para Configurações...
                </p>
                <Button variant="outline" onClick={handleNewImport}>
                  Importar outro arquivo
                </Button>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nenhum arquivo importado ainda</p>
                <p className="text-xs mt-1">Selecione um arquivo TXT para começar</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
