import path from "node:path";

const text = (value) => typeof value === "string" && value.length > 0;
const key = (identity) => JSON.stringify([identity.file, identity.title, identity.project]);
const titleKey = (identity) => JSON.stringify([identity.file, identity.title]);
const relative = (file, root) => {
  if (!text(file)) throw new Error("Missing result file");
  const result = path.relative(root, path.resolve(root, file)).split(path.sep).join("/");
  if (!result || result.startsWith("../") || path.isAbsolute(result))
    throw new Error("Result file outside repository");
  return result;
};
const checkIdentity = (identity) => {
  if (!text(identity.file) || !text(identity.title) || typeof identity.project !== "string")
    throw new Error("Malformed test identity");
  return identity;
};
export const requiredBindings = (manifest, runner) => [
  ...new Map(
    manifest.ownership
      .flatMap((owner) => owner.testBindings)
      .filter((binding) => binding.runner === runner)
      .map(({ file, title }) => [JSON.stringify([file, title]), { file, title }]),
  ).values(),
];
const browserTests = (report, root, runtime) => {
  if (
    !report ||
    !Array.isArray(report.suites) ||
    report.errors?.length ||
    !text(report.config?.rootDir)
  )
    throw new Error("Missing/malformed Playwright native report");
  const tests = [];
  const visit = (suite, titles) => {
    if (!suite || typeof suite !== "object") throw new Error("Malformed Playwright suite");
    for (const spec of suite.specs ?? []) {
      if (!text(spec.title) || !Array.isArray(spec.tests) || !spec.tests.length)
        throw new Error("Malformed Playwright spec");
      for (const test of spec.tests) {
        const identity = checkIdentity({
          file: relative(path.resolve(report.config.rootDir, spec.file), root),
          title: [...titles, spec.title].join(" > "),
          project: test.projectName,
        });
        if (!runtime) tests.push(identity);
        else {
          if (!Array.isArray(test.results)) throw new Error("Missing Playwright native outcomes");
          tests.push({
            ...identity,
            expectedStatus: test.expectedStatus,
            status: test.results.length === 1 ? test.results[0].status : "retried",
            retry:
              test.results.length === 1
                ? test.results[0].retry
                : Math.max(1, test.results.length - 1),
            repeats: 0,
            nativeStatus: test.status,
          });
        }
      }
    }
    for (const child of suite.suites ?? []) visit(child, [...titles, child.title]);
  };
  for (const suite of report.suites) visit(suite, []);
  return tests;
};
export const parseDiscovery = (runner, report, root) => {
  const tests =
    runner === "playwright"
      ? browserTests(report, root, false)
      : (() => {
          if (!Array.isArray(report)) throw new Error("Malformed Vitest discovery");
          return report.map((test) =>
            checkIdentity({
              file: relative(test.file, root),
              title: test.name,
              project: test.projectName ?? "",
            }),
          );
        })();
  if (new Set(tests.map(key)).size !== tests.length)
    throw new Error("Duplicate discovered identity");
  return tests;
};
export const reconcileExecution = ({
  runner,
  expected,
  nativeReport,
  nativeEvents,
  root,
  exitCode,
  allowEmpty = false,
}) => {
  const errors = [];
  let observed = [];
  try {
    if (!Array.isArray(expected)) throw new Error("Missing expected identities");
    expected.forEach(checkIdentity);
    if (new Set(expected.map(key)).size !== expected.length)
      errors.push("Duplicate expected identity");
    if (runner === "playwright") observed = browserTests(nativeReport, root, true);
    else if (runner === "vitest") {
      if (
        !Array.isArray(nativeReport?.testResults) ||
        nativeEvents?.version !== 1 ||
        !Array.isArray(nativeEvents.tests)
      )
        throw new Error("Missing/malformed Vitest native report or event sidecar");
      if (nativeReport.success === false || nativeEvents.unhandledErrors?.length)
        errors.push("Vitest reported unsuccessful execution or unhandled errors");
      const assertions = nativeReport.testResults.flatMap((file) => {
        if (!Array.isArray(file.assertionResults)) throw new Error("Malformed native assertions");
        return file.assertionResults.map((test) => {
          if (
            !Array.isArray(test.ancestorTitles) ||
            test.ancestorTitles.some((title) => typeof title !== "string") ||
            !text(test.title)
          )
            throw new Error("Malformed native assertion identity");
          return {
            file: relative(file.name, root),
            title: [...test.ancestorTitles, test.title].join(" > "),
            status: test.status,
          };
        });
      });
      observed = nativeEvents.tests.map((test) =>
        checkIdentity({ ...test, file: relative(test.file, root) }),
      );
      const unmatched = [...assertions];
      for (const test of observed) {
        const match = unmatched.findIndex(
          (item) =>
            item.file === test.file &&
            item.title === test.title &&
            (item.status === test.status ||
              (item.status === "pending" && test.status === "skipped")),
        );
        if (match < 0) errors.push(`Native report/event mismatch: ${key(test)}`);
        else unmatched.splice(match, 1);
      }
      if (unmatched.length || assertions.length !== observed.length)
        errors.push("Native report/event count mismatch");
    } else throw new Error("Unknown execution runner");
    if (!observed.length && !allowEmpty) errors.push("Zero selected tests");
    if (new Set(observed.map(key)).size !== observed.length)
      errors.push("Duplicate observed identity");
    for (const identity of expected) {
      const matches = observed.filter((test) => key(test) === key(identity));
      if (matches.length !== 1) {
        errors.push(`Required identity missing/duplicate/wrong project: ${key(identity)}`);
        continue;
      }
      const test = matches[0];
      if (
        test.status !== "passed" ||
        test.expectedStatus !== "passed" ||
        test.retry !== 0 ||
        test.repeats !== 0 ||
        (runner === "playwright" && test.nativeStatus !== "expected")
      )
        errors.push(`Required identity did not genuinely pass: ${key(identity)}`);
    }
    if (exitCode !== 0) errors.push(`Runner exited ${exitCode}`);
  } catch (error) {
    errors.push(String(error));
  }
  return { outcome: errors.length ? "failed" : "passed", expected, observed, errors };
};
export const verifyAggregate = ({ expected, children }) => {
  const errors = [];
  const observed = children.flatMap((child) => child.observed ?? []);
  if (!children.length || children.some((child) => child.outcome !== "passed"))
    errors.push("Missing or failed unit target");
  for (const identity of expected) {
    const matches = observed.filter(
      (test) =>
        titleKey(test) === titleKey(identity) &&
        (identity.project === undefined || test.project === identity.project),
    );
    if (
      matches.length !== 1 ||
      matches[0].status !== "passed" ||
      matches[0].expectedStatus !== "passed" ||
      matches[0].retry !== 0 ||
      matches[0].repeats !== 0
    )
      errors.push(
        `Required aggregate identity missing/duplicate/not passed: ${titleKey(identity)}`,
      );
  }
  return { outcome: errors.length ? "failed" : "passed", expected, observed, errors };
};
