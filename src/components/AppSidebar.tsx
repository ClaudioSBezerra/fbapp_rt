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
  { title: 'Configurações', url: '/configuracoes', icon: Settings, adminOnly: true },
  { title: 'Empresas', url: '/empresas', icon: Building2, adminOnly: true },
  { title: 'Alíquotas', url: '/aliquotas', icon: Calculator },
  { title: 'Mercadorias', url: '/mercadorias', icon: Package },
  { title: 'Por Participante', url: '/mercadorias-participante', icon: Users },
  { title: 'Serviços', url: '/servicos', icon: FileText },
  { title: 'Energia e Água', url: '/energia-agua', icon: Zap },
  { title: 'Fretes', url: '/fretes', icon: Truck },
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Importar EFD Contribuições', url: '/importar-efd', icon: Upload },
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
          <div className="mb-3 px-2 space-y-1">
            {/* Informações da sessão */}
            <div className="text-xs space-y-0.5">
              {/* Ambiente e Grupo na mesma linha */}
              {(tenantNome || grupoNome) && (
                <p className="text-sidebar-foreground/80">
                  {tenantNome}
                  {tenantNome && grupoNome && ' | '}
                  {grupoNome}
                </p>
              )}
              
              {/* Empresa em itálico e negrito */}
              {empresas.length > 0 && (
                <p className="font-semibold italic text-sidebar-foreground truncate">
                  {isAdmin 
                    ? `Todas (${empresas.length})` 
                    : empresas.map(e => e.nome).join(', ')}
                </p>
              )}
            </div>
            
            {/* Separador */}
            <div className="border-t border-sidebar-border/50 my-2" />
            
            {/* Email do usuário */}
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {user.email}
            </p>
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
