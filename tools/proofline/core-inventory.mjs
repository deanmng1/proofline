const operator = /^(?:onboarding|reliability|repository-safeguards)(?:-[^/]+)?\.mjs$/;

/** One distribution boundary for Git-pinned adoption and runtime portability. */
export const selectReusableCorePaths = (paths) => {
  if (!Array.isArray(paths)) throw new Error("Source inventory must be an array");
  const seen = new Set();
  for (const file of paths) {
    if (
      typeof file !== "string" ||
      !file ||
      /[\\:]/.test(file) ||
      [...file].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      }) ||
      file.split("/").some((part) => !part || part === "." || part === "..") ||
      seen.has(file)
    )
      throw new Error(`Unsafe or duplicate source inventory path: ${JSON.stringify(file)}`);
    seen.add(file);
  }
  return paths
    .filter((file) => {
      const directory = ["tools/impact/", "tools/proofline/"].find((prefix) =>
        file.startsWith(prefix),
      );
      if (!directory) return false;
      const relative = file.slice(directory.length);
      return (
        !file.endsWith(".test.ts") &&
        !relative.startsWith("fixtures/") &&
        !(directory === "tools/proofline/" && relative.startsWith("test-fixtures/")) &&
        relative !== "project.json" &&
        !(directory === "tools/proofline/" && operator.test(relative))
      );
    })
    .sort();
};
