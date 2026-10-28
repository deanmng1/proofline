import { describe, expect, test } from "vitest";

import { fixtureFeatureMap, fixtureSourceFiles } from "../fixtures/repository.ts";
import { selectImpact } from "./select.ts";

const candidates = {
  vitest: [
    "apps/crm-web/src/features/crm-workflow.test.tsx",
    "packages/domain/src/apply-event.test.ts",
  ],
  playwright: [
    {
      path: "apps/crm-e2e/src/features/quote-bind-finance.spec.ts",
      tags: ["@quote", "@policy", "@finance"],
    },
    { path: "apps/crm-e2e/src/features/commission-refund.spec.ts", tags: ["@commission"] },
  ],
};

const choose = (files: Parameters<typeof selectImpact>[0]["manifest"]["files"]) =>
  selectImpact({
    manifest: { base: "base", head: "head", files, uncertainty: [] },
    featureMap: fixtureFeatureMap,
    candidates,
    sourceFiles: fixtureSourceFiles,
  });

describe("conservative impact selection", () => {
  test.each(["direct", "import"])(
    "widens_all_sibling_identities_only_for_%s_file_evidence",
    (reason) => {
      const spec = "apps/crm-e2e/src/shared.spec.ts";
      const helper = "apps/crm-e2e/src/helper.ts";
      const identities = [
        { path: spec, title: "quote", line: 2, tags: ["@quote"] },
        { path: spec, title: "other", line: 3, tags: ["@other"] },
      ];
      const result = selectImpact({
        manifest: {
          base: "base",
          head: "head",
          uncertainty: [],
          files: [{ path: reason === "direct" ? spec : helper, status: "modified" }],
        },
        featureMap: { version: 1, features: [] },
        candidates: { vitest: [], playwright: identities },
        sourceFiles: { [spec]: 'import "./helper";', [helper]: "export {};" },
      });
      expect(result.fallback).toBe("none");
      expect(result.playwrightIdentities).toEqual(identities);
    },
  );
  test.each(["@quote", "@other"])(
    "preserves %s feature evidence from distinct tests in the same Playwright spec",
    (tag) => {
      const spec = "apps/crm-e2e/src/features/quote-bind-finance.spec.ts";
      const source = "apps/crm-web/src/features/quotes/quote-form.tsx";
      const selection = selectImpact({
        manifest: {
          base: "base",
          head: "head",
          files: [{ path: source, status: "modified" }],
          uncertainty: [],
        },
        featureMap: {
          version: 1,
          features: [{ id: "tag-owner", paths: [source], vitest: [], playwrightTags: [tag] }],
        },
        candidates: {
          vitest: [],
          playwright: [
            { path: spec, title: "quote journey", line: 3, tags: ["@quote"] },
            { path: spec, title: "other journey", line: 20, tags: ["@other"] },
          ],
        },
        sourceFiles: {},
      });

      expect(selection).toMatchObject({
        playwrightTests: [spec],
        fallback: "none",
        errors: [],
      });
      expect(selection.reasons[spec]).toEqual(["feature:tag-owner"]);
      expect(selection.playwrightIdentities).toEqual([expect.objectContaining({ tags: [tag] })]);
    },
  );

  test("selects a directly edited test without broad fallback", () => {
    const selection = choose([
      { path: "packages/domain/src/apply-event.test.ts", status: "modified" },
    ]);

    expect(selection).toMatchObject({
      fallback: "none",
      vitestFiles: ["packages/domain/src/apply-event.test.ts"],
    });
    expect(selection.reasons["packages/domain/src/apply-event.test.ts"]).toContain(
      "direct-test-edit",
    );
  });

  test("unions static Vitest imports with feature-map tests and Playwright tags", () => {
    const selection = choose([
      { path: "apps/crm-web/src/features/quotes/quote-form.tsx", status: "modified" },
      { path: "packages/domain/src/apply-event.ts", status: "modified" },
    ]);

    expect(selection.fallback).toBe("none");
    expect(selection.vitestFiles).toEqual([
      "apps/crm-web/src/features/crm-workflow.test.tsx",
      "packages/domain/src/apply-event.test.ts",
    ]);
    expect(selection.playwrightTests).toEqual([
      "apps/crm-e2e/src/features/quote-bind-finance.spec.ts",
    ]);
  });

  test("selects Playwright specs that import a changed helper", () => {
    const selection = choose([{ path: "apps/crm-e2e/src/helpers.ts", status: "modified" }]);

    expect(selection).toMatchObject({
      fallback: "none",
      playwrightTests: ["apps/crm-e2e/src/features/quote-bind-finance.spec.ts"],
    });
    expect(selection.reasons["apps/crm-e2e/src/features/quote-bind-finance.spec.ts"]).toContain(
      "static-import:apps/crm-e2e/src/helpers.ts",
    );
  });

  test("handles untracked, renamed, and deleted paths conservatively", () => {
    const untracked = choose([
      { path: "apps/crm-web/src/features/quotes/new-control.tsx", status: "untracked" },
    ]);
    const renamed = choose([
      {
        path: "apps/crm-web/src/features/quotes/quote-form.tsx",
        previousPath: "apps/crm-web/src/features/quotes/old-quote-form.tsx",
        status: "renamed",
      },
    ]);
    const deleted = choose([{ path: "packages/domain/src/apply-event.ts", status: "deleted" }]);

    expect(untracked.playwrightTests).toEqual([
      "apps/crm-e2e/src/features/quote-bind-finance.spec.ts",
    ]);
    expect(renamed.vitestFiles).toContain("apps/crm-web/src/features/crm-workflow.test.tsx");
    expect(deleted.vitestFiles).toContain("packages/domain/src/apply-event.test.ts");
  });

  test("falls back for workspace configuration, missing history, and unknown executable ownership", () => {
    const configuration = choose([{ path: "pnpm-lock.yaml", status: "modified" }]);
    const history = selectImpact({
      manifest: { base: null, head: "head", files: [], uncertainty: ["missing merge base"] },
      featureMap: fixtureFeatureMap,
      candidates,
      sourceFiles: fixtureSourceFiles,
    });
    const unknownOwner = choose([{ path: "apps/new-service/src/index.ts", status: "added" }]);

    for (const selection of [configuration, history, unknownOwner]) {
      expect(selection.fallback).toBe("all-tests");
      expect(selection.vitestFiles).toEqual(candidates.vitest);
      expect(selection.playwrightTests).toEqual(
        candidates.playwright.map((candidate) => candidate.path),
      );
    }
  });

  test("falls back when runtime code has no static or reviewed test ownership", () => {
    for (const path of [
      "tsconfig.json",
      "packages/domain/package.json",
      "apps/crm-web/src/main.tsx",
      "apps/crm-web/src/styles.css",
      "apps/crm-web/src/features/i18n/locales/en.json",
    ]) {
      const selection = choose([{ path, status: "modified" }]);

      expect(selection.fallback).toBe("all-tests");
    }
  });
});
