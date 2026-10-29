import { readFileSync } from "node:fs";
import path from "node:path";

type WorkflowEvidence = {
  rowId: string;
  commandKey: string;
  file: string;
  title: string;
  line: number;
  tag: string;
  ruleIds: string[];
};

type WorkflowRow = {
  id: string;
  status: "planned" | "implemented" | "excluded";
  ruleIds: string[];
  evidence: WorkflowEvidence[];
};

const matrix = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, "../../../../test-impact/workflows/crm-golden.json"),
    "utf8",
  ),
) as { rows: WorkflowRow[] };

const sameRules = (actual: readonly string[], expected: readonly string[]) =>
  actual.length === expected.length &&
  [...actual].sort().every((rule, index) => rule === [...expected].sort()[index]);

export function bindWorkflowEvidence(binding: Omit<WorkflowEvidence, "commandKey">): void {
  const row = matrix.rows.find((candidate) => candidate.id === binding.rowId);
  if (row?.status !== "implemented")
    throw new Error(`Workflow ${binding.rowId} is not an implemented golden row.`);
  if (!sameRules(row.ruleIds, binding.ruleIds))
    throw new Error(`Workflow ${binding.rowId} rule IDs drifted from its executable spec.`);
  const evidence = row.evidence.filter(
    (candidate) =>
      candidate.rowId === binding.rowId &&
      candidate.file === binding.file &&
      candidate.title === binding.title &&
      candidate.line === binding.line &&
      candidate.tag === binding.tag,
  );
  if (evidence.length !== 1 || !sameRules(evidence[0].ruleIds, binding.ruleIds))
    throw new Error(`Workflow ${binding.rowId} exact test evidence is missing or stale.`);
}
