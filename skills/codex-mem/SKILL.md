---
name: codex-mem
description: Persistent memory workflow for Codex. Use when the user wants to remember project conventions, save durable facts from a session, recall prior decisions, retrieve user preferences, continue long-running work across sessions, or compact a completed session into reusable memory cards.
---

# Codex Mem

Use this skill to manage durable memory for Codex work.

This skill orchestrates memory workflows only. Keep storage, indexing, and retrieval logic in scripts or MCP tools.

## Operations

Use one of these operations:

1. `remember`
2. `recall`
3. `compact-session`

## Selection Rules

Use `remember` when:

- the user explicitly says to remember something
- the agent discovers a stable repo convention worth preserving
- the user shares a durable preference or standing constraint

Use `recall` when:

- the user asks what was decided before
- the user asks to continue earlier work
- prior project context would materially reduce repeated discovery

Use `compact-session` when:

- a long session has ended
- the session produced reusable decisions, facts, or constraints
- the user asks to save the useful parts of the current session

## Workflow

1. Extract only stable and reusable information.
2. Exclude ephemeral details unless the user explicitly wants them preserved.
3. Prefer concise, factual summaries.
4. Tag memory cards with repo- or domain-relevant labels.
5. Merge duplicates when possible.

## CLI Contracts

### `remember`

Inputs:

- `--title`
- `--summary`
- `--scope`
- `--cwd`
- `--repo-root`
- `--fact` repeatable
- `--decision` repeatable
- `--constraint` repeatable
- `--tag` repeatable
- `--file-ref` repeatable
- `--source-session` optional

### `recall`

Inputs:

- `--query`
- `--cwd`
- `--repo-root` optional
- `--scope` optional
- `--limit` optional

### `compact-session`

Inputs:

- `--session-id`
- `--cwd`
- `--repo-root` optional
- `--mode` with values `manual` or `end_of_session`

## References

- Read [memory-schema.md](./references/memory-schema.md) before changing the storage shape.
- Read [retrieval-policy.md](./references/retrieval-policy.md) before changing ranking behavior.

## Safety Rules

- Do not store secrets, tokens, or credentials.
- Do not preserve sensitive user data unless the user explicitly asks and policy allows it.
- Do not treat speculative inferences as durable facts.
- Prefer updating an existing memory over creating duplicates.
