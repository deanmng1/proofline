import { LogOut, Palette } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { navLeafItems } from "@/components/layout/nav-items";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/auth-context";
import { useTheme } from "@/features/theme/theme-context";
import { canAccess } from "@/lib/rbac";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const CommandPalette = ({ open, onOpenChange }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const { themeId, themes, setThemeId } = useTheme();
  const { t } = useTranslation();

  const run = (action: () => void) => () => {
    action();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] translate-y-0 p-0">
        <DialogTitle className="sr-only">{t("common.search")}</DialogTitle>
        <DialogDescription className="sr-only">
          Search pages and actions, then press Enter to run one.
        </DialogDescription>
        <Command>
          <CommandInput placeholder={t("common.search")} autoFocus />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Pages">
              {navLeafItems
                .filter((item) => canAccess(session?.user.role, item.roles))
                .map((item) => (
                  <CommandItem
                    key={item.href}
                    value={`${t(item.title)}`}
                    onSelect={run(() => navigate(item.href))}
                  >
                    {t(item.title)}
                  </CommandItem>
                ))}
            </CommandGroup>
            <CommandGroup heading="Appearance">
              {themes.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={`Theme ${entry.label}`}
                  onSelect={run(() => setThemeId(entry.id))}
                >
                  <Palette className="h-4 w-4" aria-hidden="true" />
                  Switch to {entry.label}
                  {entry.id === themeId ? (
                    <span className="ml-auto text-xs text-[var(--muted-foreground)]">Active</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Account">
              <CommandItem value="Sign out" onSelect={run(() => void logout())}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t("common.logout")}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
