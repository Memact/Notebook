# Memact Wiki

Memact Wiki is the user-controlled memory surface for Memact.

Consent asks before access. Wiki shows what exists after access.

Wiki entries can be added by the user, proposed by apps, proposed by Memact features, or created by Memact from approved activity. Users can accept, edit, reject, delete, or share entries.

The default visibility is private.

## What Wiki Entries Support

- Source trails
- App attribution
- User attribution
- Confidence
- Visibility
- User verification
- Expiry
- Edit history
- Contradictions
- Competing interpretations
- Important write approval
- Block app memory

## Entry Sources

- `user`: manually added by the user.
- `app`: proposed by a connected app.
- `memact`: created by Memact from approved activity.
- `memact_feature`: proposed by a Memact feature.

User-added entries are stronger than app-proposed entries by default. They start as accepted, private, verified memory.

App, Memact, and Memact feature proposals usually start as pending. Important writes need approval before they become accepted memory.

## Development

```powershell
npm install
npm run check
```
