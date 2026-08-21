const APPROVAL_TOKEN = "CREATE_PARMA_META_DRAFT_PAUSED_ONLY";
const ONE_SHOT_TRIGGER = "RUN_PARMA_META_DRAFT_PAUSED_ONLY_ONCE";
const RESERVATION_URL = "https://www.parmaberlin.de/reservations";

class PartialMetaDraftError extends Error {
  constructor(message, created, stage, cause, reused = {}) {
    super(message, { cause });
    this.name = "PartialMetaDraftError";
    this.created = { ...created };
    this.stage = stage;
    this.reused = { ...reused };
  }
}

function requireNumericId(value, label) {
  const id = String(value || "").trim();
  if (!/^\d{1,30}$/.test(id)) {
    throw new TypeError(`${label} must contain 1 to 30 digits`);
  }
  return id;
}

function requireCoordinate(value, label, minimum, maximum) {
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < minimum || coordinate > maximum) {
    throw new TypeError(`${label} must be between ${minimum} and ${maximum}`);
  }
  return coordinate;
}

function requireIsoDate(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${label} must be a valid date`);
  }
  return date;
}

function requireDsaDeclaration(value, label) {
  const declaration = String(value || "").trim();
  if (declaration.length < 2 || declaration.length > 100) {
    throw new TypeError(`${label} must contain between 2 and 100 characters`);
  }
  if (/[\r\n\t]/.test(declaration)) {
    throw new TypeError(`${label} must be a single line`);
  }
  return declaration;
}

function toMetaCents(eur) {
  const amount = Number(eur);
  if (!Number.isFinite(amount) || amount < 3 || amount > 20) {
    throw new TypeError("dailyBudgetEur must be between 3 and 20");
  }
  return Math.round(amount * 100);
}

function assertPausedOnly(value, path = "draft") {
  if (typeof value === "string" && value.toUpperCase() === "ACTIVE") {
    throw new Error(`${path} must never contain ACTIVE status`);
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPausedOnly(item, `${path}[${index}]`));
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      assertPausedOnly(item, `${path}.${key}`)
    );
  }
}

function shouldRunPausedDraftOneShot({ trigger, writeGateEnabled }) {
  return trigger === ONE_SHOT_TRIGGER && writeGateEnabled === true;
}

function getInstagramReelCode(permalink) {
  let url;
  try {
    url = new URL(permalink);
  } catch {
    throw new TypeError("reelPermalink must be a valid Instagram Reel URL");
  }

  const hostname = url.hostname.toLowerCase();
  const match = url.pathname.match(/^\/reel\/([A-Za-z0-9_-]+)\/?$/);
  if (!(hostname === "instagram.com" || hostname === "www.instagram.com") || !match) {
    throw new TypeError("reelPermalink must be a valid Instagram Reel URL");
  }
  return match[1];
}

async function discoverInstagramReelAssets({
  transport,
  adAccountId,
  instagramUsername = "parma.divinibenedetti",
  reelPermalink,
  maxPages = 10,
}) {
  if (!transport || typeof transport.get !== "function") {
    throw new TypeError("transport must provide a get function");
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) {
    throw new TypeError("maxPages must be an integer between 1 and 20");
  }

  const normalizedAdAccountId = String(adAccountId || "").trim();
  if (!/^act_\d{1,30}$/.test(normalizedAdAccountId)) {
    throw new TypeError("adAccountId must use the act_<digits> format");
  }

  const reelCode = getInstagramReelCode(reelPermalink);
  const expectedUsername = String(instagramUsername || "").trim().toLowerCase();
  const candidatePages = [];
  const discoveryFailures = [];
  const classifyFailure = (stage, error) => {
    const graphError = error?.response?.data?.error || error;
    const code = Number(graphError?.code);
    const message = String(graphError?.message || "").toLowerCase();
    const reason =
      [10, 100, 200, 294].includes(code) || message.includes("permission")
        ? "permission_denied"
        : "unavailable";
    discoveryFailures.push(`${stage}=${reason}`);
  };

  let page = null;
  let instagramAccount = null;

  // Business-owned assets are the canonical discovery path for system-user
  // tokens. Derive the Business from the configured ad account so no Business
  // identifier needs to be stored or exposed separately.
  let businessId = null;
  try {
    const adAccount = await transport.get(`/${normalizedAdAccountId}`, {
      fields: "business{id}",
    });
    if (adAccount?.business?.id) {
      businessId = requireNumericId(
        adAccount.business.id,
        "discovered Meta Business id"
      );
    }
  } catch (error) {
    classifyFailure("ad_account_business", error);
  }

  if (businessId) {
    try {
      const ownedInstagramCollection = await transport.get(
        `/${businessId}/owned_instagram_accounts`,
        {
          fields: "id,username",
          limit: 100,
        }
      );
      instagramAccount = (ownedInstagramCollection?.data || []).find(
        (candidate) =>
          String(candidate?.username || "").trim().toLowerCase() ===
          expectedUsername
      );
    } catch (error) {
      classifyFailure("business_instagram", error);
    }

    try {
      const ownedPageCollection = await transport.get(`/${businessId}/owned_pages`, {
        fields: "id,name,instagram_business_account{id,username}",
        limit: 100,
      });
      candidatePages.push(...(ownedPageCollection?.data || []));
    } catch (error) {
      classifyFailure("business_pages", error);
    }
  }

  if (instagramAccount) {
    const ownedInstagramId = requireNumericId(
      instagramAccount.id,
      "discovered Instagram user id"
    );
    page = candidatePages.find((candidate) => {
      const connectedInstagram = candidate?.instagram_business_account;
      return (
        String(connectedInstagram?.id || "") === ownedInstagramId ||
        String(connectedInstagram?.username || "").trim().toLowerCase() ===
          expectedUsername
      );
    });
  }

  // A promotable Page is a compatibility path, not a prerequisite. Some
  // system-user tokens intentionally lack the Page advertising permission.
  if (!instagramAccount || !page) {
    try {
      const pageCollection = await transport.get(
        `/${normalizedAdAccountId}/promote_pages`,
        {
          fields: "id,name,instagram_business_account{id,username}",
          limit: 100,
        }
      );
      candidatePages.push(...(pageCollection?.data || []));
      const promotedPage = candidatePages.find((candidate) => {
        const connectedInstagram = candidate?.instagram_business_account;
        return String(connectedInstagram?.username || "").trim().toLowerCase() ===
          expectedUsername;
      });
      if (!page && promotedPage) page = promotedPage;
      if (!instagramAccount && promotedPage) {
        instagramAccount = promotedPage.instagram_business_account;
      }
    } catch (error) {
      classifyFailure("promote_pages", error);
    }
  }

  if (!instagramAccount) {
    try {
      const instagramCollection = await transport.get(
        `/${normalizedAdAccountId}/instagram_accounts`,
        {
          fields: "id,username",
          limit: 100,
        }
      );
      instagramAccount = (instagramCollection?.data || []).find(
          (candidate) =>
            String(candidate?.username || "").trim().toLowerCase() ===
            expectedUsername
      );
    } catch (error) {
      classifyFailure("ad_account_instagram", error);
    }

    if (instagramAccount) {
      const fallbackInstagramId = requireNumericId(
        instagramAccount.id,
        "discovered Instagram user id"
      );
      page = candidatePages.find((candidate) => {
        const connectedInstagram = candidate?.instagram_business_account;
        return (
          String(connectedInstagram?.id || "") === fallbackInstagramId ||
          String(connectedInstagram?.username || "").trim().toLowerCase() ===
            expectedUsername
        );
      });
    }
  }

  if (!instagramAccount) {
    const diagnostics = discoveryFailures.length
      ? ` (${discoveryFailures.join("; ")})`
      : "";
    throw new Error(
      `No Instagram account @${expectedUsername} was discoverable through assigned Business, Page, or ad account assets${diagnostics}`
    );
  }

  const instagramUserId = requireNumericId(
    instagramAccount.id,
    "discovered Instagram user id"
  );

  if (!page) {
    const diagnostics = discoveryFailures.length
      ? ` (${discoveryFailures.join("; ")})`
      : "";
    throw new Error(
      `No Meta Page linked to @${expectedUsername} was discoverable through assigned Business or promotable Page assets${diagnostics}`
    );
  }

  const pageId = requireNumericId(page.id, "discovered page id");
  let after = null;
  let pagesChecked = 0;
  let matchedMedia = null;

  do {
    const collection = await transport.get(`/${instagramUserId}/media`, {
      fields: "id,media_type,permalink,timestamp",
      limit: 100,
      ...(after ? { after } : {}),
    });
    pagesChecked += 1;
    matchedMedia = (collection?.data || []).find((media) => {
      try {
        return getInstagramReelCode(media.permalink) === reelCode;
      } catch {
        return false;
      }
    });
    if (matchedMedia) break;

    after = collection?.paging?.cursors?.after || null;
    if (!collection?.paging?.next) after = null;
  } while (after && pagesChecked < maxPages);

  if (!matchedMedia) {
    throw new Error(`Reel ${reelCode} was not found in the connected Instagram media`);
  }

  return {
    page_id: pageId,
    instagram_user_id: instagramUserId,
    source_instagram_media_id: requireNumericId(
      matchedMedia.id,
      "discovered Instagram media id"
    ),
    instagram_username: expectedUsername,
    reel_code: reelCode,
    pages_checked: pagesChecked,
    contains_access_token: false,
  };
}

function buildPausedReservationDraft({
  pageId,
  instagramUserId,
  sourceInstagramMediaId,
  latitude,
  longitude,
  dailyBudgetEur = 6,
  durationDays = 14,
  startsAt,
  dsaBeneficiary,
  dsaPayor,
  destinationUrl = RESERVATION_URL,
}) {
  if (destinationUrl !== RESERVATION_URL) {
    throw new TypeError(`destinationUrl must be exactly ${RESERVATION_URL}`);
  }

  if (!Number.isInteger(durationDays) || durationDays < 7 || durationDays > 30) {
    throw new TypeError("durationDays must be an integer between 7 and 30");
  }

  const normalizedPageId = requireNumericId(pageId, "pageId");
  const normalizedInstagramUserId = requireNumericId(
    instagramUserId,
    "instagramUserId"
  );
  const normalizedSourceInstagramMediaId = requireNumericId(
    sourceInstagramMediaId,
    "sourceInstagramMediaId"
  );
  const normalizedLatitude = requireCoordinate(latitude, "latitude", -90, 90);
  const normalizedLongitude = requireCoordinate(longitude, "longitude", -180, 180);
  const normalizedDsaBeneficiary = requireDsaDeclaration(
    dsaBeneficiary,
    "dsaBeneficiary"
  );
  const normalizedDsaPayor = requireDsaDeclaration(dsaPayor, "dsaPayor");
  const start = requireIsoDate(startsAt, "startsAt");
  const end = new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const dailyBudgetCents = toMetaCents(dailyBudgetEur);
  const maximumTotalBudgetCents = dailyBudgetCents * durationDays;
  const startDate = start.toISOString().slice(0, 10);

  const draft = {
    policy: {
      mode: "paused_draft_only",
      may_activate: false,
      may_publish_active_ad: false,
      destination_allowlist: [RESERVATION_URL],
      approval_token_required: APPROVAL_TOKEN,
    },
    budget: {
      daily_eur: dailyBudgetCents / 100,
      duration_days: durationDays,
      maximum_total_eur: maximumTotalBudgetCents / 100,
    },
    campaign: {
      name: `Parma | Reservations | Kreuzberg | ${startDate}`,
      objective: "OUTCOME_TRAFFIC",
      buying_type: "AUCTION",
      is_adset_budget_sharing_enabled: false,
      special_ad_categories: [],
      status: "PAUSED",
    },
    adSet: {
      name: `Parma | 3 km | 23-60 | Reservations | ${startDate}`,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      lifetime_budget: maximumTotalBudgetCents,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      destination_type: "WEBSITE",
      dsa_beneficiary: normalizedDsaBeneficiary,
      dsa_payor: normalizedDsaPayor,
      pacing_type: ["day_parting"],
      adset_schedule: [
        {
          start_minute: 17 * 60,
          end_minute: 23 * 60,
          days: [0, 1, 2, 3, 4, 5, 6],
        },
      ],
      targeting: {
        age_min: 23,
        age_max: 60,
        geo_locations: {
          custom_locations: [
            {
              latitude: normalizedLatitude,
              longitude: normalizedLongitude,
              radius: 3,
              distance_unit: "kilometer",
            },
          ],
        },
        publisher_platforms: ["instagram"],
        instagram_positions: ["stream", "story", "reels"],
      },
      status: "PAUSED",
    },
    creative: {
      name: "Parma | Existing Reel video | Reservations",
      object_id: normalizedPageId,
      instagram_user_id: normalizedInstagramUserId,
      source_instagram_media_id: normalizedSourceInstagramMediaId,
      call_to_action: {
        type: "BOOK_NOW",
        value: { link: RESERVATION_URL },
      },
    },
    ad: {
      name: "Parma | Reel | Jetzt reservieren",
      status: "PAUSED",
    },
  };

  assertPausedOnly(draft);
  return draft;
}

async function createPausedReservationDraft({
  transport,
  adAccountId,
  draft,
  approvalToken,
  existingCampaignId = null,
}) {
  if (approvalToken !== APPROVAL_TOKEN) {
    throw new Error("Exact paused-draft approval token is required");
  }
  if (!transport || typeof transport.post !== "function" || typeof transport.get !== "function") {
    throw new TypeError("transport must provide post and get functions");
  }

  const accountId = String(adAccountId || "").trim();
  if (!/^act_\d{1,30}$/.test(accountId)) {
    throw new TypeError("adAccountId must use the act_<digits> format");
  }

  assertPausedOnly(draft);
  const created = {};
  const reused = {};
  let stage = "campaign";

  try {
    if (existingCampaignId) {
      created.campaign_id = requireNumericId(existingCampaignId, "existing campaign id");
      reused.campaign = true;
    } else {
      const campaign = await transport.post(`/${accountId}/campaigns`, draft.campaign);
      created.campaign_id = requireNumericId(campaign?.id, "created campaign id");
    }

    stage = "adset";
    const adSet = await transport.post(`/${accountId}/adsets`, {
      ...draft.adSet,
      campaign_id: created.campaign_id,
    });
    created.adset_id = requireNumericId(adSet?.id, "created ad set id");

    stage = "creative";
    const creative = await transport.post(`/${accountId}/adcreatives`, draft.creative);
    created.creative_id = requireNumericId(creative?.id, "created creative id");

    stage = "ad";
    const ad = await transport.post(`/${accountId}/ads`, {
      ...draft.ad,
      adset_id: created.adset_id,
      creative: { creative_id: created.creative_id },
    });
    created.ad_id = requireNumericId(ad?.id, "created ad id");

    stage = "verification";
    let verificationEntries = await Promise.all(
      [created.campaign_id, created.adset_id, created.ad_id].map(async (id) => {
        const object = await transport.get(`/${id}`, { fields: "id,status,effective_status" });
        return [id, object];
      })
    );
    let verification = Object.fromEntries(verificationEntries);
    const unexpectedStatuses = Object.entries(verification).filter(
      ([, object]) => object?.status !== "PAUSED"
    );

    if (unexpectedStatuses.length > 0) {
      await Promise.all(
        unexpectedStatuses.map(([id]) =>
          transport.post(`/${id}`, { status: "PAUSED" })
        )
      );
      verificationEntries = await Promise.all(
        [created.campaign_id, created.adset_id, created.ad_id].map(async (id) => {
          const object = await transport.get(`/${id}`, {
            fields: "id,status,effective_status",
          });
          return [id, object];
        })
      );
      verification = Object.fromEntries(verificationEntries);
    }

    const stillUnsafe = Object.entries(verification).filter(
      ([, object]) => object?.status !== "PAUSED"
    );
    if (stillUnsafe.length > 0) {
      throw new Error(
        `Meta objects were not verified as PAUSED after emergency pause: ${stillUnsafe
          .map(([id]) => id)
          .join(",")}`
      );
    }

    return {
      success: true,
      mode: "paused_draft_only",
      created,
      reused,
      verification,
      activates_spend: false,
    };
  } catch (error) {
    throw new PartialMetaDraftError(
      "Paused Meta draft creation did not complete; inspect the returned object IDs before any further action",
      created,
      stage,
      error,
      reused
    );
  }
}

module.exports = {
  APPROVAL_TOKEN,
  ONE_SHOT_TRIGGER,
  RESERVATION_URL,
  PartialMetaDraftError,
  assertPausedOnly,
  shouldRunPausedDraftOneShot,
  discoverInstagramReelAssets,
  getInstagramReelCode,
  buildPausedReservationDraft,
  createPausedReservationDraft,
};
