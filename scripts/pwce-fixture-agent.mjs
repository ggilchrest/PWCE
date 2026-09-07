import { FixtureExternalAgent } from "../src/agent/fixture-external-agent.js";

const question = process.argv.slice(2).join(" ").trim();
if (!question) throw new Error("usage: node scripts/pwce-fixture-agent.mjs <question>");
const agent = new FixtureExternalAgent({ baseUrl: process.env.PWCE_GATEWAY_URL ?? "http://127.0.0.1:4173", token: process.env.PWCE_GATEWAY_TOKEN ?? "", siteRefs: (process.env.PWCE_GATEWAY_SITE_REFS ?? "home.one").split(",").filter(Boolean) });
console.log(JSON.stringify(await agent.answer({ question }), null, 2));
