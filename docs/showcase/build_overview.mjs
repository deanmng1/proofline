/** Export the browser presentation to vector PDF and render every slide for QA. */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const output = path.join(root, "output/pdf/proofline-refresh");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(here, "proofline-overview.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Boolean(window.deck));
  const slides = await page.locator(".slide").count();
  if (slides !== 9) throw new Error(`Expected 9 slides, found ${slides}`);
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
