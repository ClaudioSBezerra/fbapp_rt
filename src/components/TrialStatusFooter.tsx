import { Clock, Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface TrialStatusFooterProps {
  daysRemaining: number;
  trialExpired: boolean;
}

export function TrialStatusFooter({ daysRemaining, trialExpired }: TrialStatusFooterProps) {
  const totalDays = 14;
  const daysUsed = totalDays - daysRemaining;
  const progressPercent = Math.min((daysUsed / totalDays) * 100, 100);

  if (trialExpired) {
    return (
      <div className="px-2 py-3 rounded-lg bg-destructive/20 border border-destructive/30">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            EXPIRADO
          </Badge>
        </div>
        <p className="text-[10px] text-destructive">
          Período de teste encerrado
        </p>
      </div>
    );
  }

  const isEnding = daysRemaining <= 3;

  return (
    <div className={`px-2 py-3 rounded-lg ${
      isEnding 
        ? 'bg-warning/20 border border-warning/30' 
        : 'bg-sidebar-accent/50 border border-sidebar-border'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className={`h-3 w-3 ${isEnding ? 'text-warning' : 'text-sidebar-primary'}`} />
        <Badge 
          variant="secondary" 
          className={`text-[10px] px-1.5 py-0 ${
            isEnding 
              ? 'bg-warning/30 text-warning border-warning/50' 
              : 'bg-sidebar-primary/20 text-sidebar-primary'
          }`}
        >
          SIMULAÇÃO
        </Badge>
      </div>
      
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[11px] text-sidebar-foreground/80">
            <Clock className="h-3 w-3" />
            <span>
              <strong className={isEnding ? 'text-warning' : 'text-sidebar-foreground'}>
                {daysRemaining}
              </strong>
              {' '}{daysRemaining === 1 ? 'dia' : 'dias'} restantes
            </span>
          </div>
        </div>
        
        <Progress 
          value={progressPercent} 
          className={`h-1 ${isEnding ? '[&>div]:bg-warning' : ''}`}
        />
      </div>
    </div>
  );
}
