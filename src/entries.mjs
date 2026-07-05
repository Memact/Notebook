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

export function calculateContextFreshness(entry, options = {}) {
  if (!entry || !entry.entry_id) {
    throw new Error("Valid entry required for decay calculations");
  }

  const currentTime = new Date(options.now || new Date()).getTime();
  const startTime = new Date(entry.created_at).getTime();
  
  // If no expiration is set, memory does not decay by default (stable context)
  if (!entry.expires_at) {
    return {
      entry_id: entry.entry_id,
      freshness: 1.0,
      decayLevel: 0.0,
      status: "stable"
    };
  }

  const endTime = new Date(entry.expires_at).getTime();
  const totalDuration = endTime - startTime;

  if (totalDuration <= 0) {
    return {
      entry_id: entry.entry_id,
      freshness: 0.0,
      decayLevel: 1.0,
      status: "expired"
    };
  }

  // Calculate elapsed progress
  const elapsed = currentTime - startTime;
  const progress = Math.max(0, Math.min(1, elapsed / totalDuration));
  
  const freshness = 1.0 - progress;
  const decayLevel = progress;

  let status = "fresh";
  if (freshness < 0.25) status = "critical";
  else if (freshness < 0.6) status = "fading";

  if (currentTime >= endTime || entry.status === "expired") {
    return {
      entry_id: entry.entry_id,
      freshness: 0.0,
      decayLevel: 1.0,
      status: "expired"
    };
  }

  return {
    entry_id: entry.entry_id,
    freshness: parseFloat(freshness.toFixed(4)),
    decayLevel: parseFloat(decayLevel.toFixed(4)),
    status: status
  };
}


export function exportEvidenceChainGraph(entry) {
  if (!entry || !entry.entry_id) {
    throw new Error("A valid entry is required to export an evidence graph");
  }

  const nodes = [];
  const edges = [];

  // 1. Core Entry Node
  nodes.push({
    id: entry.entry_id,
    label: entry.title,
    type: "entry",
    data: {
      status: entry.status,
      confidence: entry.confidence,
      category: entry.category,
      updated_at: entry.updated_at
    }
  });

  // 2. Source & Evidence Nodes
  if (Array.isArray(entry.sources)) {
    entry.sources.forEach((source, sIdx) => {
      const sourceId = `${entry.entry_id}_source_${sIdx}`;
      
      nodes.push({
        id: sourceId,
        label: source.name || "Source",
        type: "source",
        data: {
          source_type: source.type,
          confidence: source.confidence
        }
  });

      edges.push({
        id: `edge_${sourceId}_to_${entry.entry_id}`,
        source: sourceId,
        target: entry.entry_id,
        relationType: "PROPOSED_BY"
      });

      // Evidence strings tied to this source
      if (Array.isArray(source.evidence)) {
        source.evidence.forEach((evText, eIdx) => {
          const evidenceId = `${sourceId}_ev_${eIdx}`;
          nodes.push({
            id: evidenceId,
            label: evText,
            type: "evidence",
            data: {}
          });

          edges.push({
            id: `edge_${evidenceId}_to_${sourceId}`,
            source: evidenceId,
            target: sourceId,
            relationType: "SUBSTANTIATES"
          });
        });
      }
    });
  }

  // 3. Contradiction Nodes
  if (Array.isArray(entry.contradictions)) {
    entry.contradictions.forEach((contra, cIdx) => {
      const contraId = `${entry.entry_id}_contra_${cIdx}`;
      
      nodes.push({
        id: contraId,
        label: contra.title,
        type: "contradiction",
        data: {
          source: contra.source,
          reason: contra.reason,
          confidence: contra.confidence,
          resolved: contra.resolved
        }
      });

      edges.push({
        id: `edge_${contraId}_to_${entry.entry_id}`,
        source: contraId,
        target: entry.entry_id,
        relationType: contra.resolved ? "RESOLVED_CONTRADICTION" : "CONTRADICTS"
      });
    });
  }

  // 4. Competing Interpretation Nodes
  if (Array.isArray(entry.competing_interpretations)) {
    entry.competing_interpretations.forEach((interp, iIdx) => {
      const interpId = `${entry.entry_id}_interp_${iIdx}`;
      
      nodes.push({
        id: interpId,
        label: interp.title,
        type: "interpretation",
        data: {
          reason: interp.reason,
          confidence: interp.confidence
        }
      });

      edges.push({
        id: `edge_${interpId}_to_${entry.entry_id}`,
        source: interpId,
        target: entry.entry_id,
        relationType: "COMPETING_INTERPRETATION"
      });
    });
  }

  return {
    version: "1.0.0",
    entry_id: entry.entry_id,
    graph: { nodes, edges }
  };
}


export function generateAmbiguityResolutionPrompt(ambiguousTerm, suggestedMeanings = []) {
  if (!ambiguousTerm || typeof ambiguousTerm !== "string" || !ambiguousTerm.trim()) {
    throw new Error("An ambiguous term is required to generate a resolution wizard path");
  }

  const cleanTerm = ambiguousTerm.trim();
  
  // Format options for user clarity in the interface selection wizard
  const resolutionOptions = suggestedMeanings.map((meaning, index) => ({
    optionId: `split_opt_${index}_${Math.random().toString(36).slice(2, 6)}`,
    meaningDefinition: meaning.definition || "No definition provided",
    contextCategory: meaning.category || "other",
    actionPayload: {
      splitRequired: true,
      refinedTitle: `${cleanTerm} (${meaning.category || "refined"})`,
      suggestedCategory: meaning.category || "other"
    }
  }));

  return {
    wizardType: "HOMOGRAPH_SPLIT",
    targetTerm: cleanTerm,
    promptMessage: `The term "${cleanTerm}" appears ambiguous. Which context matches your intended entry?`,
    options: [
      ...resolutionOptions,
      {
        optionId: "split_opt_custom_new",
        meaningDefinition: "None of these. Create a brand new distinct meaning mapping.",
        contextCategory: "custom",
        actionPayload: {
          splitRequired: true,
          refinedTitle: `${cleanTerm} (custom)`,
          suggestedCategory: "other"
        }
      }
    ]
  };
}

export function calculateSourceAuthorityStats(entries = []) {
  const sourceStats = {};

  entries.forEach((entry) => {
    if (!entry || !Array.isArray(entry.sources)) return;

    entry.sources.forEach((source) => {
      const sourceKey = source.app_id || source.name || "Unknown Source";
      
      if (!sourceStats[sourceKey]) {
        sourceStats[sourceKey] = {
          sourceId: sourceKey,
          sourceName: source.name || "Unnamed Source",
          sourceType: source.type || entry.source_type,
          totalContributions: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          confidenceScores: []
        };
      }

      const stats = sourceStats[sourceKey];
      stats.totalContributions += 1;
      stats.confidenceScores.push(source.confidence ?? 0.5);

      if (["accepted", "edited", "resolved"].includes(entry.status)) {
        stats.acceptedCount += 1;
      } else if (entry.status === "rejected") {
        stats.rejectedCount += 1;
      }
    });
  });

  // Format and calculate averages for visualization chart layouts
  const chartLayoutData = Object.values(sourceStats).map((stats) => {
    const totalScores = stats.confidenceScores.reduce((sum, score) => sum + score, 0);
    const averageConfidence = stats.confidenceScores.length > 0 ? totalScores / stats.confidenceScores.length : 0.5;
    const reliabilityRate = stats.totalContributions > 0 ? stats.acceptedCount / stats.totalContributions : 0;

    return {
      sourceId: stats.sourceId,
      sourceName: stats.sourceName,
      sourceType: stats.sourceType,
      contributionCount: stats.totalContributions,
      authorityMetrics: {
        averageConfidence: parseFloat(averageConfidence.toFixed(4)),
        reliabilityRate: parseFloat(reliabilityRate.toFixed(4)),
        trustScore: parseFloat(((averageConfidence * 0.4) + (reliabilityRate * 0.6)).toFixed(4))
      }
    };
  });

  // Sort by contribution volume primarily to assist chart placement
  return chartLayoutData.sort((a, b) => b.contributionCount - a.contributionCount);
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



/**
 * Issue #22: Context Search and Filtering Interface Data Models
 * Filters a collection of entries based on query parameters
 */
export function filterNotebookEntries(entries = [], filters = {}) {
  const { category, appId, searchValue } = filters;

  return entries.filter((entry) => {
    if (!entry) return false;

    // 1. Filter by category if specified
    if (category && entry.category?.toLowerCase() !== category.toLowerCase()) {
      return false;
    }

    // 2. Filter by specific app source identifier
    if (appId) {
      const hasMatchingSource = entry.sources?.some(s => s.app_id === appId);
      if (!hasMatchingSource) return false;
    }

    // 3. Search deeply inside value fields
    if (searchValue) {
      const query = searchValue.toLowerCase();
      const matchString = JSON.stringify(entry.value || {}).toLowerCase();
      const matchId = (entry.entry_id || "").toLowerCase();
      
      if (!matchString.includes(query) && !matchId.includes(query)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Issue #21: Multi-Profile Identity Switcher Data Formats
 * Validates switching target namespaces for active user profiles
 */
export function switchProfileNamespace(currentProfiles = [], targetProfileId) {
  const profileExists = currentProfiles.find(p => p.profileId === targetProfileId);
  
  if (!profileExists) {
    throw new Error(`Target profile identity namespace '${targetProfileId}' not found.`);
  }

  return {
    activeProfileId: profileExists.profileId,
    namespace: profileExists.namespace || "global",
    scopeRules: profileExists.scopeRules || { isolationLevel: "strict" },
    switchedAt: new Date().toISOString()



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


/**
 * Issue #30: Interactive Onboarding Flow for Context Settings
 * Generates configuration steps and default preference presets for onboarding flows.
 */
export function generateOnboardingFlowConfig() {
  return {
    flowId: "onboarding_context_v1",
    totalSteps: 3,
    defaultPresets: {
      defaultVisibility: "private",
      globalMemoryDecay: "stable",
      autoSyncApps: true,
      allowProgressiveDisclosure: true
    },
    steps: [
      {
        stepNumber: 1,
        stepKey: "PRIVACY_CONFIG",
        title: "Configure Context Privacy",
        description: "Choose how your application memory is stored. By default, entries remain strictly private.",
        options: [
          { value: "private", label: "Strictly Private (Local-First)", selected: true },
          { value: "public", label: "Shared/Public Context Block", selected: false }
        ]
      },
      {
        stepNumber: 2,
        stepKey: "DECAY_PREFERENCE",
        title: "Memory Persistence Levels",
        description: "Define how long peripheral context claims persist before experiencing memory decay.",
        options: [
          { value: "stable", label: "Persistent (No Expiration)", selected: true },
          { value: "ephemeral", label: "Fading Context (30-day decay window)", selected: false }
        ]
      },
      {
        stepNumber: 3,
        stepKey: "APP_INTEGRATIONS",
        title: "Authorized Source Connections",
        description: "Enable automatic protocol contribution updates from authorized internal applications.",
        options: [
          { value: "auto_approve", label: "Auto-Accept Claims", selected: false },
          { value: "manual_review", label: "Review via Inbox Wizard", selected: true }
        ]
      }
    ]
  };
}


/**
 * Issue #31: UI Specifications for Context Modification History Logs
 * Transforms raw modification timelines into structured row data for UI tables.
 */
export function formatModificationHistoryLogs(entry) {
  if (!entry || !Array.isArray(entry.history)) {
    return [];
  }

  return entry.history.map((log, index) => {
    return {
      rowId: `log_${entry.entry_id || "entry"}_${index}`,
      timestamp: log.timestamp || new Date().toISOString(),
      appName: log.app_id || log.source_name || "System Core",
      modifiedField: log.field || "all_fields",
      changes: {
        previousValue: log.old_value !== undefined ? log.old_value : null,
        newValue: log.new_value !== undefined ? log.new_value : null,
        actionType: log.action || "UPDATE"
      }
    };
  });
}

}