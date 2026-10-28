import { toast } from "sonner";

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "An unexpected error occurred.";

export const notifyError = (error: unknown) => {
  toast.error(getErrorMessage(error));
};

export const notifySuccess = (message: string) => {
  toast.success(message);
};
