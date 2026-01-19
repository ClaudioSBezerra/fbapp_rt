import { useMemo } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Settings, 
  Calculator, 
  Building2,
  LogOut,
  Zap,
  Truck,
  Upload,
  FileText,
  Users
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useSessionInfo } from '@/hooks/useSessionInfo';
import { useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const allMenuItems: MenuItem[] = [
  { title: 'Configurações e Parâmetros Gerais', url: '/configuracoes', icon: Settings, adminOnly: true },
  { title: 'Empresas', url: '/empresas', icon: Building2, adminOnly: true },
  { title: 'Alíquotas', url: '/aliquotas', icon: Calculator },
  { title: 'Operação Comercial', url: '/mercadorias', icon: Package },
  { title: 'Por Participante', url: '/mercadorias-participante', icon: Users },
  { title: 'Serviços', url: '/servicos', icon: FileText },
  { title: 'Energia e Água', url: '/energia-agua', icon: Zap },
  { title: 'Fretes', url: '/fretes', icon: Truck },
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Importar EFD Contribuições', url: '/importar-efd', icon: Upload },
  { title: 'Importação de EFD ICMS/IPI', url: '/importar-efd-icms', icon: Upload },
  { title: 'Uso Consumo e Imobilizado', url: '/uso-consumo', icon: Package },
  { title: 'Dashboard Uso Consumo', url: '/dashboard-uso-consumo', icon: LayoutDashboard },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { isAdmin } = useRole();
  const { tenantNome, grupoNome, empresas } = useSessionInfo();

  const isActive = (path: string) => location.pathname === path;

  // Filter menu items based on user role
  const menuItems = useMemo(() => {
    return allMenuItems.filter(item => !item.adminOnly || isAdmin);
  }, [isAdmin]);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sidebar-primary rounded-lg shrink-0">
            <TrendingUp className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-sidebar-foreground truncate">
                Reforma Tributária
              </h2>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                Simulador IBS/CBS
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="flex items-center gap-3"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {!collapsed && user && (
          <div className="mb-2 space-y-2">
            {/* Card do Usuário */}
            <div className="bg-sidebar-accent/30 rounded-lg p-2 space-y-1">
              <p className="font-medium text-xs text-sidebar-foreground truncate">
                {user.user_metadata?.full_name || 'Usuário'}
              </p>
              <p className="text-[10px] text-sidebar-foreground/60 truncate">
                {user.email}
              </p>
              {isAdmin && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/20 text-primary">
                  Administrador
                </span>
              )}
            </div>
            
            {/* Grupo e Empresas */}
            {grupoNome && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] text-sidebar-foreground/80">
                  <Building2 className="h-3 w-3" />
                  <span className="font-medium">{grupoNome}</span>
                </div>
                
                {empresas.length > 0 && (
                  <div className="pl-4 space-y-0.5">
                    {isAdmin ? (
                      <p className="text-[10px] text-sidebar-foreground/60 italic">
                        Acesso a todas ({empresas.length} empresas)
                      </p>
                    ) : (
                      <>
                        {empresas.slice(0, 3).map((e) => (
                          <p key={e.id} className="text-[10px] text-sidebar-foreground/60 truncate">
                            • {e.nome}
                          </p>
                        ))}
                        {empresas.length > 3 && (
                          <p className="text-[10px] text-sidebar-foreground/50 italic">
                            +{empresas.length - 3} outras
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'default'}
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
