const test = require("node:test");
const assert = require("node:assert/strict");

const {
  APPROVAL_TOKEN,
  RESERVATION_URL,
  PartialMetaDraftError,
  assertPausedOnly,
  discoverInstagramReelAssets,
  getInstagramReelCode,
  buildPausedReservationDraft,
  createPausedReservationDraft,
} = require("../meta-paused-draft");

function validInput(overrides = {}) {
  return {
    pageId: "101",
    instagramUserId: "202",
    adVideoId: "303",
    latitude: 52.5,
    longitude: 13.44,
    startsAt: "2026-08-24T09:00:00.000Z",
    ...overrides,
  };
}

test("builds the approved reservation campaign as a capped paused-only draft", () => {
  const draft = buildPausedReservationDraft(validInput());

  assert.equal(draft.campaign.status, "PAUSED");
  assert.equal(draft.adSet.status, "PAUSED");
  assert.equal(draft.ad.status, "PAUSED");
  assert.equal(draft.campaign.objective, "OUTCOME_TRAFFIC");
  assert.equal(draft.adSet.optimization_goal, "LINK_CLICKS");
  assert.equal(draft.adSet.lifetime_budget, 8400);
  assert.equal("daily_budget" in draft.adSet, false);
  assert.equal(draft.budget.maximum_total_eur, 84);
  assert.equal(
    draft.creative.object_story_spec.video_data.call_to_action.value.link,
    RESERVATION_URL
  );
  assert.equal(
    draft.creative.object_story_spec.video_data.call_to_action.type,
    "BOOK_NOW"
  );
  assert.doesNotThrow(() => assertPausedOnly(draft));
});

test("rejects destinations outside the exact reservation URL allowlist", () => {
  assert.throws(
    () =>
      buildPausedReservationDraft(
        validInput({ destinationUrl: "https://example.com/reservations" })
      ),
    /destinationUrl must be exactly/
  );
});

test("rejects invalid Meta identifiers and unsafe budgets", () => {
  assert.throws(
    () => buildPausedReservationDraft(validInput({ pageId: "101-secret" })),
    /pageId must contain/
  );
  assert.throws(
    () => buildPausedReservationDraft(validInput({ dailyBudgetEur: 25 })),
    /dailyBudgetEur must be between/
  );
});

test("paused-only guard rejects ACTIVE anywhere in a request", () => {
  assert.throws(
    () => assertPausedOnly({ nested: { status: "ACTIVE" } }),
    /must never contain ACTIVE/
  );
});

test("extracts only valid Instagram Reel codes", () => {
  assert.equal(
    getInstagramReelCode(
      "https://www.instagram.com/reel/C9M7_b6MayR/?igsh=cTZmeXNtb3pjbG13"
    ),
    "C9M7_b6MayR"
  );
  assert.throws(
    () => getInstagramReelCode("https://example.com/reel/C9M7_b6MayR/"),
    /valid Instagram Reel URL/
  );
});

test("discovers the connected Page, Instagram account and approved Reel without secrets", async () => {
  const calls = [];
  const transport = {
    get: async (path, params) => {
      calls.push({ path, params });
      if (path === "/act_404/promote_pages") {
        return {
          data: [
            {
              id: "501",
              name: "Parma",
              instagram_business_account: {
                id: "502",
                username: "parma.divinibenedetti",
              },
            },
          ],
        };
      }
      return {
        data: [
          {
            id: "503",
            media_type: "VIDEO",
            permalink: "https://www.instagram.com/reel/C9M7_b6MayR/",
          },
        ],
      };
    },
  };

  const result = await discoverInstagramReelAssets({
    transport,
    adAccountId: "act_404",
    reelPermalink:
      "https://www.instagram.com/reel/C9M7_b6MayR/?igsh=cTZmeXNtb3pjbG13",
  });

  assert.deepEqual(result, {
    page_id: "501",
    instagram_user_id: "502",
    source_instagram_media_id: "503",
    instagram_username: "parma.divinibenedetti",
    reel_code: "C9M7_b6MayR",
    pages_checked: 1,
    contains_access_token: false,
  });
  assert.equal(calls.some((call) => "access_token" in call.params), false);
  assert.equal(
    calls.some((call) => call.path === "/act_404/instagram_accounts"),
    false
  );
});

test("falls back to the ad-account Instagram edge when Page username metadata is absent", async () => {
  const transport = {
    get: async (path) => {
      if (path === "/act_404/promote_pages") {
        return {
          data: [
            {
              id: "501",
              instagram_business_account: { id: "502" },
            },
          ],
        };
      }
      if (path === "/act_404/instagram_accounts") {
        return {
          data: [{ id: "502", username: "parma.divinibenedetti" }],
        };
      }
      return {
        data: [
          {
            id: "503",
            media_type: "VIDEO",
            permalink: "https://www.instagram.com/reel/C9M7_b6MayR/",
          },
        ],
      };
    },
  };

  const result = await discoverInstagramReelAssets({
    transport,
    adAccountId: "act_404",
    reelPermalink: "https://www.instagram.com/reel/C9M7_b6MayR/",
  });

  assert.equal(result.page_id, "501");
  assert.equal(result.instagram_user_id, "502");
  assert.equal(result.source_instagram_media_id, "503");
});

test("discovers Instagram and its Page from Business-owned assets for a system-user token", async () => {
  const calls = [];
  const transport = {
    get: async (path, params) => {
      calls.push({ path, params });
      if (path === "/act_404/promote_pages") {
        return { data: [{ id: "501", name: "Parma" }] };
      }
      if (path === "/act_404") {
        return { business: { id: "601" } };
      }
      if (path === "/601/owned_instagram_accounts") {
        return {
          data: [{ id: "502", username: "parma.divinibenedetti" }],
        };
      }
      if (path === "/601/owned_pages") {
        return {
          data: [
            {
              id: "501",
              name: "Parma",
              instagram_business_account: {
                id: "502",
                username: "parma.divinibenedetti",
              },
            },
          ],
        };
      }
      if (path === "/502/media") {
        return {
          data: [
            {
              id: "503",
              media_type: "VIDEO",
              permalink: "https://www.instagram.com/reel/C9M7_b6MayR/",
            },
          ],
        };
      }
      throw new Error(`unexpected path ${path}`);
    },
  };

  const result = await discoverInstagramReelAssets({
    transport,
    adAccountId: "act_404",
    reelPermalink: "https://www.instagram.com/reel/C9M7_b6MayR/",
  });

  assert.equal(result.page_id, "501");
  assert.equal(result.instagram_user_id, "502");
  assert.equal(result.source_instagram_media_id, "503");
  assert.equal(
    calls.some((call) => call.path === "/act_404/instagram_accounts"),
    false
  );
  assert.equal(calls.some((call) => "access_token" in call.params), false);
});

test("fails clearly when the expected Instagram account is not connected", async () => {
  const transport = {
    get: async () => ({ data: [] }),
  };

  await assert.rejects(
    discoverInstagramReelAssets({
      transport,
      adAccountId: "act_404",
      reelPermalink: "https://www.instagram.com/reel/C9M7_b6MayR/",
    }),
    /No Instagram account/
  );
});

test("executor refuses all writes without the exact scoped approval token", async () => {
  const calls = [];
  const transport = {
    post: async (...args) => calls.push(args),
    get: async (...args) => calls.push(args),
  };

  await assert.rejects(
    createPausedReservationDraft({
      transport,
      adAccountId: "act_404",
      draft: buildPausedReservationDraft(validInput()),
      approvalToken: "yes",
    }),
    /Exact paused-draft approval token/
  );
  assert.equal(calls.length, 0);
});

test("executor creates and verifies only paused Meta objects", async () => {
  const posts = [];
  const ids = ["1001", "1002", "1003", "1004"];
  const transport = {
    post: async (path, payload) => {
      posts.push({ path, payload });
      return { id: ids[posts.length - 1] };
    },
    get: async (path) => ({
      id: path.slice(1),
      status: "PAUSED",
      effective_status: "PAUSED",
    }),
  };

  const result = await createPausedReservationDraft({
    transport,
    adAccountId: "act_404",
    draft: buildPausedReservationDraft(validInput()),
    approvalToken: APPROVAL_TOKEN,
  });

  assert.equal(result.success, true);
  assert.equal(result.activates_spend, false);
  assert.deepEqual(result.created, {
    campaign_id: "1001",
    adset_id: "1002",
    creative_id: "1003",
    ad_id: "1004",
  });
  assert.deepEqual(
    posts.map((call) => call.path),
    [
      "/act_404/campaigns",
      "/act_404/adsets",
      "/act_404/adcreatives",
      "/act_404/ads",
    ]
  );
  posts.forEach((call) => assert.doesNotThrow(() => assertPausedOnly(call.payload)));
});

test("reports partial paused objects instead of hiding a failed draft", async () => {
  let postCount = 0;
  const transport = {
    post: async () => {
      postCount += 1;
      if (postCount === 3) throw new Error("creative rejected");
      return { id: String(2000 + postCount) };
    },
    get: async () => ({ status: "PAUSED" }),
  };

  await assert.rejects(
    createPausedReservationDraft({
      transport,
      adAccountId: "act_404",
      draft: buildPausedReservationDraft(validInput()),
      approvalToken: APPROVAL_TOKEN,
    }),
    (error) => {
      assert.ok(error instanceof PartialMetaDraftError);
      assert.deepEqual(error.created, {
        campaign_id: "2001",
        adset_id: "2002",
      });
      assert.match(error.cause.message, /creative rejected/);
      return true;
    }
  );
});

test("repairs and rechecks an unexpected non-paused Meta object", async () => {
  let postCount = 0;
  let repaired = false;
  const transport = {
    post: async (path, payload) => {
      if (path === "/3002" && payload?.status === "PAUSED") {
        repaired = true;
        return { success: true };
      }
      return { id: String(3001 + postCount++) };
    },
    get: async (path) => ({
      id: path.slice(1),
      status: path === "/3002" && !repaired ? "ACTIVE" : "PAUSED",
    }),
  };

  const result = await createPausedReservationDraft({
    transport,
    adAccountId: "act_404",
    draft: buildPausedReservationDraft(validInput()),
    approvalToken: APPROVAL_TOKEN,
  });

  assert.equal(repaired, true);
  assert.equal(result.verification["3002"].status, "PAUSED");
});

test("fails closed if emergency pause cannot be verified", async () => {
  let postCount = 0;
  const transport = {
    post: async (path) => {
      if (/^\/\d+$/.test(path)) return { success: false };
      return { id: String(4001 + postCount++) };
    },
    get: async (path) => ({
      id: path.slice(1),
      status: path === "/4002" ? "ACTIVE" : "PAUSED",
    }),
  };

  await assert.rejects(
    createPausedReservationDraft({
      transport,
      adAccountId: "act_404",
      draft: buildPausedReservationDraft(validInput()),
      approvalToken: APPROVAL_TOKEN,
    }),
    (error) => {
      assert.ok(error instanceof PartialMetaDraftError);
      assert.match(error.cause.message, /after emergency pause/);
      return true;
    }
  );
});
