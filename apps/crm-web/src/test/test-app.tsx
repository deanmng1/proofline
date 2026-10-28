import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { AppRouter } from "@/app/router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/features/auth/auth-context";
import { I18nProvider } from "@/features/i18n";
import { TenantProvider } from "@/features/tenants/tenant-context";
import { ThemeProvider } from "@/features/theme/theme-context";

type RenderOptions = {
  initialEntries?: string[];
};

export const renderApp = ({ initialEntries = ["/login"] }: RenderOptions = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <I18nProvider>
            <ThemeProvider>
              <AuthProvider>
                <TenantProvider>
                  <AppRouter />
                  <Toaster />
                </TenantProvider>
              </AuthProvider>
            </ThemeProvider>
          </I18nProvider>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
};
