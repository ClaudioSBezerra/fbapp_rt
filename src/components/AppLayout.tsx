import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDemoStatus } from '@/hooks/useDemoStatus';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export default function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { isDemo, daysRemaining, trialExpired, isLoading: demoLoading } = useDemoStatus();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-14 border-b border-border flex items-center px-4 bg-card">
            <SidebarTrigger />
            {isDemo && !demoLoading && (
              <div className="ml-auto flex items-center gap-2">
                <Badge 
                  variant={trialExpired ? 'destructive' : 'secondary'} 
                  className={`text-xs ${
                    !trialExpired && daysRemaining <= 3 
                      ? 'bg-warning/20 text-warning border-warning/30 hover:bg-warning/30' 
                      : ''
                  }`}
                >
                  {trialExpired 
                    ? 'Trial Expirado' 
                    : daysRemaining === 0 
                      ? 'Último dia de Trial!' 
                      : `Trial: ${daysRemaining} dia${daysRemaining > 1 ? 's' : ''}`}
                </Badge>
              </div>
            )}
          </header>
          <div className="flex-1 p-3 sm:p-4 md:p-6 overflow-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
