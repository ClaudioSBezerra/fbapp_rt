import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Upload, AlertCircle, FileText, CheckCircle } from 'lucide-react';

export function SimplesNacionalImport() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ total: number; success: number; errors: number } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const processFile = async () => {
    if (!file) return;

    setLoading(true);
    setResult(null);

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      
      // Obter tenant_id do usuário atual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: userTenants } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!userTenants) throw new Error('Tenant não encontrado para o usuário');

      const tenantId = userTenants.tenant_id;
      const batchSize = 100;
      let successCount = 0;
      let errorCount = 0;
      let batch = [];

      // Processar linhas
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Tentar detectar separador (; ou ,)
        const separator = line.includes(';') ? ';' : ',';
        const parts = line.split(separator);

        // Ignorar cabeçalho se parecer ser um
        if (i === 0 && (parts[0].toLowerCase().includes('cnpj') || parts[0].toLowerCase().includes('simples'))) {
          continue;
        }

        if (parts.length >= 2) {
          const cnpj = parts[0].replace(/\D/g, ''); // Remover não-números
          const simplesStr = parts[1].toLowerCase().trim();
          
          // Lógica para identificar Sim/Não/S/N/True/False
          const isSimples = ['sim', 's', 'true', '1', 'yes', 'y'].includes(simplesStr);

          if (cnpj.length === 14) {
            batch.push({
              tenant_id: tenantId,
              cnpj: cnpj,
              is_simples: isSimples
            });
          } else {
            errorCount++; // CNPJ inválido
          }
        } else {
          errorCount++; // Formato inválido
        }

        // Enviar lote
        if (batch.length >= batchSize) {
          const { error } = await supabase
            .from('simples_nacional')
            .upsert(batch, { onConflict: 'tenant_id,cnpj' });
          
          if (error) {
            console.error('Erro ao inserir lote:', error);
            errorCount += batch.length;
          } else {
            successCount += batch.length;
          }
          batch = [];
        }
      }

      // Enviar restante
      if (batch.length > 0) {
        const { error } = await supabase
          .from('simples_nacional')
          .upsert(batch, { onConflict: 'tenant_id,cnpj' });
        
        if (error) {
          console.error('Erro ao inserir lote final:', error);
          errorCount += batch.length;
        } else {
          successCount += batch.length;
        }
      }

      setResult({ total: successCount + errorCount, success: successCount, errors: errorCount });
      toast.success(`Processamento concluído: ${successCount} importados, ${errorCount} erros.`);

    } catch (error: any) {
      console.error('Erro na importação:', error);
      toast.error('Erro ao processar arquivo: ' + error.message);
    } finally {
      setLoading(false);
      setFile(null); // Limpar arquivo após sucesso
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid w-full max-w-sm items-center gap-1.5">
        <Label htmlFor="csv-simples">Arquivo CSV (CNPJ; Simples)</Label>
        <Input 
          id="csv-simples" 
          type="file" 
          accept=".csv,.txt" 
          onChange={handleFileChange}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          Formato: CNPJ;Sim (S/N)
        </p>
      </div>

      {result && (
        <Alert variant={result.errors === 0 ? "default" : "destructive"}>
          {result.errors === 0 ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertTitle>Resultado</AlertTitle>
          <AlertDescription>
            Processados: {result.total}. Sucesso: {result.success}. Erros: {result.errors}.
          </AlertDescription>
        </Alert>
      )}

      <Button onClick={processFile} disabled={!file || loading} className="w-full">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? 'Processando...' : 'Importar'}
      </Button>
    </div>
  );
}
