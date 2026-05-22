import test from "node:test"
import assert from "node:assert/strict"
import {
  addCompetingInterpretation,
  addContradiction,
  createUserEntry,
  editEntry,
  filterPublicEntries,
  proposeAppEntry,
  rejectEntry,
  resolveContradiction,
  setVisibility
} from "../src/index.mjs"

test("user entries default to accepted private verified memory", () => {
  const entry = createUserEntry({
    user_id: "user_123",
    title: "I prefer concise summaries",
    category: "reading",
    value: { note: "Show short summaries first." }
  })

  assert.equal(entry.source_type, "user")
  assert.equal(entry.status, "accepted")
  assert.equal(entry.visibility, "private")
  assert.equal(entry.user_verified, true)
  assert.equal(entry.confidence, 1)
})

test("app proposals default to pending private approval when important", () => {
  const entry = proposeAppEntry({
    user_id: "user_123",
    title: "Prefers concise summaries",
    category: "reading",
    importance: "important",
    confidence: 0.72
  })

  assert.equal(entry.source_type, "app")
  assert.equal(entry.status, "pending")
  assert.equal(entry.visibility, "private")
  assert.equal(entry.requires_approval, true)
})

test("edit preserves history and source", () => {
  const entry = createUserEntry({ title: "Original", category: "work", value: "one" })
  const edited = editEntry(entry, { title: "Updated" })

  assert.equal(edited.source_type, "user")
  assert.equal(edited.title, "Updated")
  assert.equal(edited.edit_history.length, 1)
})

test("reject changes status", () => {
  const entry = proposeAppEntry({ title: "Maybe likes long summaries", category: "reading" })
  const rejected = rejectEntry(entry, "not true")

  assert.equal(rejected.status, "rejected")
  assert.equal(rejected.requires_approval, false)
})

test("public filter hides private and rejected entries", () => {
  const privateEntry = createUserEntry({ title: "Private", category: "reading", value: "x" })
  const publicEntry = setVisibility(createUserEntry({ title: "Public", category: "reading", value: "x" }), "public")
  const rejected = rejectEntry(proposeAppEntry({ title: "Rejected", category: "reading" }))

  assert.deepEqual(filterPublicEntries([privateEntry, publicEntry, rejected]).map((entry) => entry.title), ["Public"])
})

test("contradictions and competing interpretations can be resolved", () => {
  const entry = createUserEntry({ title: "Prefers concise summaries", category: "reading", value: "x" })
  const withAlternative = addCompetingInterpretation(entry, {
    title: "Only for long articles",
    reason: "The signal appears on long articles.",
    confidence: 0.56
  })
  const contradicted = addContradiction(withAlternative, {
    title: "Another source disagrees.",
    source: "Reading app",
    reason: "Long explainers are often finished.",
    confidence: 0.67
  })
  const resolved = resolveContradiction(contradicted, { action: "keep_current" })

  assert.equal(withAlternative.competing_interpretations.length, 1)
  assert.equal(contradicted.contradictions.length, 1)
  assert.equal(resolved.status, "resolved")
  assert.equal(resolved.contradictions[0].resolved, true)
})
