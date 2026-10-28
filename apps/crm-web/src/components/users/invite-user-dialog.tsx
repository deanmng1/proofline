import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const inviteSchema = z.object({
  name: z.string().min(2, "Enter the member's full name."),
  email: z.string().email("Enter a valid work email."),
  role: z.enum(["Admin", "Analyst", "Support"]),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

type InviteUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InviteFormValues) => Promise<void>;
  isSubmitting: boolean;
};

const roleOptions: { value: InviteFormValues["role"]; label: string; hint: string }[] = [
  { value: "Admin", label: "Admin", hint: "Full operational access" },
  { value: "Analyst", label: "Analyst", hint: "Read-mostly reporting access" },
  { value: "Support", label: "Support", hint: "Customer-facing queues only" },
];

export const InviteUserDialog = ({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: InviteUserDialogProps) => {
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    mode: "onBlur",
    defaultValues: { name: "", email: "", role: "Analyst" },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = form;

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
    reset();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Invite a user</DialogTitle>
        <DialogDescription>
          They receive access to this workspace with the role you pick below.
        </DialogDescription>

        <form className="mt-4 space-y-4" onSubmit={submit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="invite-name">Full name</Label>
            <Input
              id="invite-name"
              placeholder="Jordan Fields"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "invite-name-error" : undefined}
              {...register("name")}
            />
            {errors.name ? (
              <p id="invite-name-error" role="alert" className="text-sm text-[var(--danger)]">
                {errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-email">Work email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="jordan@northstar.app"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "invite-email-error" : undefined}
              {...register("email")}
            />
            {errors.email ? (
              <p id="invite-email-error" role="alert" className="text-sm text-[var(--danger)]">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Role</legend>
            <div className="space-y-2">
              {roleOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-3 rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface-panel)] p-3 has-[[data-state=checked]]:border-[var(--ring)]"
                >
                  <input
                    type="radio"
                    value={option.value}
                    {...register("role")}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-[var(--muted-foreground)]">
                      {option.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
              <span className="flex items-center gap-2">
                {isSubmitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {isSubmitting ? "Sending invite…" : "Send invite"}
              </span>
            </Button>
          </div>
        </form>
        <span className="sr-only">{watch("role")} role selected</span>
      </DialogContent>
    </Dialog>
  );
};
