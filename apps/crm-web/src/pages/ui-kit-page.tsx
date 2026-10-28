import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { type ReactNode, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { notifyError, notifySuccess } from "@/lib/notify";

const BUTTON_VARIANTS = ["default", "secondary", "outline", "ghost"] as const;

const COLOR_TOKENS = [
  { name: "accent", label: "Accent", value: "var(--accent)" },
  { name: "success", label: "Success", value: "var(--success)" },
  { name: "warning", label: "Warning", value: "var(--warning)" },
  { name: "danger", label: "Danger", value: "var(--danger)" },
  { name: "success-soft", label: "Success soft", value: "var(--success-soft)" },
  { name: "warning-soft", label: "Warning soft", value: "var(--warning-soft)" },
  { name: "danger-soft", label: "Danger soft", value: "var(--danger-soft)" },
  { name: "surface-panel", label: "Panel", value: "var(--surface-panel)" },
];

const TYPOGRAPHY_SAMPLES = [
  {
    className: "text-[1.8rem] font-semibold leading-[1] tracking-[-0.04em]",
    label: "Heading 1 · 1.8rem",
  },
  { className: "text-2xl font-semibold tracking-[-0.03em]", label: "Heading 2 · 1.5rem" },
  { className: "text-base font-semibold", label: "Heading 3 · 1rem" },
  {
    className: "text-sm text-[var(--foreground-muted)]",
    label: "Body copy — used for descriptions, table cells and helper text across the template.",
  },
  {
    className:
      "text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]",
    label: "Eyebrow label",
  },
];

const ALERT_SAMPLES = [
  {
    variant: "default" as const,
    icon: Info,
    title: "Heads up",
    description: "Neutral announcements use the panel surface and muted icon color.",
  },
  {
    variant: "success" as const,
    icon: CheckCircle2,
    title: "Payment succeeded",
    description: "Positive confirmations use the success soft background.",
  },
  {
    variant: "warning" as const,
    icon: AlertTriangle,
    title: "Seats almost used",
    description: "Warnings use the warning soft background — 22 of 25 seats taken.",
  },
  {
    variant: "danger" as const,
    icon: XCircle,
    title: "Integration disconnected",
    description: "Destructive facts use the danger soft background.",
  },
];

const SectionAnchorCard = ({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <div id={id} className="scroll-mt-40">
    <SectionCard title={title} description={description}>
      {children}
    </SectionCard>
  </div>
);

export const UiKitPage = () => {
  const [digest, setDigest] = useState(true);
  const [name, setName] = useState("Northstar");
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="UI Elements"
        title="UI Kit"
        description="The complete design system shipped with the template — every primitive, token and state, live."
      />

      <Tabs defaultValue="foundations" className="gap-6">
        <div className="sticky top-24 z-[5] -mx-1 bg-[var(--background)] px-1 pb-2 pt-1">
          <TabsList aria-label="UI kit sections">
            <TabsTrigger value="foundations">Foundations</TabsTrigger>
            <TabsTrigger value="components">Components</TabsTrigger>
            <TabsTrigger value="forms">Forms</TabsTrigger>
            <TabsTrigger value="overlays">Overlays</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="foundations" className="space-y-6">
          <SectionAnchorCard
            id="colors"
            title="Color tokens"
            description="Semantic CSS variables — every palette re-maps them, so components never hardcode hex values."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {COLOR_TOKENS.map((token) => (
                <div
                  key={token.name}
                  className="overflow-hidden rounded-[0.8rem] border border-[var(--border)]"
                >
                  <div className="h-14 w-full" style={{ backgroundColor: token.value }} />
                  <div className="border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                    <p className="text-xs font-medium text-[var(--foreground)]">{token.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">
                      --{token.name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </SectionAnchorCard>

          <SectionAnchorCard
            id="typography"
            title="Typography"
            description="The type scale used across every page."
          >
            <div className="space-y-4">
              {TYPOGRAPHY_SAMPLES.map((sample) => (
                <p key={sample.label} className={sample.className}>
                  {sample.label}
                </p>
              ))}
            </div>
          </SectionAnchorCard>
        </TabsContent>

        <TabsContent value="components" className="space-y-6">
          <SectionAnchorCard
            id="buttons"
            title="Buttons"
            description="Variants fire a toast so nothing on this page is decorative."
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                {BUTTON_VARIANTS.map((variant) => (
                  <Button
                    key={variant}
                    variant={variant}
                    onClick={() => notifySuccess(`${variant} button clicked`)}
                  >
                    {variant}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
                <Button size="sm">Small</Button>
                <Button size="lg">Large</Button>
                <Button variant="outline" size="icon" aria-label="Icon button">
                  ★
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" disabled>
                      Disabled
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Disabled buttons keep their layout space.</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </SectionAnchorCard>

          <SectionAnchorCard
            id="badges"
            title="Badges"
            description="Status colors mirror the semantic tokens."
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">Default</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
            </div>
          </SectionAnchorCard>

          <SectionAnchorCard
            id="alerts"
            title="Alerts"
            description="Inline callouts for states that must be visible without a toast."
          >
            <div className="space-y-3">
              {ALERT_SAMPLES.map((sample) => (
                <Alert key={sample.variant} variant={sample.variant}>
                  <sample.icon aria-hidden="true" />
                  <AlertTitle>{sample.title}</AlertTitle>
                  <AlertDescription>{sample.description}</AlertDescription>
                </Alert>
              ))}
            </div>
          </SectionAnchorCard>
        </TabsContent>

        <TabsContent value="forms" className="space-y-6">
          <SectionAnchorCard
            id="form-controls"
            title="Form controls"
            description="Controlled input and switch wired to local state."
          >
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ui-kit-company">Company name</Label>
                <Input
                  id="ui-kit-company"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Company name"
                />
                <p className="text-xs text-[var(--muted-foreground)]" aria-live="polite">
                  {name.length} characters
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface-panel)] p-4">
                <div className="space-y-1">
                  <Label htmlFor="ui-kit-digest">Weekly digest</Label>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Toggle reflects instantly.
                  </p>
                </div>
                <Switch
                  id="ui-kit-digest"
                  checked={digest}
                  onCheckedChange={setDigest}
                  aria-label="Weekly digest"
                />
              </div>
            </div>
          </SectionAnchorCard>
        </TabsContent>

        <TabsContent value="overlays" className="space-y-6">
          <SectionAnchorCard
            id="overlays"
            title="Dialog, dropdown and tooltip"
            description="Radix overlays styled with the template tokens."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">Open dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogTitle>Example dialog</DialogTitle>
                  <DialogDescription>
                    Radix dialog styled with the template tokens. Press Escape or close to dismiss.
                  </DialogDescription>
                  <div className="flex justify-end">
                    <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">Open dropdown</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => notifySuccess("First action")}>
                    First action
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => notifySuccess("Second action")}>
                    Second action
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">Hover for tooltip</Button>
                </TooltipTrigger>
                <TooltipContent>Tooltips are keyboard-accessible via focus too.</TooltipContent>
              </Tooltip>
            </div>
          </SectionAnchorCard>
        </TabsContent>

        <TabsContent value="feedback" className="space-y-6">
          <SectionAnchorCard
            id="toasts"
            title="Toasts"
            description="Sonner toasts for async results — success and error variants."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => notifySuccess("Changes saved")}>Success toast</Button>
              <Button variant="outline" onClick={() => notifyError("Could not save changes")}>
                Error toast
              </Button>
            </div>
          </SectionAnchorCard>

          <SectionAnchorCard
            id="skeletons"
            title="Skeletons"
            description="Layout-stable loading placeholders used on every module page."
          >
            <div className="flex flex-wrap items-center gap-4">
              <Skeleton className="h-10 w-40 rounded-lg" />
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-72" />
              </div>
            </div>
          </SectionAnchorCard>
        </TabsContent>
      </Tabs>
    </div>
  );
};
