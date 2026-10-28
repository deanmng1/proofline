import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { StatePanel } from "@/components/shared/state-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCustomer,
  createProperty,
  getCustomers,
  getProperties,
} from "@/features/crm/crm-api";

const initialCustomer = { name: "", email: "" };
const initialProperty = { customerId: "", addressLine1: "", city: "", state: "", postalCode: "" };

export const CustomerListPage = () => {
  const queryClient = useQueryClient();
  const [customer, setCustomer] = useState(initialCustomer);
  const [property, setProperty] = useState(initialProperty);
  const customersQuery = useQuery({ queryKey: ["crm", "customers"], queryFn: getCustomers });
  const propertiesQuery = useQuery({ queryKey: ["crm", "properties"], queryFn: getProperties });
  const refreshCustomers = () => queryClient.invalidateQueries({ queryKey: ["crm", "customers"] });
  const refreshProperties = () =>
    queryClient.invalidateQueries({ queryKey: ["crm", "properties"] });
  const customerMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      setCustomer(initialCustomer);
      void refreshCustomers();
    },
  });
  const propertyMutation = useMutation({
    mutationFn: createProperty,
    onSuccess: () => {
      setProperty(initialProperty);
      void refreshProperties();
    },
  });

  if (customersQuery.isError || propertiesQuery.isError) {
    return (
      <StatePanel
        kind="error"
        title="Customers unavailable"
        description="The customer intake contract failed. Retry when the service is available."
        onRetry={() => {
          void customersQuery.refetch();
          void propertiesQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insurance CRM"
        title="Customer and property intake"
        description="Start with the policyholder and insured property before creating a quote."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold">Add policyholder</h2>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              customerMutation.mutate(customer);
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="customer-name">Customer name</Label>
              <Input
                id="customer-name"
                required
                value={customer.name}
                onChange={(event) => setCustomer({ ...customer, name: event.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="customer-email">Customer email</Label>
              <Input
                id="customer-email"
                type="email"
                required
                value={customer.email}
                onChange={(event) => setCustomer({ ...customer, email: event.target.value })}
              />
            </div>
            <Button type="submit" disabled={customerMutation.isPending}>
              Add customer
            </Button>
          </form>
          <ul className="mt-5 divide-y divide-[var(--border)]" aria-label="Customers">
            {(customersQuery.data ?? []).map((entry) => (
              <li key={entry.id} className="py-3 text-sm">
                <p className="font-medium">{entry.name}</p>
                <p className="text-[var(--foreground-muted)]">{entry.email}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold">Add insured property</h2>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              propertyMutation.mutate(property);
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="property-customer">Policyholder</Label>
              <select
                id="property-customer"
                required
                value={property.customerId}
                onChange={(event) => setProperty({ ...property, customerId: event.target.value })}
                className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
              >
                <option value="">Select a policyholder</option>
                {(customersQuery.data ?? []).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="property-address">Street address</Label>
              <Input
                id="property-address"
                required
                value={property.addressLine1}
                onChange={(event) => setProperty({ ...property, addressLine1: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["city", "City"],
                  ["state", "State"],
                  ["postalCode", "Postal code"],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="grid gap-2">
                  <Label htmlFor={`property-${field}`}>{label}</Label>
                  <Input
                    id={`property-${field}`}
                    required
                    value={property[field]}
                    onChange={(event) => setProperty({ ...property, [field]: event.target.value })}
                  />
                </div>
              ))}
            </div>
            <Button
              type="submit"
              disabled={propertyMutation.isPending || !customersQuery.data?.length}
            >
              Add property
            </Button>
          </form>
          <ul className="mt-5 divide-y divide-[var(--border)]" aria-label="Insured properties">
            {(propertiesQuery.data ?? []).map((entry) => (
              <li key={entry.id} className="py-3 text-sm">
                <p className="font-medium">{entry.addressLine1}</p>
                <p className="text-[var(--foreground-muted)]">
                  {entry.city}, {entry.state} {entry.postalCode}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};
