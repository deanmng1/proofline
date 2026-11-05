import ts from "typescript";

const program = ts.createProgram(
  [
    "client/test-globals.d.ts",
    "client/app.jsx",
    "client/main.jsx",
    "client/test-entry.jsx",
    "client/orders.mjs",
  ],
  {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
    esModuleInterop: true,
  },
);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  process.stderr.write(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getCanonicalFileName: (file) => file,
      getNewLine: () => "\n",
    }),
  );
  process.exitCode = 1;
} else process.stdout.write("Work-order application typecheck passed.\n");
