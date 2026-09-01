type RepairCandidate = {
  movementPenalty: number;
  totalPenalty: number;
};

export function rankBoundedRepairs<T extends RepairCandidate>(
  alternatives: T[],
  maximumAdditionalMoves = 5,
  limit = 3,
): T[] {
  return alternatives
    .filter(
      (alternative) =>
        alternative.movementPenalty <= maximumAdditionalMoves + 1,
    )
    .sort(
      (left, right) =>
        left.movementPenalty - right.movementPenalty ||
        left.totalPenalty - right.totalPenalty,
    )
    .slice(0, limit);
}
