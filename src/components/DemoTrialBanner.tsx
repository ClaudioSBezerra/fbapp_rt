import { AlertCircle, Clock, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface DemoTrialBannerProps {
  daysRemaining: number;
  trialExpired: boolean;
}

export function DemoTrialBanner({ daysRemaining, trialExpired }: DemoTrialBannerProps) {
  const totalDays = 14;
  const daysUsed = totalDays - daysRemaining;
  const progressPercent = Math.min((daysUsed / totalDays) * 100, 100);

  if (trialExpired) {
    return (
      <Alert className="mb-4 border-destructive/50 bg-destructive/10">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <AlertDescription className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="text-xs">
              PERÍODO EXPIRADO
            </Badge>
            <span className="text-sm text-destructive">
              Seu período de simulação gratuita terminou. Entre em contato para continuar usando.
            </span>
          </div>
          <Button size="sm" variant="destructive" asChild>
            <a href="mailto:contato@fortesbezerra.com.br">Contratar Plano</a>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const isEnding = daysRemaining <= 3;

  return (
    <Alert className={`mb-4 ${isEnding ? 'border-warning/50 bg-warning/10' : 'border-primary/30 bg-primary/5'}`}>
      <Sparkles className={`h-4 w-4 ${isEnding ? 'text-warning' : 'text-primary'}`} />
      <AlertDescription>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <Badge 
              variant="secondary" 
              className={`text-xs shrink-0 ${isEnding ? 'bg-warning/20 text-warning' : 'bg-primary/20 text-primary'}`}
            >
              SIMULAÇÃO
            </Badge>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                <strong className={isEnding ? 'text-warning' : 'text-foreground'}>
                  {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'}
                </strong>
                {' '}restantes no período de teste
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 flex-1 max-w-[200px]">
              <Progress value={progressPercent} className="h-1.5" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {daysUsed}/{totalDays}
              </span>
            </div>
          </div>
          <Button size="sm" variant={isEnding ? 'default' : 'outline'} asChild className="shrink-0">
            <a href="mailto:contato@fortesbezerra.com.br">Contratar Plano</a>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
