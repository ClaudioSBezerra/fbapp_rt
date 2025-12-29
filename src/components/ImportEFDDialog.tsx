import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle } from 'lucide-react';
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

interface ImportEFDDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function ImportEFDDialog({ open, onOpenChange, onSuccess }: ImportEFDDialogProps) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { session } = useAuth();

  const loadEmpresas = async () => {
    if (loaded) return;
    const { data: empresasData } = await supabase
      .from('empresas')
      .select('id, nome, grupo_id');
    if (empresasData) {
      setEmpresas(empresasData);
      if (empresasData.length > 0) {
        setSelectedEmpresa(empresasData[0].id);
      }
    }
    setLoaded(true);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      loadEmpresas();
      setImportResult(null);
    }
    onOpenChange(newOpen);
  };

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
      onSuccess?.();
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Arquivo EFD</DialogTitle>
          <DialogDescription>
            Selecione a empresa destino e o arquivo TXT da EFD Contribuições. 
            A filial será criada automaticamente com base no CNPJ do arquivo.
          </DialogDescription>
        </DialogHeader>
        
        {importResult ? (
          <div className="space-y-4 py-4">
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
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="empresa">Empresa Destino</Label>
                <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa}>
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={importing}>
                Cancelar
              </Button>
              {importing && (
                <Button disabled>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
