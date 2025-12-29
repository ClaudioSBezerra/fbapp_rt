import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Mercadorias from "./pages/Mercadorias";
import Aliquotas from "./pages/Aliquotas";
import Empresas from "./pages/Empresas";
import Configuracoes from "./pages/Configuracoes";
import EnergiaAgua from "./pages/EnergiaAgua";
import Fretes from "./pages/Fretes";
import ImportarEFD from "./pages/ImportarEFD";
import NotFound from "./pages/NotFound";
import AppLayout from "./components/AppLayout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<AppLayout />}>
              <Route path="/configuracoes" element={<Configuracoes />} />
              <Route path="/empresas" element={<Empresas />} />
              <Route path="/aliquotas" element={<Aliquotas />} />
              <Route path="/mercadorias" element={<Mercadorias />} />
              <Route path="/energia-agua" element={<EnergiaAgua />} />
              <Route path="/fretes" element={<Fretes />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/importar-efd" element={<ImportarEFD />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
