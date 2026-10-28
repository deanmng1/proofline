import type { Customer, Property, TestSeed } from "@testbed/api-contracts";
import type { CommissionPlan, DomainEvent, Policy, Quote } from "@testbed/domain";

import { createTestIds } from "./ids";

const occurredAt = "2026-01-01T00:00:00.000Z";

export function commissionPlanFixture(overrides: Partial<CommissionPlan> = {}): CommissionPlan {
  return {
    timing: "as_earned",
    rateBasisPoints: 1_000,
    holdPeriodDays: 30,
    reverseOnRefund: true,
    ...overrides,
  };
}

export function customerFixture(overrides: Partial<Customer> = {}): Customer {
  const ids = createTestIds("fixture");
  return {
    id: ids.next("customer"),
    name: "Morgan Reed",
    email: "morgan.reed@example.test",
    ...overrides,
  };
}

export function propertyFixture(overrides: Partial<Property> = {}): Property {
  const ids = createTestIds("fixture");
  return {
    id: ids.next("property"),
    customerId: "fixture-customer-1",
    addressLine1: "100 Market Street",
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    ...overrides,
  };
}

export function quoteFixture(overrides: Partial<Quote> = {}): Quote {
  return {
    id: "fixture-quote-1",
    customerId: "fixture-customer-1",
    propertyId: "fixture-property-1",
    product: "risk_secure_plus",
    premiumCents: 12_000,
    commissionPlan: commissionPlanFixture(),
    createdAt: occurredAt,
    status: "quoted",
    ...overrides,
  };
}

export function policyFixture(overrides: Partial<Policy> = {}): Policy {
  const quote = quoteFixture();
  return {
    id: "fixture-policy-1",
    quoteId: quote.id,
    customerId: quote.customerId,
    propertyId: quote.propertyId,
    product: quote.product,
    premiumCents: quote.premiumCents,
    commissionPlan: quote.commissionPlan,
    boundAt: occurredAt,
    status: "bound",
    ...overrides,
  };
}

export function ledgerSeed(overrides: Partial<TestSeed> = {}): TestSeed {
  const customer = customerFixture({ id: "fixture-customer-1" });
  const property = propertyFixture({ id: "fixture-property-1", customerId: customer.id });
  const quote = quoteFixture({ customerId: customer.id, propertyId: property.id });
  const events: DomainEvent[] = [
    {
      type: "quote_created",
      sourceEventId: "fixture-event-quote-created",
      occurredAt,
      quote: {
        id: quote.id,
        customerId: quote.customerId,
        propertyId: quote.propertyId,
        product: quote.product,
        premiumCents: quote.premiumCents,
        commissionPlan: quote.commissionPlan,
      },
    },
    {
      type: "quote_bound",
      sourceEventId: "fixture-event-quote-bound",
      occurredAt,
      quoteId: quote.id,
      policyId: "fixture-policy-1",
    },
  ];
  return { customers: [customer], properties: [property], events, ...overrides };
}
