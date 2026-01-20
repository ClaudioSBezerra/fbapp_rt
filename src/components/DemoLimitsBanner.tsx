import { AlertTriangle, FileText, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface DemoLimitsBannerProps {
  type: 'contrib' | 'icms';
  current: number;
  max: number;
}

export function DemoLimitsBanner({ type, current, max }: DemoLimitsBannerProps) {
  const isAtLimit = current >= max;
  const typeLabel = type === 'contrib' ? 'EFD Contribuições' : 'EFD ICMS/IPI';

  if (isAtLimit) {
    return (
      <Alert className="mb-4 border-destructive/50 bg-destructive/10">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <AlertDescription className="flex items-center gap-2">
          <Badge variant="destructive" className="text-xs">LIMITE ATINGIDO</Badge>
          <span className="text-sm">
            Você já importou o máximo de <strong>{max}</strong> {typeLabel} permitido no período de simulação.
            Entre em contato para ampliar seus limites.
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="mb-4 border-info/30 bg-info/5">
      <Info className="h-4 w-4 text-info" />
      <AlertDescription className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs bg-info/20 text-info">
          <FileText className="h-3 w-3 mr-1" />
          SIMULAÇÃO
        </Badge>
        <span className="text-sm text-muted-foreground">
          Você pode importar até <strong className="text-foreground">{max}</strong> {typeLabel} por período.
          {' '}Já utilizou: <strong className="text-foreground">{current}/{max}</strong>
        </span>
      </AlertDescription>
    </Alert>
  );
}
