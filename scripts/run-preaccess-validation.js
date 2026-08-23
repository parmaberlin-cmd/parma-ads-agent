const { buildShadowAgentReport } = require("../agent-shadow");
const { runAdversarialChecks, buildReleaseCandidateStatus } = require("../agent-learning");

const adversarial = runAdversarialChecks(buildShadowAgentReport);
const status = buildReleaseCandidateStatus({
  testsPassed: process.env.PREACCESS_TESTS_PASSED === "true",
  syntaxPassed: process.env.PREACCESS_SYNTAX_PASSED === "true",
  adversarial,
  liveGoogleValidated: process.env.GOOGLE_LIVE_VALIDATED === "true",
  liveGa4Validated: process.env.GA4_LIVE_VALIDATED === "true",
});
process.stdout.write(`${JSON.stringify({ adversarial, status }, null, 2)}\n`);
if (!adversarial.every(x => x.passed)) process.exitCode = 1;
