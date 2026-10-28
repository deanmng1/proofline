import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth/auth-context";
import { canAccess } from "@/lib/rbac";
import type { AppRole } from "@/types";

export const RoleRoute = ({ roles, children }: { roles: AppRole[]; children: ReactNode }) => {
  const { session } = useAuth();

  if (session && !canAccess(session.user.role, roles)) {
    return <Navigate to="/app/overview" replace />;
  }

  return <>{children}</>;
};
