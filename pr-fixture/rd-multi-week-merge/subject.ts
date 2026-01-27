export interface EffortNode {
  id: string;
  directEffort: number;
  dependencies: string[];
}

export function propagateEffort(node: EffortNode, dependencyEffort: number[], isCyclic: boolean): number {
  const propagated = dependencyEffort.reduce((total, effort) => total + effort * 0.25, 0);
  return node.directEffort + (isCyclic ? Math.min(propagated, node.directEffort) : propagated);
}
