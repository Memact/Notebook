# Memact — Notebook

Memact is open identity infrastructure.

Users own an identity address, context, permissions, visibility, and approval authority.

## What Notebook Does

Notebook is the **user's identity dashboard** — the primary interface through which users exercise ownership over their identity context.

Notebook gives users:
- **Pending approval queue** — review observations contributed by apps, and approve, reject, edit, or defer each one
- **Identity context view** — see all approved context, organized by category, with confidence indicators, decay status, and contributing app attribution
- **Connected apps manager** — see which apps have access to which context, and revoke access at any time
- **Privacy controls** — set visibility rules, field-level access policies, and approval preferences

## User Ownership in Practice

When an app contributes an observation via CCP, it enters the user's pending queue in Notebook. Nothing becomes part of the user's approved identity context without the user's explicit action.

Approval options:

| Action | Meaning |
|---|---|
| **Approve** | Accept the observation as contributed |
| **Edit then approve** | Modify the value before accepting |
| **Reject** | Decline (kept as audit trail, not exposed to apps) |
| **Defer** | Decide later |

## What Notebook Is NOT

Notebook is not a note-taking application. It is not a wiki. It is not a data store. Notebook contains no identity data itself — it reads from and writes to Access and Memory through the protocol.

## License

Apache 2.0.
