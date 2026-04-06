# Memory Schema

Each memory card represents one durable unit of reusable context.

## Required Fields

- `id`
- `scope`
- `title`
- `summary`
- `facts`
- `decisions`
- `constraints`
- `tags`
- `created_at`
- `updated_at`

## Optional Fields

- `cwd`
- `repo_root`
- `file_refs`
- `source_session`
- `source_kind`
- `confidence`

## Scope Values

- `global`
- `project`
- `repo`
- `task`

## Authoring Rules

- Keep `summary` to one or two sentences.
- Put concrete facts in `facts`.
- Put chosen tradeoffs in `decisions`.
- Put hard limits or do-not-do rules in `constraints`.
- Use `tags` for retrieval hints, not prose.
