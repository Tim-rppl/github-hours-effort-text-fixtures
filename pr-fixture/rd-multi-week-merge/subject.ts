export interface EffortNode {
  id: string;
  directEffort: number;
  dependencies: string[];
}

export function propagateEffort(node: EffortNode, dependencyEffort: number[]): number {
  return node.directEffort + dependencyEffort.reduce((total, effort) => total + effort * 0.25, 0);
}
