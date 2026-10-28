export const fixtureSourceFiles: Record<string, string> = {
  "apps/crm-web/src/features/quotes/quote-form.tsx": "export const QuoteForm = () => null;",
  "apps/crm-web/src/features/crm-workflow.test.tsx": `import { QuoteForm } from "@/features/quotes/quote-form";\nvoid QuoteForm;`,
  "packages/domain/src/apply-event.ts": "export const applyEvent = () => undefined;",
  "packages/domain/src/apply-event.test.ts": `import { applyEvent } from "./apply-event";\nvoid applyEvent;`,
  "apps/crm-e2e/src/helpers.ts": "export const login = async () => undefined;",
  "apps/crm-e2e/src/features/quote-bind-finance.spec.ts": `import { login } from "../helpers";\ntest("@quote @policy @finance journey", () => login());`,
  "apps/crm-e2e/src/features/commission-refund.spec.ts": `test("@commission refund", () => undefined);`,
};

export const fixtureFeatureMap = {
  version: 1,
  features: [
    {
      id: "quote-workflow",
      paths: ["apps/crm-web/src/features/quotes/**", "packages/domain/src/**"],
      vitest: ["apps/crm-web/src/features/crm-workflow.test.tsx"],
      playwrightTags: ["@quote", "@policy", "@finance"],
    },
  ],
};
