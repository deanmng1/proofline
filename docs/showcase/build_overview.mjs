/** Export the browser presentation to vector PDF and render every slide for QA. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const output = path.join(root, "output/pdf/proofline-refresh");
await mkdir(output, { recursive: true });
// Validate the distributed snapshot before repeating any current result on a slide.
const measurements = JSON.parse(await readFile(path.join(here, "measurements.json"), "utf8"));
const snapshot = "4feb0572fb8aa1a18fcfdfa0e9f5333b59d714e2";
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const contained = (directory, relative) => {
  const resolved = path.resolve(directory, relative);
  if (!resolved.startsWith(`${directory}${path.sep}`))
    throw new Error(`Showcase evidence escapes its folder: ${relative}`);
  return resolved;
};
const referencedJson = async (reference) => {
  const file = contained(root, reference.path);
  const bytes = await readFile(file);
  if (digest(bytes) !== reference.sha256)
    throw new Error(`Showcase source hash mismatch: ${reference.path}`);
  return JSON.parse(bytes);
};
const index = await json(contained(root, measurements.evidenceIndex.path));
for (const entry of index.files) {
  const bytes = await readFile(
    contained(
      path.join(here, "verification"),
      path.relative("docs/showcase/verification", entry.path),
    ),
  );
  if (digest(bytes) !== entry.sha256 || bytes.length !== entry.bytes)
    throw new Error(`Retained verification evidence changed: ${entry.path}`);
}
const fullGate = await referencedJson(measurements.fullGate.source);
const unit = await referencedJson(measurements.nativeExecution.unit.verification);
const browserRun = await referencedJson(measurements.nativeExecution.browser.verification);
const portability = await referencedJson(measurements.portability.source);
const release = await referencedJson(measurements.release.source);
const genuinelyPassed = (record, count) =>
  record.sourceCommit === snapshot &&
  record.outcome === "passed" &&
  record.exitCode === 0 &&
  record.errors.length === 0 &&
  record.observed.length === count &&
  record.observed.every(
    (test) => test.status === "passed" && test.expectedStatus === "passed" && test.retry === 0,
  );
if (
  measurements.schemaVersion !== 2 ||
  measurements.snapshot.testedHead !== snapshot ||
  fullGate.head !== snapshot ||
  fullGate.outcome !== "passed" ||
  fullGate.steps.length !== 18 ||
  fullGate.steps.some((step) => step.exitCode !== 0) ||
  !genuinelyPassed(unit, 536) ||
  !genuinelyPassed(browserRun, 43) ||
  measurements.inventory.canonicalUnitCycle.testsPassed !== 536 ||
  measurements.inventory.canonicalUnitCycle.testFilesPassed !== 49 ||
  measurements.inventory.criticalRules.count !== 36 ||
  measurements.inventory.coverage.governanceSelectedFiles !== 23 ||
  measurements.governanceCoverageGroups.length !== 8 ||
  measurements.governanceCoverageGroups.some((group) => group.errors.length !== 0) ||
  portability.sourceCommit !== snapshot ||
  portability.outcome !== "passed" ||
  Object.keys(portability.coreHashes).length !== 31 ||
  portability.gates.length !== 10 ||
  portability.gates.some((gate) => gate.exitCode !== 0) ||
  release.sourceCommit !== snapshot ||
  release.outcome !== "passed" ||
  release.files !== 664 ||
  release.sameInventory !== true
)
  throw new Error("The current showcase snapshot does not support the stated results.");
const secondAppFolder = path.join(here, "second-app-demo");
const secondApp = await json(path.join(secondAppFolder, "provenance.json"));
for (const [relative, expected] of Object.entries(secondApp.assets)) {
  const bytes = await readFile(contained(secondAppFolder, relative));
  if (digest(bytes) !== expected.sha256 || bytes.length !== expected.bytes)
    throw new Error(`Second-app capture changed: ${relative}`);
}
const capture = await json(path.join(secondAppFolder, "verification.json.txt"));
if (
  secondApp.result !== "passed" ||
  secondApp.host.verifiedImplementationHead !== snapshot ||
  secondApp.command.exitCode !== 0 ||
  capture.outcome !== "passed" ||
  capture.exitCode !== 0 ||
  capture.errors.length !== 0 ||
  capture.observed.length !== 1 ||
  capture.observed[0].status !== "passed" ||
  capture.observed[0].expectedStatus !== "passed"
)
  throw new Error("The second-app capture does not retain a genuine passing run.");
// Fail closed if the captured regression no longer supports the presentation.
const evidenceFolder = path.join(here, "bug-demo");
const proof = JSON.parse(await readFile(path.join(evidenceFolder, "results.json"), "utf8"));
const runs = Object.fromEntries(proof.runs.map((run) => [run.id, run]));
if (
  proof.ruleId !== "FIN-002" ||
  proof.expectedCommissionCents !== 0 ||
  proof.actualBugCommissionCents !== 250 ||
  proof.harnessValidation.exitCode !== 0 ||
  runs.baseline.exitCode !== 0 ||
  runs.baseline.passedTests !== 1 ||
  runs.regression.exitCode !== 1 ||
  runs.regression.failedTests !== 1 ||
  runs.regression.actualObservedCommissionCents !== 250 ||
  runs.fixed.exitCode !== 0 ||
  runs.fixed.passedTests !== 1 ||
  [runs.baseline, runs.regression, runs.fixed].some((run) => run.selectedTests !== 1) ||
  runs["finance-suite"].passedTests !== 24 ||
  runs["finance-suite"].exitCode !== 0 ||
  new Set(proof.runs.map((run) => run.testSha256)).size !== 1 ||
  runs.fixed.sourceSha256 !== runs.baseline.sourceSha256 ||
  JSON.stringify(runs.baseline.argv) !== JSON.stringify(runs.regression.argv) ||
  JSON.stringify(runs.baseline.argv) !== JSON.stringify(runs.fixed.argv)
)
  throw new Error("Captured regression evidence does not prove the unchanged-test red/green case.");
const checksums = JSON.parse(
  await readFile(path.join(evidenceFolder, "evidence-sha256.json"), "utf8"),
);
const requiredEvidence = [
  "results.json",
  "binding.json",
  "mutation.patch",
  "source-original.ts.txt",
  "source-regression.ts.txt",
  "unchanged-test.ts.txt",
  proof.harnessValidation.reportFile,
  ...proof.runs.flatMap((run) => [
    run.stdoutFile,
    run.stderrFile,
    run.reportFile,
    `${run.id}.command.txt`,
    `${run.id}.excerpt.txt`,
  ]),
];
for (const relativePath of requiredEvidence) {
  if (typeof relativePath !== "string" || !Object.hasOwn(checksums, relativePath))
    throw new Error(`Required captured evidence is not checksummed: ${relativePath}`);
}
for (const [relativePath, expected] of Object.entries(checksums)) {
  const absolutePath = path.resolve(evidenceFolder, relativePath);
  if (!absolutePath.startsWith(`${evidenceFolder}${path.sep}`))
    throw new Error("Evidence path escapes its retained folder.");
  const actual = createHash("sha256")
    .update(await readFile(absolutePath))
    .digest("hex");
  if (actual !== expected) throw new Error(`Captured evidence hash mismatch: ${relativePath}`);
}
for (const run of proof.runs) {
  const report = JSON.parse(await readFile(path.join(evidenceFolder, run.reportFile), "utf8"));
  const selected = report.testResults.flatMap((file) =>
    file.assertionResults.filter(
      (test) => test.fullName === proof.testTitle.replaceAll(" > ", " "),
    ),
  );
  if (
    report.numPassedTests !== run.passedTests ||
    report.numFailedTests !== run.failedTests ||
    report.numPendingTests !== run.skippedTests ||
    report.numTotalTests !== run.selectedTests + run.skippedTests ||
    report.success !== (run.exitCode === 0) ||
    selected.length !== 1 ||
    selected[0].status !== run.outcome
  )
    throw new Error(`Native report does not support the captured summary: ${run.id}`);
}
const publicProof = Object.fromEntries(
  [
    "ruleId",
    "testId",
    "testTitle",
    "testFile",
    "sourceCommit",
    "unchangedTestSha256",
    "expectedCommissionCents",
    "actualBugCommissionCents",
    "depositCents",
    "redCodeCondition",
    "fixedCodeCondition",
  ].map((key) => [key, proof[key]]),
);
publicProof.runs = Object.fromEntries(
  ["baseline", "regression", "fixed", "finance-suite"].map((id) => [
    id,
    Object.fromEntries(
      [
        "exitCode",
        "selectedTests",
        "passedTests",
        "failedTests",
        "skippedTests",
        "consoleExcerpt",
      ].map((key) => [key, runs[id][key]]),
    ),
  ]),
);
const htmlPath = path.join(here, "proofline-overview.html");
const html = await readFile(htmlPath, "utf8");
const coverage = JSON.parse(
  html.match(/<script id="coverageSourceData" type="application\/json">([\s\S]*?)<\/script>/)[1],
);
for (const group of coverage.groups) {
  const measured = measurements.governanceCoverageGroups.find(
    (item) => item.workspace === group.workspace,
  );
  const covered = measured.files.reduce((sum, file) => sum + file.metrics.lines.covered, 0);
  const total = measured.files.reduce((sum, file) => sum + file.metrics.lines.total, 0);
  if (covered !== group.covered || total !== group.total)
    throw new Error(`Coverage chart counters are stale: ${group.workspace}`);
}
const embedded = JSON.stringify(publicProof).replaceAll("</", "<\\/");
let updated = html.replace(
  /(<script id="bugDemoEvidence" type="application\/json">)[\s\S]*?(<\/script>)/,
  (_, start, end) => `${start}${embedded}${end}`,
);
const captions = await readFile(path.join(secondAppFolder, "work-orders-demo.vtt"), "utf8");
updated = updated.replace(
  /(<script id="workOrdersCaptions" type="application\/json">)[\s\S]*?(<\/script>)/,
  (_, start, end) => `${start}${JSON.stringify(captions).replaceAll("</", "<\\/")}${end}`,
);
if (updated === html && !html.includes(embedded))
  throw new Error("Regression evidence slot missing.");
if (updated !== html) await writeFile(htmlPath, updated);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(here, "proofline-overview.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Boolean(window.deck));
  const slides = await page.locator(".slide").count();
  if (slides !== 13) throw new Error(`Expected 13 slides, found ${slides}`);
  for (let i = 0; i < slides; i++) {
    await page.evaluate((index) => window.deck.showSlide(index, false), i);
    await page.waitForTimeout(750);
    const overflow = await page.locator(".slide.active").evaluate((slide) => {
      const frame = slide.getBoundingClientRect();
      return [...slide.querySelectorAll("[data-fit]")].flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        // Serif glyphs may extend beyond their line box while remaining visible.
        // Only treat internal vertical overflow as a defect when a box clips it.
        const clipsVertically = ["hidden", "clip", "auto", "scroll"].includes(style.overflowY);
        return rect.left < frame.left - 1 ||
          rect.right > frame.right + 1 ||
          rect.top < frame.top - 1 ||
          rect.bottom > frame.bottom + 1 ||
          element.scrollWidth > element.clientWidth + 2 ||
          (clipsVertically && element.scrollHeight > element.clientHeight + 2)
          ? [element.textContent.slice(0, 90)]
          : [];
      });
    });
    if (overflow.length) throw new Error(`Slide ${i + 1} overflow: ${overflow.join("; ")}`);
    await page.screenshot({ path: path.join(output, `page-${i + 1}.png`) });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.body.classList.add("exporting");
    for (const slide of document.querySelectorAll(".slide")) slide.removeAttribute("aria-hidden");
  });
  await page.pdf({
    path: path.join(here, "proofline-overview.pdf"),
    width: "1920px",
    height: "1080px",
    printBackground: true,
    preferCSSPageSize: true,
    tagged: true,
    outline: true,
  });
  console.log(`Exported ${slides} slides to docs/showcase/proofline-overview.pdf`);
  console.log(`QA renders: ${output}`);
} finally {
  await browser.close();
}
