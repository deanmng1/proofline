#!/usr/bin/env python3
"""Capture a controlled FIN-002 regression in an isolated, pinned local clone.

Never changes the source checkout. Requires its existing installed dependencies;
there is no install step or network fetch. Refuses an existing clone rather than
overwriting it. A successful capture is not a Proofline full completion gate.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone


COMMIT = "90987ce90891babfb7fc2f610ae52ba9f8200f32"
SOURCE = "packages/finance-service/src/finance-service.ts"
TEST = "packages/finance-service/src/finance-service.test.ts"
RUNNER = "tools/proofline/canonical-runner.mjs"
MANIFEST = "proofline.harness.json"
EXPECTED = {
    SOURCE: "7d85c113b5c405ab86ceef8756998b5dd3e78a39c0be5c69823ee5a5b8c0c467",
    TEST: "d8e16e95d4f1fd8ffb17c3d21388f0d5cb220d9a1f901407cd1e439c6e7ba1ff",
    RUNNER: "1b6a04eecb373b160dc9da9ea8e8a19694f4735a73cc7562561144c97f373c1b",
    MANIFEST: "9dede70a4fec135b8fa87b06370c309fd5e9336dc330739c871ca7eae1dd51f2",
}
TITLE = "Finance service > cash_first_accrues_only_settled_premium"
NATIVE_TITLE = TITLE.replace(" > ", " ")
TEST_ID = "binding-9bb406121555e978c4ee"
GOOD = 'if (event.type === "finance.premium.payment.settled") {'
BAD = ('if (event.type === "finance.premium.payment.settled" || '
       'event.type === "finance.deposit.recorded") {')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def shell(command):
    return shlex.join(command)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument("--work-dir", type=Path)
    parser.add_argument("--evidence-dir", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    original = args.repository.resolve()
    work = (args.work_dir or original / "output/bug-demo").resolve()
    evidence = args.evidence_dir.resolve()
    clone = work / "repository"
    require(work.is_relative_to(original / "output/bug-demo"),
            "Work directory must be below the source checkout's output/bug-demo directory.")
    require(not clone.exists(), f"Refusing to overwrite existing clone: {clone}")
    require((original / "node_modules/.pnpm").is_dir(), "Existing local dependencies are required.")
    for file, expected in EXPECTED.items():
        require(sha((original / file).read_bytes()) == expected,
                f"Source checkout differs from the pinned evidence input: {file}")
    evidence.mkdir(parents=True, exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)
    runtime = Path("/Users/dio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin")
    env = os.environ.copy()
    env["PATH"] = f"{runtime}:/opt/homebrew/bin:{env.get('PATH', '')}"
    env["NO_COLOR"] = "1"
    env["CI"] = "1"
    # Never inherit a caller's test selection or injected Node preload.
    for key in ["NODE_OPTIONS", "VITEST", "VITEST_SEGFAULT_RETRY"]:
        env.pop(key, None)
    node = shutil.which("node", path=env["PATH"])
    require(node is not None, "Node is required.")
    node_version = subprocess.check_output([node, "--version"], text=True, env=env).strip()
    require(int(node_version[1:].split(".")[0]) >= 22, "This repository requires Node >=22.")
    clone_command = ["git", "clone", "--local", "--no-hardlinks", str(original), str(clone)]
    clone_result = subprocess.run(clone_command, capture_output=True, text=True, env=env)
    (evidence / "clone.txt").write_text(clone_result.stdout + clone_result.stderr)
    require(clone_result.returncode == 0, "Local clone failed; see clone.txt.")
    subprocess.run(["git", "checkout", "--detach", COMMIT], cwd=clone, env=env,
                   check=True, capture_output=True)
    require(subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=clone,
                                   text=True, env=env).strip() == COMMIT, "Pinned HEAD mismatch.")
    (clone / "node_modules").symlink_to(original / "node_modules", target_is_directory=True)
    # pnpm keeps workspace-to-workspace links beside each package. Copy only
    # their link graph so relative @testbed links resolve to this clone's code.
    # Linking these directories wholesale would incorrectly use source-checkout code.
    for area in ["packages", "apps", "tools"]:
        for package_json in (clone / area).glob("*/package.json"):
            relative = package_json.parent.relative_to(clone) / "node_modules"
            installed = original / relative
            if installed.is_dir():
                shutil.copytree(installed, clone / relative, symlinks=True)
    for file, expected in EXPECTED.items():
        require(sha((clone / file).read_bytes()) == expected, f"Pinned clone hash mismatch: {file}")
    source = (clone / SOURCE).read_bytes()
    test = (clone / TEST).read_bytes()
    require(source.decode().count(GOOD) == 1, "Mutation condition is missing or ambiguous.")
    mutated = source.decode().replace(GOOD, BAD).encode()
    manifest = json.loads((clone / MANIFEST).read_text())
    bindings = [binding for scope in manifest["ownership"] for binding in scope["testBindings"]
                if binding["testId"] == TEST_ID]
    require(len(bindings) == 1, "Manifest binding is missing or ambiguous.")
    binding = bindings[0]
    require(binding["ruleId"] == "FIN-002" and binding["title"] == TITLE
            and binding["file"] == TEST and binding["line"] == 243,
            "Manifest test identity has changed.")
    registry = json.loads((clone / "test-impact/rules.json").read_text())
    rule = next(rule for rule in registry["rules"] if rule["id"] == "FIN-002")
    write_json(evidence / "binding.json", {"sourceCommit": COMMIT, "binding": binding, "rule": rule})
    (evidence / "source-original.ts.txt").write_bytes(source)
    (evidence / "source-regression.ts.txt").write_bytes(mutated)
    (evidence / "unchanged-test.ts.txt").write_bytes(test)
    (evidence / "mutation.patch").write_text("".join(difflib.unified_diff(
        source.decode().splitlines(True), mutated.decode().splitlines(True),
        fromfile=f"a/{SOURCE}", tofile=f"b/{SOURCE}")))
    # The same exact argv writes to the same temporary report on each focused run.
    pattern = "^" + "(?: > | )".join(re.escape(part) for part in TITLE.split(" > ")) + "$"
    common = ["node", RUNNER, "vitest", "run", TEST]
    focused = common + ["--testNamePattern", pattern, "--cache=false", "--reporter=verbose",
                        "--reporter=json", "--outputFile=artifacts/bug-demo-selected.json"]
    suite = common + ["--cache=false", "--reporter=verbose", "--reporter=json",
                      "--outputFile=artifacts/bug-demo-selected.json"]
    (clone / "artifacts").mkdir(exist_ok=True)
    runs = []

    def capture(name, command, expected_exit, selected_only):
        require((clone / TEST).read_bytes() == test, "Regression test was changed.")
        require(sha((clone / RUNNER).read_bytes()) == EXPECTED[RUNNER], "Canonical runner changed.")
        report_path = clone / "artifacts/bug-demo-selected.json"
        report_path.unlink(missing_ok=True)
        started = datetime.now(timezone.utc).isoformat()
        start = time.monotonic()
        completed = subprocess.run(command, cwd=clone, env=env, capture_output=True, text=True)
        elapsed = time.monotonic() - start
        (evidence / f"{name}.stdout.txt").write_text(completed.stdout)
        (evidence / f"{name}.stderr.txt").write_text(completed.stderr)
        (evidence / f"{name}.command.txt").write_text(shell(command) + "\n")
        require(report_path.is_file(), f"{name} produced no JSON report; capture fails closed.")
        report = json.loads(report_path.read_text())
        shutil.copyfile(report_path, evidence / f"{name}.report.json.txt")
        assertions = [assertion for result in report["testResults"]
                      for assertion in result["assertionResults"]]
        selected = [assertion for assertion in assertions if assertion["status"] in ("passed", "failed")]
        require(completed.returncode == expected_exit,
                f"{name}: expected exit {expected_exit}, got {completed.returncode}.")
        require(report.get("numRuntimeErrorTestSuites", 0) == 0, f"{name}: runtime error reported.")
        require(report["numFailedTests"] == (1 if expected_exit else 0), f"{name}: unexpected failure count.")
        if selected_only:
            require(len(selected) == 1 and selected[0]["fullName"] == NATIVE_TITLE,
                    f"{name}: expected exactly the manifest-bound test, got {selected}.")
        else:
            require(len(selected) > 1 and all(a["status"] == "passed" for a in selected),
                    "Restored full finance-file suite did not pass.")
        if name == "regression":
            failure = "\n".join(selected[0]["failureMessages"])
            require("AssertionError" in failure and "to deeply equal []" in failure
                    and '"amountCents": 250,' in completed.stderr
                    and f"{TEST}:249:42" in completed.stderr,
                    "Regression did not fail at the intended zero-commission assertion.")
        result = {
            "id": name, "command": shell(command), "argv": command, "startedAt": started,
            "durationSeconds": round(elapsed, 3), "exitCode": completed.returncode,
            "outcome": "failed" if expected_exit else "passed", "selectedTests": len(selected),
            "passedTests": report["numPassedTests"], "failedTests": report["numFailedTests"],
            "skippedTests": report["numPendingTests"],
            "sourceSha256": sha((clone / SOURCE).read_bytes()), "testSha256": sha(test),
            "stdout": f"{name}.stdout.txt", "stderr": f"{name}.stderr.txt",
            "stdoutFile": f"{name}.stdout.txt", "stderrFile": f"{name}.stderr.txt",
            "reportFile": f"{name}.report.json.txt",
        }
        if name == "regression":
            result["rawFailureAssertionMessage"] = "\n".join(selected[0]["failureMessages"])
            result["actualObservedCommissionCents"] = int(re.search(
                r'"amountCents": (\d+),', completed.stderr).group(1))
            wanted = [" FAIL ", "AssertionError:", "- Expected", "+ Received", "- []", "+ [", "+   {", '+     "amountCents":']
            result["consoleExcerpt"] = "\n".join(next(
                line for line in completed.stderr.splitlines() if line.startswith(prefix)) for prefix in wanted)
            result["consoleExcerptSource"] = "Selected noncontiguous lines from native stderr."
        else:
            result["consoleExcerpt"] = "\n".join(line for line in completed.stdout.splitlines()
                if ("cash_first_accrues_only_settled_premium" in line or
                    line.strip().startswith(("Test Files", "Tests", "Duration"))))
            result["consoleExcerptSource"] = "Selected noncontiguous lines from native stdout."
        (evidence / f"{name}.excerpt.txt").write_text(result["consoleExcerpt"] + "\n")
        runs.append(result)
        print(f"{name}: exit {result['exitCode']}; {result['passedTests']} passed, "
              f"{result['failedTests']} failed, {result['skippedTests']} skipped; {elapsed:.2f}s", flush=True)

    capture("baseline", focused, 0, True)
    try:
        (clone / SOURCE).write_bytes(mutated)
        capture("regression", focused, 1, True)
    finally:
        (clone / SOURCE).write_bytes(source)
    capture("fixed", focused, 0, True)
    capture("finance-suite", suite, 0, False)
    require((clone / SOURCE).read_bytes() == source and (clone / TEST).read_bytes() == test,
            "Clone was not restored to its original source and test bytes.")
    # Static harness validation uses the unchanged checked-in manifest and source.
    validation_command = ["node", "--experimental-strip-types", "tools/impact/src/main.ts", "--validate-harness"]
    validation_start = time.monotonic()
    validation = subprocess.run(validation_command, cwd=clone, env=env, capture_output=True, text=True)
    (evidence / "harness-validation.stdout.txt").write_text(validation.stdout)
    (evidence / "harness-validation.stderr.txt").write_text(validation.stderr)
    (evidence / "harness-validation.command.txt").write_text(shell(validation_command) + "\n")
    require(validation.returncode == 0, "Static manifest validation failed.")
    validation_report = clone / "artifacts/harness/validation.json"
    require(validation_report.is_file(), "Static validation produced no diagnostic artifact.")
    require(json.loads(validation_report.read_text()) == {"errors": []},
            "Static validation diagnostic artifact contains errors.")
    shutil.copyfile(validation_report, evidence / "harness-validation.report.json.txt")
    require(all(sha((original / file).read_bytes()) == expected for file, expected in EXPECTED.items()),
            "Source checkout input hashes changed during capture.")
    summary = {
        "schemaVersion": 1,
        "bugTitle": "Deposit incorrectly earns commission",
        "disclosure": "Controlled injected regression in an isolated local clone of already-correct code. "
                      "The fix restores the original condition. This is real recorded test output; "
                      "it is not a newly discovered production defect or automated AI repair.",
        "recordedAt": datetime.now(timezone.utc).isoformat(), "sourceCommit": COMMIT,
        "ruleId": "FIN-002", "testId": TEST_ID, "testTitle": TITLE, "testFile": TEST, "testLine": 243,
        "expectedCommissionCents": 0,
        "actualBugCommissionCents": next(run["actualObservedCommissionCents"] for run in runs if run["id"] == "regression"),
        "depositCents": 2500,
        "settledPremiumCents": 101, "settledPremiumCommissionCents": 10,
        "redCodeCondition": BAD, "fixedCodeCondition": GOOD,
        "unchangedTestSha256": sha(test), "originalSourceSha256": sha(source),
        "regressionSourceSha256": sha(mutated), "pinnedFileHashes": EXPECTED,
        "runtime": {"nodeVersion": node_version, "nodeExecutable": node,
                    "vitestVersion": json.loads((clone / "node_modules/vitest/package.json").read_text())["version"]},
        "isolation": {"clone": str(clone), "sourceCheckout": str(original),
                      "dependencies": "Existing root node_modules symlink plus copied package-local pnpm link graph; "
                                      "workspace imports resolve inside clone; no install; Vitest cache disabled.",
                      "sourceCheckoutHashesUnchanged": True, "cloneSourceRestored": True},
        "selection": "Exact manifest-bound Vitest title and file through unchanged guarded canonical-runner.mjs. "
                     "No impact-selection claim; no full project completion gate claim.",
        "runs": runs,
        "presentation": {
            "label": "Replay of actual captured runs · controlled regression in an isolated copy",
            "regressionExcerpt": next(run["consoleExcerpt"] for run in runs if run["id"] == "regression"),
            "fixedExcerpt": next(run["consoleExcerpt"] for run in runs if run["id"] == "fixed"),
            "excerptNote": "Excerpts contain selected noncontiguous native-output lines; raw files are retained.",
            "regressionCondition": BAD, "fixedCondition": GOOD,
        },
        "harnessValidation": {"command": shell(validation_command), "exitCode": validation.returncode,
                              "reportFile": "harness-validation.report.json.txt",
                              "durationSeconds": round(time.monotonic() - validation_start, 3)},
    }
    write_json(evidence / "results.json", summary)
    # Raw native reports use .json.txt so repository formatting preserves them
    # byte-for-byte. Only our authored metadata receives repository formatting.
    biome = clone / "node_modules/.bin/biome"
    require(biome.is_file(), "Existing local Biome dependency is required for metadata formatting.")
    subprocess.run([str(biome), "format", "--write", str(evidence / "binding.json"),
                    str(evidence / "results.json")], cwd=clone, env=env,
                   check=True, capture_output=True)
    write_json(evidence / "evidence-sha256.json", {
        path.name: sha(path.read_bytes()) for path in sorted(evidence.iterdir())
        if path.is_file() and path.name != "evidence-sha256.json"
    })
    subprocess.run([str(biome), "format", "--write", str(evidence / "evidence-sha256.json")],
                   cwd=clone, env=env, check=True, capture_output=True)
    print(f"Evidence: {evidence / 'results.json'}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"CAPTURE FAILED: {error}", file=sys.stderr)
        raise
