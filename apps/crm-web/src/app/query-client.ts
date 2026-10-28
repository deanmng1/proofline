import { QueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/notify";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      onError: (error) => notifyError(error),
    },
  },
});
