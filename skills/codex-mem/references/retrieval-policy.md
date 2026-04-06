# Retrieval Policy

Use hybrid ranking based on metadata and full-text match.

## Primary Ranking Factors

1. Exact repo or cwd match
2. Full-text score from `FTS5`
3. Scope relevance
4. Tag overlap
5. Recency

## Result Quality Rules

- Prefer cards with explicit `decisions` or `constraints`.
- Down-rank archived cards.
- Merge near-duplicate cards during compaction instead of returning both.
- If all matches are weak, return fewer cards instead of padding the list.
