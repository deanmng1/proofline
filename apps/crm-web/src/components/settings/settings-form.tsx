import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SettingsPayload } from "@/types";

const settingsSchema = z.object({
  companyName: z.string().min(2, "Company name needs at least 2 characters."),
  contactEmail: z.string().email("Enter a valid email address."),
  timezone: z.string().min(2, "Enter a valid timezone (e.g. Europe/Berlin)."),
  weeklyDigest: z.boolean(),
  productUpdates: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

type SettingsFormProps = {
  defaultValues: SettingsPayload;
  onSubmit: (values: SettingsPayload) => Promise<void>;
  isSaving: boolean;
};

export const SettingsForm = ({ defaultValues, onSubmit, isSaving }: SettingsFormProps) => {
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    mode: "onBlur",
    values: {
      companyName: defaultValues.profile.companyName,
      contactEmail: defaultValues.profile.contactEmail,
      timezone: defaultValues.profile.timezone,
      weeklyDigest: defaultValues.preferences.weeklyDigest,
      productUpdates: defaultValues.preferences.productUpdates,
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = form;

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      profile: {
        companyName: values.companyName,
        contactEmail: values.contactEmail,
        timezone: values.timezone,
      },
      preferences: {
        weeklyDigest: values.weeklyDigest,
        productUpdates: values.productUpdates,
      },
    });
  });

  const textField = (
    id: keyof Pick<SettingsFormValues, "companyName" | "contactEmail" | "timezone">,
    label: string,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `${id}-error` : undefined}
        {...register(id)}
      />
      {errors[id] ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-[var(--danger)]">
          {errors[id]?.message}
        </p>
      ) : null}
    </div>
  );

  return (
    <form className="space-y-6" onSubmit={submit} noValidate>
      {isDirty ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[0.8rem] border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3"
        >
          <p className="text-sm font-medium text-[var(--foreground)]">Unsaved changes</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => reset()}
            disabled={isSaving}
          >
            Discard changes
          </Button>
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Workspace identity</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            Core metadata used by notifications, exports and admin messaging.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {textField("companyName", "Company name")}
          {textField("contactEmail", "Contact email")}
          {textField("timezone", "Timezone")}
          <div className="space-y-2">
            <p className="text-sm font-medium">Regional behavior</p>
            <p className="self-center text-sm text-[var(--muted-foreground)]">
              Drives export windows, digest scheduling and workforce assumptions.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t border-[var(--border)] pt-6">
        <div>
          <p className="text-sm font-semibold">Delivery preferences</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            Control what the ops team receives by default.
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface-panel)] p-4">
          <div>
            <Label htmlFor="weeklyDigest" className="font-medium">
              Weekly digest
            </Label>
            <p className="text-sm text-[var(--muted-foreground)]">
              Receive a weekly summary of product health.
            </p>
          </div>
          <Switch
            id="weeklyDigest"
            checked={watch("weeklyDigest")}
            onCheckedChange={(checked) => setValue("weeklyDigest", checked, { shouldDirty: true })}
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-[0.8rem] border border-[var(--border)] bg-[var(--surface-panel)] p-4">
          <div>
            <Label htmlFor="productUpdates" className="font-medium">
              Product updates
            </Label>
            <p className="text-sm text-[var(--muted-foreground)]">
              Get notified about new releases and changes.
            </p>
          </div>
          <Switch
            id="productUpdates"
            checked={watch("productUpdates")}
            onCheckedChange={(checked) =>
              setValue("productUpdates", checked, { shouldDirty: true })
            }
          />
        </div>
      </div>

      <Button type="submit" disabled={isSaving} aria-busy={isSaving}>
        <span className="flex items-center gap-2">
          {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {isSaving ? "Saving…" : "Save settings"}
        </span>
      </Button>
    </form>
  );
};
