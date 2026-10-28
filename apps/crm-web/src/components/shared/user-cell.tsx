import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { UserRecord } from "@/types";

export const UserCell = ({ user }: { user: UserRecord }) => (
  <div className="flex items-center gap-3">
    <Avatar className="h-10 w-10 border border-[var(--border)]">
      <AvatarImage src={user.avatarUrl} alt={user.name} />
      <AvatarFallback>{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
    <div>
      <p className="font-medium">{user.name}</p>
      <p className="text-sm text-[var(--muted-foreground)]">{user.email}</p>
    </div>
  </div>
);
