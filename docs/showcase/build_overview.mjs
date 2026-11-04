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
const embedded = JSON.stringify(publicProof).replaceAll("</", "<\\/");
const updated = html.replace(
  /(<script id="bugDemoEvidence" type="application\/json">)[\s\S]*?(<\/script>)/,
  (_, start, end) => `${start}${embedded}${end}`,
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
  if (slides !== 10) throw new Error(`Expected 10 slides, found ${slides}`);
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
