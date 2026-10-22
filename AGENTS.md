<!-- dev-memory:start -->
## Dev Memory

This project enables the `dev-memory` Skill. Read its SKILL.md when available.
- Maintain docs/dev-memory/HISTORY.md (events and verification), DECISIONS.md
  (choices and lasting constraints), and KNOWLEDGE.md (reusable lessons) as
  valuable information appears. Keep one authoritative explanation; cross-reference it.
- Distinguish proposed/accepted/rejected/superseded decisions, user choices,
  agent choices, and retrospective inference. Never invent historical reasons.
- Follow git_policy in .dev-memory.json and current user instructions. The default
  commit-complete-task-with-records policy commits a coherent, appropriately verified
  small task to local Git, using explicit task paths and the memory_git setting below.
  Preserve any user-chosen policy. Inspect the index first; never include unrelated
  staged work or bypass checks.
- Save attempted approaches and evidence; distinguish implemented from verified.
- For handoff, checkpoint the current goal, latest user constraints, progress,
  verification and next action. A snapshot does not transfer uncommitted files.
- Read only relevant entries. Hooks only prompt the current agent; they never
  interpret conversations, create another agent, or run Git commits.
- Current user boundaries override this workflow. If the user requests read-only,
  no writes, no commit, or stop, honor that even when a hook requests a check.
- memory_git in .dev-memory.json overrides instructions to commit records:
  local keeps docs/dev-memory/ out of Git; tracked permits committing the records.
  Never force-add local memory or copy its contents into commit messages.
<!-- dev-memory:end -->
