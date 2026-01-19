import { AlertTriangle, Clock, CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";

export function TrialBanner() {
  const navigate = useNavigate();
  const { isTrialing, isExpired, trialDaysLeft, isActive, canWrite, subscriptionStatus } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  // Don't show banner if:
  // - User is active subscriber
  // - Banner was dismissed (for non-critical messages)
  // - No subscription status yet
  if (isActive || !subscriptionStatus) {
    return null;
  }

  // Always show if expired (can't dismiss)
  if (isExpired) {
    return (
      <div className="bg-destructive/15 border-b border-destructive/25 px-4 py-3">
        <div className="container mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="text-sm">
              <span className="font-medium text-destructive">
                Seu período de testes expirou.
              </span>{" "}
              <span className="text-muted-foreground">
                O sistema está em modo somente leitura. Assine para continuar editando seus dados.
              </span>
            </div>
          </div>
          <Button 
            size="sm" 
            onClick={() => navigate("/planos")}
            className="shrink-0"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Ver Planos
          </Button>
        </div>
      </div>
    );
  }

  // If dismissed, don't show trial banner
  if (dismissed) {
    return null;
  }

  // Show trial banner
  if (isTrialing) {
    const isUrgent = trialDaysLeft <= 3;
    
    return (
      <div 
        className={cn(
          "border-b px-4 py-3",
          isUrgent 
            ? "bg-amber-500/15 border-amber-500/25" 
            : "bg-primary/10 border-primary/20"
        )}
      >
        <div className="container mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className={cn(
              "h-5 w-5",
              isUrgent ? "text-amber-600" : "text-primary"
            )} />
            <div className="text-sm">
              <span className={cn(
                "font-medium",
                isUrgent ? "text-amber-700" : "text-foreground"
              )}>
                {trialDaysLeft === 0 
                  ? "Último dia de trial!" 
                  : trialDaysLeft === 1 
                    ? "Resta 1 dia de trial" 
                    : `Restam ${trialDaysLeft} dias de trial`}
              </span>{" "}
              <span className="text-muted-foreground hidden sm:inline">
                {isUrgent 
                  ? "Assine agora para não perder acesso à edição." 
                  : "Aproveite todos os recursos do sistema."}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant={isUrgent ? "default" : "outline"}
              onClick={() => navigate("/planos")}
              className="shrink-0"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Ver Planos
            </Button>
            {!isUrgent && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDismissed(true)}
                className="shrink-0 px-2"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
