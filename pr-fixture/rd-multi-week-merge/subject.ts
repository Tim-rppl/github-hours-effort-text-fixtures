export interface EffortNode {
  id: string;
  directEffort: number;
  dependencies: string[];
}

export function propagateEffort(
  node: EffortNode,
  dependencyEffort: number[],
  strategy: "bounded" | "decaying",
): number {
  if (node.directEffort < 0) throw new Error("Direct effort cannot be negative");
  const factor = strategy === "bounded" ? 0.25 : 0.15;
  const propagated = dependencyEffort.reduce((total, effort) => total + Math.max(0, effort) * factor, 0);
  return node.directEffort + Math.min(propagated, node.directEffort);
}
