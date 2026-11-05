import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
// @ts-expect-error JavaScript runtime API
import { playwrightChildren } from "../canonical-runner.mjs";

const roots: string[] = [];
const fixture = (layout = "browser-cache") => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "proofline-browser-cache-")));
  roots.push(root);
  const cache = path.join(root, layout);
  const locations: Record<string, [string, string]> = {
    chromium: ["chromium-1234", "chrome/chrome"],
    "chromium-headless-shell": ["chromium_headless_shell-1234", "shell/chrome-headless-shell"],
    firefox: ["firefox-1538", "firefox/firefox"],
    webkit: ["webkit-2336", "pw_run.sh"],
    ffmpeg: ["ffmpeg-1011", "ffmpeg-mac"],
  };
  const descriptors = Object.fromEntries(
    Object.entries(locations).map(([name, [directory, file]]) => [
      name,
      {
        directory: path.join(cache, directory),
        executablePath: () => path.join(cache, directory, file),
      },
    ]),
  );
  const install = (name: string) => {
    const executable = descriptors[name].executablePath();
    mkdirSync(path.dirname(executable), { recursive: true });
    writeFileSync(executable, "fixture executable\n");
    return executable;
  };
  return {
    root,
    cache,
    install,
    descriptors,
    registry: { findExecutable: (name: string) => descriptors[name] },
  };
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const assertInstalledCompanions = (layout: string) => {
  const f = fixture(layout);
  const chromium = f.install("chromium");
  const shell = f.install("chromium-headless-shell");
  const ffmpeg = f.install("ffmpeg");
  expect(playwrightChildren(f.registry)).toEqual([
    { executable: chromium, purpose: "playwright-browser" },
    { executable: shell, purpose: "playwright-browser" },
    { executable: ffmpeg, purpose: "playwright-ffmpeg" },
  ]);
};

test("authorizes_exact_browser_and_video_companions_in_arbitrary_cache", () => {
  assertInstalledCompanions("browser-cache");
});

test("authorizes_exact_browser_and_video_companions_in_hermetic_package_cache", () => {
  assertInstalledCompanions("node_modules/playwright-core/.local-browsers");
});

test("does_not_authorize_unrelated_or_wrong_revision_cache_executables", () => {
  const f = fixture("ms-playwright");
  const shell = f.install("chromium-headless-shell");
  for (const name of ["ffmpeg-0000/ffmpeg-mac", "ffmpeg-1011/ffmpeg-hostile", "bin/unreviewed"]) {
    const file = path.join(f.cache, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "unreviewed\n");
  }
  expect(playwrightChildren(f.registry)).toEqual([
    { executable: shell, purpose: "playwright-browser" },
  ]);
});

test("missing_optional_browsers_and_missing_companions_receive_no_authority", () => {
  const f = fixture();
  expect(playwrightChildren(f.registry)).toEqual([]);
  const firefox = f.install("firefox");
  const webkit = f.install("webkit");
  expect(playwrightChildren(f.registry)).toEqual([
    { executable: firefox, purpose: "playwright-browser" },
    { executable: webkit, purpose: "playwright-browser" },
  ]);
});

test("rejects_an_executable_symlink_outside_its_package_selected_installation", () => {
  const f = fixture();
  const outside = path.join(f.root, "unreviewed");
  writeFileSync(outside, "unreviewed\n");
  const executable = f.descriptors.ffmpeg.executablePath();
  mkdirSync(path.dirname(executable), { recursive: true });
  symlinkSync(outside, executable);
  expect(() => playwrightChildren(f.registry)).toThrow(/outside.*installation/);
});

test("rejects_directory_substitution_at_an_exact_executable_path", () => {
  const f = fixture();
  mkdirSync(f.descriptors.ffmpeg.executablePath(), { recursive: true });
  expect(() => playwrightChildren(f.registry)).toThrow(/regular file/);
});

test("rejects_an_installation_directory_symlink_outside_the_selected_cache", () => {
  const f = fixture();
  const outside = path.join(f.root, "unreviewed-installation");
  mkdirSync(outside);
  writeFileSync(path.join(outside, "ffmpeg-mac"), "unreviewed\n");
  mkdirSync(f.cache);
  symlinkSync(outside, f.descriptors.ffmpeg.directory);
  expect(() => playwrightChildren(f.registry)).toThrow(/outside.*cache/);
});

test("fails_closed_with_actionable_unsupported_registry_metadata", () => {
  expect(() => playwrightChildren({})).toThrow(/Playwright.*registry/);
  expect(() => playwrightChildren({ findExecutable: () => undefined })).toThrow(
    /Playwright.*chromium/,
  );
});
