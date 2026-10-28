import { z } from "zod";
import type { DiscoveredTests, FeatureMap, PlaywrightCandidate, RuleRegistry } from "./types.ts";

export const relativePath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").some((part) => part === ".." || part === "." || part === "") &&
      !/^[A-Za-z]:/.test(value),
    "Expected a normalized repository-relative path",
  );
const vitestSchema = z
  .object({ file: relativePath, title: z.string().min(1), line: z.number().int().positive() })
  .strict();
export const rulesSchema = z
  .object({
    version: z.literal(1),
    rules: z
      .array(
        z
          .object({
            id: z.string().regex(/^[A-Z]+-\d{3}$/),
            description: z.string().min(1),
            criticality: z.enum(["critical", "standard"]),
            paths: z.array(relativePath).min(1),
            vitest: z.array(vitestSchema),
            playwright: z.array(
              z
                .object({
                  path: relativePath,
                  title: z.string().min(1),
                  line: z.number().int().positive(),
                  tag: z.string().regex(/^@[^\s]+$/),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const renderRules = (registry: RuleRegistry) => {
  const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    "# Demonstration rule catalog",
    "",
    "Generated from `rules.json` by `pnpm rules:generate`. Edit the JSON registry, then regenerate this file.",
    "",
    "These deterministic examples are test fixtures, not insurer, accounting, legal, payroll, or provider policy. Money is integer USD cents; rates are integer basis points.",
    "",
    "| Rule ID | Criticality | Demonstration behavior | Owned paths | Exact automated evidence |",
    "| --- | --- | --- | --- | --- |",
    ...registry.rules.map(
      (rule) =>
        `| ${rule.id} | ${rule.criticality} | ${cell(rule.description)} | ${rule.paths.map((value) => `\`${cell(value)}\``).join("<br>")} | ${[...rule.vitest.map((test) => `Vitest \`${cell(test.file)}:${test.line}\` — ${cell(test.title)}`), ...rule.playwright.map((test) => `Playwright \`${cell(test.path)}:${test.line}\` — ${cell(test.title)} (${cell(test.tag)})`)].join("<br>")} |`,
    ),
    "",
  ].join("\n");
};

export const validateRules = (input: unknown, discovered: DiscoveredTests, markdown?: string) => {
  const parsed = rulesSchema.safeParse(input);
  if (!parsed.success) return { errors: [`Invalid rule registry: ${parsed.error.message}`] };
  const registry = parsed.data;
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const rule of registry.rules) {
    if (ids.has(rule.id)) errors.push(`Duplicate rule ID ${rule.id}`);
    ids.add(rule.id);
    if (rule.vitest.length === 0 && rule.criticality === "critical")
      errors.push(`${rule.id} requires deterministic Vitest evidence`);
    if (rule.vitest.length + rule.playwright.length === 0)
      errors.push(`${rule.id} has no evidence`);
    for (const reference of rule.vitest) {
      const matches = discovered.vitest.filter(
        (test) =>
          test.file === reference.file &&
          test.title === reference.title &&
          test.line === reference.line,
      );
      // Vitest's runtime full name uses spaces; reject a separator collision too.
      const runnable = discovered.vitest.filter(
        (test) =>
          test.file === reference.file &&
          test.title.replaceAll(" > ", " ") === reference.title.replaceAll(" > ", " "),
      );
      if (matches.length === 0)
        errors.push(
          `${rule.id}: undiscovered Vitest evidence ${reference.file}: ${reference.title}`,
        );
      else if (matches.length !== 1 || runnable.length !== 1)
        errors.push(`${rule.id}: ambiguous Vitest evidence ${reference.title}`);
    }
    for (const reference of rule.playwright) {
      const matches = discovered.playwright.filter(
        (test) =>
          test.path === reference.path &&
          test.title === reference.title &&
          test.line === reference.line &&
          test.tags.includes(reference.tag),
      );
      const runnable = discovered.playwright.filter(
        (test) => test.path === reference.path && test.line === reference.line,
      );
      if (matches.length === 0)
        errors.push(
          `${rule.id}: undiscovered Playwright evidence ${reference.path}:${reference.line} ${reference.title} ${reference.tag}`,
        );
      else if (matches.length !== 1 || runnable.length !== 1)
        errors.push(
          `${rule.id}: ambiguous Playwright evidence ${reference.path}:${reference.line}`,
        );
    }
  }
  if (markdown !== undefined && markdown !== renderRules(registry))
    errors.push("rules.md drift: run pnpm rules:generate");
  return { errors };
};

export const validateFeatureMap = (
  featureMap: FeatureMap,
  playwrightTests: PlaywrightCandidate[],
  vitestTests: string[] = [],
) => {
  const errors: string[] = [];
  const knownTags = new Set(playwrightTests.flatMap((test) => test.tags));
  const knownVitestFiles = new Set(vitestTests);

  for (const feature of featureMap.features) {
    for (const tag of feature.playwrightTags) {
      if (!knownTags.has(tag)) {
        errors.push(`Feature ${feature.id} references stale Playwright tag ${tag}.`);
      }
    }

    for (const test of feature.vitest) {
      if (!knownVitestFiles.has(test)) {
        errors.push(`Feature ${feature.id} references missing Vitest file ${test}.`);
      }
    }
  }

  return { errors };
};
