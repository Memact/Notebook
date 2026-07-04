import test from "node:test"
import assert from "node:assert/strict"
import {
  createUserEntry,
  proposeAppEntry,
  rejectEntry,
  markExpired,
  getInboxStats
} from "../src/index.mjs"

test("getInboxStats counts pending, junk, and approved entries", () => {
  const approved = createUserEntry({ title: "Approved one", category: "work", value: "x" })
  const pending = proposeAppEntry({ title: "Pending one", category: "work" })
  const rejected = rejectEntry(proposeAppEntry({ title: "Rejected one", category: "work" }))
  const expired = markExpired(proposeAppEntry({ title: "Expired one", category: "work" }))

  const stats = getInboxStats([approved, pending, rejected, expired])

  assert.equal(stats.pending, 1)
  assert.equal(stats.junk, 2)
  assert.equal(stats.approved, 1)
  assert.equal(stats.total, 4)
})

test("getInboxStats returns zeros for an empty inbox", () => {
  const stats = getInboxStats([])
  assert.deepEqual(stats, { pending: 0, junk: 0, approved: 0, total: 0 })
})

test("getInboxStats defaults to empty array when no entries passed", () => {
  const stats = getInboxStats()
  assert.deepEqual(stats, { pending: 0, junk: 0, approved: 0, total: 0 })
})
