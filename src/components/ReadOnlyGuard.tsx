import { ReactNode } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "@/hooks/use-toast";

interface ReadOnlyGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  showToast?: boolean;
}

/**
 * Wrapper component that prevents write actions when subscription is expired.
 * Wrap buttons or interactive elements that modify data.
 */
export function ReadOnlyGuard({ 
  children, 
  fallback,
  showToast = true 
}: ReadOnlyGuardProps) {
  const { canWrite, isExpired, isLoading } = useSubscription();

  // While loading, show children normally
  if (isLoading) {
    return <>{children}</>;
  }

  // If can write, show children normally
  if (canWrite) {
    return <>{children}</>;
  }

  // If expired and fallback provided, show fallback
  if (fallback) {
    return <>{fallback}</>;
  }

  // Otherwise, wrap children with click handler that shows toast
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (showToast) {
      toast({
        title: "Modo somente leitura",
        description: "Seu período de testes expirou. Assine um plano para continuar editando.",
        variant: "destructive",
      });
    }
  };

  return (
    <div onClick={handleClick} className="cursor-not-allowed">
      <div className="pointer-events-none opacity-50">
        {children}
      </div>
    </div>
  );
}

/**
 * Hook to check if write actions are allowed
 */
export function useCanWrite() {
  const { canWrite, isExpired, isLoading } = useSubscription();
  
  const checkWrite = (action?: () => void) => {
    if (isLoading) return true;
    
    if (!canWrite) {
      toast({
        title: "Modo somente leitura",
        description: "Seu período de testes expirou. Assine um plano para continuar editando.",
        variant: "destructive",
      });
      return false;
    }
    
    if (action) {
      action();
    }
    return true;
  };

  return {
    canWrite: isLoading ? true : canWrite,
    isExpired,
    checkWrite,
  };
}
