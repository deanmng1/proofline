import { Badge } from "@/components/ui/badge";
import type { UserStatus } from "@/types";

const statusVariantMap: Record<UserStatus, "success" | "warning" | "outline"> = {
  Active: "success",
  Invited: "warning",
  Paused: "outline",
};

export const StatusBadge = ({ status }: { status: UserStatus }) => (
  <Badge variant={statusVariantMap[status]}>{status}</Badge>
);
