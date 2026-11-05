import { writeFileSync } from "node:fs";
// Native Vitest event objects retain expected-failure, retries and project identity that JSON loses.
export default class ProoflineNativeReporter {
  onTestRunEnd(modules, unhandledErrors, reason) {
    const tests = modules.flatMap((module) =>
      [...module.children.allTests()].map((test) => ({
        file: module.moduleId,
        title: test.fullName,
        project: test.project.name,
        status: test.result().state,
        expectedStatus: test.options.fails ? "failed" : "passed",
        retry: test.diagnostic()?.retryCount ?? 0,
        repeats: test.diagnostic()?.repeatCount ?? 0,
        mode: test.options.mode,
      })),
    );
    if (!process.env.PROOFLINE_NATIVE_EVENTS)
      throw new Error("Missing invocation sidecar destination");
    writeFileSync(
      process.env.PROOFLINE_NATIVE_EVENTS,
      JSON.stringify({ version: 1, tests, reason, unhandledErrors }, null, 2),
    );
  }
}
