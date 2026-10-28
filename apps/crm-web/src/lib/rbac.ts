import type { AppRole } from "@/types";

export const canAccess = (role: AppRole | undefined, allowed?: readonly AppRole[]): boolean =>
  !allowed || allowed.length === 0 || (role !== undefined && allowed.includes(role));
