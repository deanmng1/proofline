// A nested registration owns its descendants; a parent registration owns the remainder.
// Equal most-specific roots are genuinely ambiguous and must never depend on array order.
export const resolveWorkspace = <T extends { path: string }>(
  file: string,
  workspaces: T[],
): T | undefined => {
  const matches = workspaces.filter((workspace) => file.startsWith(`${workspace.path}/`));
  const longest = Math.max(...matches.map((workspace) => workspace.path.length));
  const owners = matches.filter((workspace) => workspace.path.length === longest);
  if (owners.length > 1) throw new Error(`Ambiguous workspace for ${file}`);
  return owners[0];
};
