const SOURCE_TYPES = new Set(["user", "app", "memact", "memact_feature"])
const STATUSES = new Set(["draft", "pending", "accepted", "edited", "rejected", "expired", "deleted", "contradicted", "resolved"])
const VISIBILITIES = new Set(["private", "shareable", "public"])
const IMPORTANCE = new Set(["low", "normal", "important"])
// Define UI progressive disclosure layout visibility categories rules
const CATEGORY_LAYOUT_SCHEMAS = {
  profile: {
    essential: ["name", "email", "bio"],
    advanced: ["api_keys", "session_tokens", "metadata"],
    defaultVisibility: "collapsed"
  },
  preferences: {
    essential: ["theme", "language", "notifications"],
    advanced: ["webhook_urls", "custom_css"],
    defaultVisibility: "visible"
  },
  other: {
    essential: ["note"],
    advanced: [],
    defaultVisibility: "visible"
  }
};

export function createUserEntry(input = {}) {
  return createEntry({
    ...input,
    source_type: "user",
    confidence: input.confidence ?? 1,
    user_verified: true,
    visibility: input.visibility || "private",
    status: "accepted",
    importance: input.importance || "normal",
    requires_approval: false,
    sources: input.sources?.length ? input.sources : [{
      type: "user",
      name: input.source_name || "You",
      confidence: input.confidence ?? 1,
      evidence: [input.source_note || "manual user entry"]
    }]
  })
}

export function proposeAppEntry(input = {}) {
  return createProposedEntry({ ...input, source_type: "app" })
}

export function proposeMemactEntry(input = {}) {
  return createProposedEntry({ ...input, source_type: "memact" })
}

export function proposeMemactFeatureEntry(input = {}) {
  return createProposedEntry({ ...input, source_type: "memact_feature" })
}

export function proposePlaygroundEntry(input = {}) {
  return proposeMemactFeatureEntry(input)
}

export function acceptEntry(entry, options = {}) {
  return withHistory(entry, {
    ...entry,
    status: "accepted",
    user_verified: true,
    requires_approval: false,
    visibility: normalizeVisibility(options.visibility || entry.visibility || "private"),
    updated_at: now(options.now)
  }, "accept", options.reason || "accepted by user")
}

export function editEntry(entry, patch = {}, options = {}) {
  const next = {
    ...entry,
    ...patch,
    source_type: entry.source_type,
    entry_id: entry.entry_id,
    user_id: entry.user_id,
    status: patch.status || "edited",
    updated_at: now(options.now)
  }
  if (patch.visibility) next.visibility = normalizeVisibility(patch.visibility)
  return withHistory(entry, next, "edit", options.reason || "edited by user")
}

export function rejectEntry(entry, reason = "rejected by user", options = {}) {
  return withHistory(entry, {
    ...entry,
    status: "rejected",
    requires_approval: false,
    resolution: { action: "rejected", reason },
    updated_at: now(options.now)
  }, "reject", reason)
}

export function deleteEntry(entry, reason = "deleted by user", options = {}) {
  return withHistory(entry, {
    ...entry,
    status: "deleted",
    resolution: { action: "deleted", reason },
    updated_at: now(options.now)
  }, "delete", reason)
}

export function setVisibility(entry, visibility, options = {}) {
  return withHistory(entry, {
    ...entry,
    visibility: normalizeVisibility(visibility),
    updated_at: now(options.now)
  }, "visibility", `visibility changed to ${visibility}`)
}

export function addCompetingInterpretation(entry, interpretation = {}, options = {}) {
  return withHistory(entry, {
    ...entry,
    competing_interpretations: [
      ...(entry.competing_interpretations || []),
      {
        title: String(interpretation.title || "").trim(),
        reason: String(interpretation.reason || "").trim(),
        confidence: clampConfidence(interpretation.confidence ?? 0.5)
      }
    ],
    updated_at: now(options.now)
  }, "competing_interpretation.add", "added competing interpretation")
}

export function addContradiction(entry, contradiction = {}, options = {}) {
  return withHistory(entry, {
    ...entry,
    status: entry.status === "accepted" ? "contradicted" : entry.status,
    contradictions: [
      ...(entry.contradictions || []),
      {
        title: String(contradiction.title || "Another source disagrees.").trim(),
        source: String(contradiction.source || "").trim(),
        reason: String(contradiction.reason || "").trim(),
        confidence: clampConfidence(contradiction.confidence ?? 0.5),
        resolved: false
      }
    ],
    updated_at: now(options.now)
  }, "contradiction.add", "added contradiction")
}

export function resolveContradiction(entry, resolution = {}, options = {}) {
  return withHistory(entry, {
    ...entry,
    status: "resolved",
    contradictions: (entry.contradictions || []).map((item) => ({ ...item, resolved: true })),
    resolution: {
      action: resolution.action || "keep_current",
      note: resolution.note || "resolved by user"
    },
    updated_at: now(options.now)
  }, "contradiction.resolve", resolution.note || "resolved by user")
}

export function markExpired(entry, options = {}) {
  return withHistory(entry, {
    ...entry,
    status: "expired",
    updated_at: now(options.now)
  }, "expire", "entry expired")
}

export function blockAppMemory(appId, reason = "") {
  return {
    app_id: String(appId || "").trim(),
    blocked: true,
    reason: String(reason || "").trim(),
    created_at: now()
  }
}

export function filterPublicEntries(entries = []) {
  return entries.filter((entry) => (
    ["shareable", "public"].includes(entry.visibility)
    && ["accepted", "edited", "resolved"].includes(entry.status)
    && !entry.deleted_at
  )).map((entry) => ({
    entry_id: entry.entry_id,
    title: entry.title,
    category: entry.category,
    value: entry.value,
    visibility: entry.visibility,
    source_type: safePublicSource(entry.source_type),
    user_verified: Boolean(entry.user_verified),
    updated_at: entry.updated_at
  }))
}

export function getInboxStats(entries = []) {
  const stats = {
    pending: 0,
    junk: 0,
    approved: 0,
    total: entries.length
  }

  for (const entry of entries) {
    if (entry.status === "pending") stats.pending += 1
    else if (entry.status === "rejected" || entry.status === "expired") stats.junk += 1
    else if (["accepted", "edited", "resolved"].includes(entry.status)) stats.approved += 1
  }

  return stats
}

export function explainWhyEntryExists(entry) {
  const source = entry.sources?.[0]
  if (!source) return "This entry exists because it was added to your Notebook."
  if (entry.source_type === "user") return "You added this memory."
  if (entry.source_type === "app") return `${source.name || "An app"} proposed this memory from allowed activity.`
  if (entry.source_type === "memact_feature") return `${source.name || "A Memact feature"} proposed this memory.`
  return "Memact created this memory from allowed activity."
}

function createProposedEntry(input = {}) {
  const confidence = clampConfidence(input.confidence ?? input.sources?.[0]?.confidence ?? 0.5)
  const importance = normalizeImportance(input.importance || (confidence < 0.7 ? "important" : "normal"))
  const visibility = normalizeVisibility(input.visibility || "private")
  return createEntry({
    ...input,
    confidence,
    importance,
    visibility,
    status: input.status || "pending",
    user_verified: false,
    requires_approval: input.requires_approval ?? shouldRequireApproval({ ...input, confidence, importance, visibility }),
    sources: input.sources?.length ? input.sources : [{
      type: input.source_type,
      app_id: input.app_id,
      name: input.source_name || input.app_name || sourceLabel(input.source_type),
      confidence,
      evidence: input.evidence || []
    }]
  })
}

function createEntry(input = {}) {
  const createdAt = now(input.now)
  const sourceType = normalizeSourceType(input.source_type)
  return {
    entry_id: input.entry_id || id("notebook_entry"),
    user_id: String(input.user_id || "").trim(),
    title: requiredText(input.title, "title"),
    category: String(input.category || "other").trim().toLowerCase(),
    value: input.value && typeof input.value === "object" ? input.value : { note: String(input.value || "").trim() },
    source_type: sourceType,
    sources: normalizeSources(input.sources || [], sourceType),
    confidence: clampConfidence(input.confidence ?? 0.5),
    user_verified: Boolean(input.user_verified),
    visibility: normalizeVisibility(input.visibility || "private"),
    status: normalizeStatus(input.status || "pending"),
    importance: normalizeImportance(input.importance || "normal"),
    requires_approval: Boolean(input.requires_approval),
    competing_interpretations: Array.isArray(input.competing_interpretations) ? input.competing_interpretations : [],
    contradictions: Array.isArray(input.contradictions) ? input.contradictions : [],
    resolution: input.resolution || null,
    edit_history: Array.isArray(input.edit_history) ? input.edit_history : [],
    expires_at: input.expires_at || null,
    created_at: input.created_at || createdAt,
    updated_at: input.updated_at || createdAt
  }
}

function shouldRequireApproval(entry) {
  return entry.importance === "important"
    || entry.visibility === "shareable"
    || entry.visibility === "public"
    || entry.confidence < 0.75
    || Boolean(entry.contradictions?.length)
}

function withHistory(previous, next, action, reason) {
  return {
    ...next,
    edit_history: [
      ...(previous.edit_history || []),
      {
        action,
        reason,
        changed_at: next.updated_at,
        previous_status: previous.status,
        previous_visibility: previous.visibility
      }
    ]
  }
}

function normalizeSources(sources, sourceType) {
  return sources.map((source) => ({
    type: normalizeSourceType(source.type || sourceType),
    app_id: source.app_id,
    name: String(source.name || sourceLabel(source.type || sourceType)).trim(),
    confidence: clampConfidence(source.confidence ?? 0.5),
    evidence: Array.isArray(source.evidence) ? source.evidence.map(String) : []
  }))
}

function normalizeSourceType(value) {
  const clean = String(value || "").trim()
  if (clean === "playground_feature") return "memact_feature"
  return SOURCE_TYPES.has(clean) ? clean : "memact"
}

function normalizeStatus(value) {
  const clean = String(value || "").trim()
  return STATUSES.has(clean) ? clean : "pending"
}

function normalizeVisibility(value) {
  const clean = String(value || "").trim()
  return VISIBILITIES.has(clean) ? clean : "private"
}

function normalizeImportance(value) {
  const clean = String(value || "").trim()
  return IMPORTANCE.has(clean) ? clean : "normal"
}

function clampConfidence(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0.5
  return Math.max(0, Math.min(1, number))
}

function requiredText(value, field) {
  const clean = String(value || "").trim()
  if (!clean) throw new Error(`${field} is required`)
  return clean
}

function sourceLabel(sourceType) {
  if (sourceType === "user") return "You"
  if (sourceType === "app") return "Connected app"
  if (sourceType === "memact_feature") return "Memact feature"
  return "Memact"
}

function safePublicSource(sourceType) {
  return sourceType === "user" ? "user" : sourceType
}

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function now(customNow) {
  return customNow ? new Date(customNow).toISOString() : new Date().toISOString()
}

/**
 * Issue #28: Dynamic Context Summary Cards for Quick Review
 * Formats context updates into structured human-readable text cards.
 */
export function generateContextSummaryCard(entry) {
  if (!entry || !entry.entry_id) {
    throw new Error("Invalid entry provided for generating summary cards");
  }

  const category = entry.category || "unknown";
  const sourceName = entry.sources?.[0]?.name || "System Core";
  const timestamp = entry.updated_at || entry.created_at || new Date().toISOString();
  
  // Condense the value keys into a human-readable list string
  const modifiedFields = entry.value && typeof entry.value === "object" 
    ? Object.keys(entry.value).join(", ") 
    : "no payload fields";

  const cardTitle = `Update in [${category.toUpperCase()}] via ${sourceName}`;
  const cardBody = `Entry ID: ${entry.entry_id} updated key variables: [${modifiedFields}].`;
  const footerTimestamp = new Date(timestamp).toLocaleString();

  return {
    cardId: `card_${entry.entry_id}_${Math.random().toString(36).slice(2, 6)}`,
    layoutType: "SUMMARY_CARD",
    displaySchema: {
      title: cardTitle,
      body: cardBody,
      footer: `Refreshed on: ${footerTimestamp}`,
      badgeStyle: entry.status === "critical" ? "danger" : "info"

export function applyProgressiveDisclosureSchema(entry) {
  if (!entry || !entry.category) {
    throw new Error("Invalid entry provided for schema mapping");
  }

  const category = entry.category.toLowerCase();
  const schema = CATEGORY_LAYOUT_SCHEMAS[category] || CATEGORY_LAYOUT_SCHEMAS["other"];
  
  const valueFields = entry.value && typeof entry.value === "object" ? Object.keys(entry.value) : [];
  const fieldsMetadata = {};

  valueFields.forEach((field) => {
    let preference = "advanced"; // Default fallback if unspecified
    
    if (schema.essential.includes(field)) {
      preference = "essential";
    } else if (schema.advanced.includes(field)) {
      preference = "advanced";
    }

    fieldsMetadata[field] = {
      visibilityPreference: preference,
      initialDisplay: preference === "essential" ? "visible" : schema.defaultVisibility
    };
  });

  return {
    entry_id: entry.entry_id,
    category: category,
    uiSchema: {
      defaultLayout: schema.defaultVisibility,
      fields: fieldsMetadata
    }
  };
}