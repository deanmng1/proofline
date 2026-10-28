import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/shared/page-header";
import { StatePanel } from "@/components/shared/state-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bindQuote,
  createQuote,
  getCustomers,
  getProperties,
  getQuotes,
  type QuoteSummary,
} from "@/features/crm/crm-api";
import { useCommand } from "@/features/crm/use-command";

const plans = {
  risk_secure: {
    timing: "on_bind" as const,
    rateBasisPoints: 1_250,
    holdPeriodDays: 0,
    reverseOnRefund: true,
    label: "Written: 12.5% when the policy binds",
  },
  risk_secure_plus: {
    timing: "as_earned" as const,
    rateBasisPoints: 1_000,
    holdPeriodDays: 30,
    reverseOnRefund: true,
    label: "Cash-first: 10% as premium is paid",
  },
};

const describeCommission = (quote: QuoteSummary) =>
  quote.commissionPlan.timing === "on_bind"
    ? "Written — payable when the policy binds"
    : `As earned — payable after ${quote.commissionPlan.holdPeriodDays} days`;

export const QuoteForm = () => {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [product, setProduct] = useState<keyof typeof plans>("risk_secure");
  const [premiumCents, setPremiumCents] = useState("12000");
  const [boundQuote, setBoundQuote] = useState<QuoteSummary | null>(null);
  const [pendingBind, setPendingBind] = useState<{
    quoteId: string;
    commandId: string;
    correlationId: string;
  } | null>(null);
  const quoteCommand = useCommand();
  const bindCommand = useCommand();
  const customersQuery = useQuery({ queryKey: ["crm", "customers"], queryFn: getCustomers });
  const propertiesQuery = useQuery({ queryKey: ["crm", "properties"], queryFn: getProperties });
  const quotesQuery = useQuery({ queryKey: ["crm", "quotes"], queryFn: getQuotes });
  const quoteMutation = useMutation({
    mutationFn: createQuote,
    onSuccess: (quote) => {
      quoteCommand.complete();
      void queryClient.invalidateQueries({ queryKey: ["crm", "quotes"] });
      setBoundQuote(null);
      return quote;
    },
  });
  const bindMutation = useMutation({
    mutationFn: (input: { quoteId: string; commandId: string; correlationId: string }) =>
      bindQuote(input.quoteId, { commandId: input.commandId, correlationId: input.correlationId }),
    onSuccess: (policy, { quoteId }) => {
      bindCommand.complete();
      setPendingBind(null);
      const quote = (quotesQuery.data ?? []).find((entry) => entry.id === quoteId);
      if (quote) setBoundQuote({ ...quote, status: "bound" });
      void queryClient.invalidateQueries({ queryKey: ["crm", "quotes"] });
      void queryClient.invalidateQueries({ queryKey: ["crm", "policies"] });
      return policy;
    },
  });

  if (customersQuery.isError || propertiesQuery.isError || quotesQuery.isError) {
    return (
      <StatePanel
        kind="error"
        title="Quotes unavailable"
        description="The quote service failed. Retry before attempting to bind coverage."
        onRetry={() => {
          void customersQuery.refetch();
          void propertiesQuery.refetch();
          void quotesQuery.refetch();
        }}
      />
    );
  }

  const availableProperties = (propertiesQuery.data ?? []).filter(
    (entry) => !customerId || entry.customerId === customerId,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Policy workflow"
        title="Quote and bind coverage"
        description="Choose a product and explicit commission timing before the policy is bound."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold">New real-estate insurance quote</h2>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              quoteMutation.mutate(
                quoteCommand.prepare({
                  customerId,
                  propertyId,
                  product,
                  premiumCents: Number(premiumCents),
                  commissionPlan: plans[product],
                }),
              );
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="quote-customer">Policyholder</Label>
              <select
                id="quote-customer"
                required
                value={customerId}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setPropertyId("");
                }}
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
              <Label htmlFor="quote-property">Insured property</Label>
              <select
                id="quote-property"
                required
                value={propertyId}
                onChange={(event) => setPropertyId(event.target.value)}
                className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
              >
                <option value="">Select an insured property</option>
                {availableProperties.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.addressLine1}, {entry.city}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quote-product">Product</Label>
              <select
                id="quote-product"
                value={product}
                onChange={(event) => setProduct(event.target.value as keyof typeof plans)}
                className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
              >
                <option value="risk_secure">Risk Secure</option>
                <option value="risk_secure_plus">Risk Secure Plus</option>
              </select>
              <p className="text-sm text-[var(--foreground-muted)]">{plans[product].label}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quote-premium">Premium in cents</Label>
              <Input
                id="quote-premium"
                type="number"
                min="1"
                required
                value={premiumCents}
                onChange={(event) => setPremiumCents(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={quoteMutation.isPending || !customerId || !propertyId}>
              Create quote
            </Button>
          </form>
          {quoteMutation.isError ? (
            <p className="mt-3 text-sm text-rose-600" role="alert">
              Quote could not be created. Check the quote details and try again.
            </p>
          ) : null}
        </section>
        <section className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold">Open quotes</h2>
          <ul className="mt-4 space-y-3" aria-label="Open quotes">
            {(quotesQuery.data ?? []).map((quote) => (
              <li key={quote.id} className="rounded-xl border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {quote.product === "risk_secure" ? "Risk Secure" : "Risk Secure Plus"}
                    </p>
                    <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                      {quote.status === "bound"
                        ? describeCommission(quote)
                        : plans[quote.product].label}
                    </p>
                  </div>
                  {quote.status === "quoted" ? (
                    <Button
                      size="sm"
                      disabled={bindMutation.isPending || pendingBind !== null}
                      onClick={() => {
                        const command = bindCommand.prepare({ quoteId: quote.id });
                        setPendingBind(command);
                        bindMutation.mutate(command);
                      }}
                    >
                      Bind quote
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {boundQuote ? (
            <p className="mt-4 rounded-lg bg-[var(--muted)] p-3 text-sm" role="status">
              {describeCommission(boundQuote)} · <span className="font-semibold">COM-002</span>
            </p>
          ) : null}
          {bindMutation.isError ? (
            <p className="mt-3 text-sm text-rose-600" role="alert">
              Quote could not be bound. Retry binding to complete the request.
            </p>
          ) : null}
          {pendingBind && bindMutation.isError ? (
            <Button size="sm" className="mt-3" onClick={() => bindMutation.mutate(pendingBind)}>
              Retry bind quote
            </Button>
          ) : null}
          {bindMutation.data ? (
            <Link
              className="mt-4 inline-flex text-sm font-medium text-[var(--accent-foreground)] underline"
              to={`/app/crm/policies/${bindMutation.data.id}`}
            >
              Review bound policy
            </Link>
          ) : null}
        </section>
      </div>
    </div>
  );
};
