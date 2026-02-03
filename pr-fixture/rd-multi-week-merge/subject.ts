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
  const factor = strategy === "bounded" ? 0.25 : 0.15;
  const propagated = dependencyEffort.reduce((total, effort) => total + effort * factor, 0);
  return node.directEffort + Math.min(propagated, node.directEffort);
}
