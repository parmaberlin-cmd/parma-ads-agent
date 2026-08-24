function pushUnique(list, item) {
  if (!list.some((existing) => existing.code === item.code)) list.push(item);
}

function boolTracking(value, key) {
  if (value && typeof value === 'object') return value[key] === true;
  return value === true;
}

function buildReadinessActionPlan({ summary = {}, promotion = {}, minShadowRuns = 14 } = {}) {
  const actions = [];
  const sources = summary.source_health || {};
  const tracking = summary.tracking || {};
  const history = summary.history || {};
  const integrity = summary.conversion_integrity || {};
  const totalRuns = Number(history.total_runs || 0);

  if (sources.google !== true) pushUnique(actions, {
    code: 'VERIFY_GOOGLE_LIVE_ACCESS',
    category: 'external_or_runtime',
    priority: 'critical',
    automatic: true,
    requires_human: false,
    done_when: 'source_health.google=true',
  });

  if (integrity.status !== 'healthy' || integrity.optimization_allowed !== true) pushUnique(actions, {
    code: 'VALIDATE_CONVERSION_INTEGRITY',
    category: 'measurement',
    priority: 'critical',
    automatic: true,
    requires_human: false,
    done_when: 'conversion_integrity=healthy_and_optimization_allowed',
  });

  if (boolTracking(tracking.reservation_start, 'configured') && !boolTracking(tracking.reservation_start, 'observed')) pushUnique(actions, {
    code: 'OBSERVE_RESERVATION_START',
    category: 'evidence',
    priority: 'high',
    automatic: true,
    requires_human: false,
    done_when: 'reservation_start.observed=true',
  });

  if (history.storage?.healthy !== true) pushUnique(actions, {
    code: 'REPAIR_SHADOW_HISTORY_HEALTH',
    category: 'software_or_runtime',
    priority: 'critical',
    automatic: false,
    requires_human: false,
    done_when: 'history.storage.healthy=true',
  });

  if (history.storage?.durable !== true) pushUnique(actions, {
    code: 'ATTACH_DURABLE_SHADOW_STORAGE',
    category: 'infrastructure',
    priority: 'high',
    automatic: false,
    requires_human: true,
    done_when: 'history.storage.durable=true',
  });

  if (!Number.isFinite(totalRuns) || totalRuns < minShadowRuns) pushUnique(actions, {
    code: 'ACCUMULATE_SHADOW_RUNS',
    category: 'evidence',
    priority: 'high',
    automatic: true,
    requires_human: false,
    current: Number.isFinite(totalRuns) ? totalRuns : 0,
    required: minShadowRuns,
    remaining: Math.max(0, minShadowRuns - (Number.isFinite(totalRuns) ? totalRuns : 0)),
    done_when: `history.total_runs>=${minShadowRuns}`,
  });

  const blockers = Array.isArray(promotion.blockers) ? promotion.blockers : [];
  if (blockers.some((value) => /meta/i.test(String(value)))) pushUnique(actions, {
    code: 'COMPLETE_META_SUPERVISED_VALIDATION',
    category: 'meta',
    priority: 'high',
    automatic: false,
    requires_human: true,
    done_when: 'meta_promotion_gate=true',
  });

  if (promotion.promotion_ready !== true) pushUnique(actions, {
    code: 'COMPLETE_SUPERVISED_PROMOTION_GATES',
    category: 'promotion',
    priority: 'medium',
    automatic: true,
    requires_human: false,
    done_when: 'promotion_ready=true',
  });

  const humanActions = actions.filter((item) => item.requires_human === true);
  const automaticActions = actions.filter((item) => item.automatic === true);

  return {
    complete: actions.length === 0,
    total_remaining: actions.length,
    automatic_remaining: automaticActions.length,
    human_remaining: humanActions.length,
    next_automatic: automaticActions[0]?.code || null,
    next_human: humanActions[0]?.code || null,
    actions,
    writes_allowed: false,
    spend_allowed: false,
    activation_allowed: false,
  };
}

module.exports = { boolTracking, buildReadinessActionPlan };
