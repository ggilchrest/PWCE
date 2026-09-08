const $ = (id) => document.getElementById(id);
const entityId = "light.kitchen_lights";
let selectedSiteRef = "home.one";
let authorizedSiteRefs = ["home.one"];
let latestRequest = null;
let latestApproval = null;

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}
function showAuth(error = "") { $("auth-panel").hidden = false; $("studio-shell").hidden = true; $("logout").hidden = true; $("auth-error").textContent = error; }
function showStudio() { $("auth-panel").hidden = true; $("studio-shell").hidden = false; $("logout").hidden = false; }
function setNotice(text, kind = "") { $("notice").textContent = text; $("notice").className = `notice ${kind}`; }
function formatDate(value) { return value ? new Date(value).toLocaleString() : "—"; }
function escapeHtml(value) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function isAggregate() { return selectedSiteRef === "__all__"; }
function siteQuery() { return isAggregate() ? `siteRefs=${authorizedSiteRefs.map((siteRef) => encodeURIComponent(siteRef)).join(",")}` : `siteRef=${encodeURIComponent(selectedSiteRef)}`; }

async function refresh() {
  try {
    const aggregate = isAggregate();
    const [health, current, historyResult] = await Promise.all([api("/api/health"), api(`/api/context/current?${siteQuery()}&entityId=${encodeURIComponent(entityId)}`), aggregate ? Promise.resolve(null) : api(`/api/context/history?${siteQuery()}&limit=8`)]);
    const history = historyResult?.observations ?? [];
    const stateLabel = aggregate ? "Multiple sites" : current.status === "known" ? String(current.value) : current.status === "stale" ? "Stale" : current.status === "conflicted" ? "Conflicted" : "Unknown";
    const statusLabel = current.status === "known" ? "Known" : current.status === "stale" ? "Stale" : current.status === "conflicted" ? "Conflicted" : "Unknown";
    $("runtime-status").textContent = health.runtime?.status ?? health.status;
    $("runtime-detail").textContent = health.runtime?.reason ?? `${health.sourceCount} source(s)`;
    $("current-state").textContent = stateLabel;
    $("current-time").textContent = aggregate ? `${current.items.length} site(s) · Values remain separate` : current.eventTime ? `${statusLabel} · Observed ${formatDate(current.eventTime)}` : current.reason;
    $("evidence-quality").textContent = current.status === "known" ? (current.quality ?? "nominal") : statusLabel;
    $("evidence-detail").textContent = aggregate ? current.items.map((item) => `${item.siteRef}: ${item.status}`).join(" · ") : current.sourceRef ?? "No accepted observation";
    $("source-pill").textContent = statusLabel;
    $("source-pill").className = `status-pill ${current.status === "known" ? "success" : "warning"}`;
    $("observed-at").textContent = aggregate ? "See each site below" : formatDate(current.eventTime);
    $("observation-ref").textContent = aggregate ? current.items.flatMap((item) => item.evidenceRefs ?? []).join(", ") || "—" : current.observationRef ?? "—";
    $("history").innerHTML = aggregate ? current.items.map((item) => `<li><span>${escapeHtml(item.siteRef)}: ${escapeHtml(String(item.value ?? item.status))}</span><span class="muted">${escapeHtml(item.eventTime ? formatDate(item.eventTime) : "No evidence")}</span></li>`).join("") : history.length ? history.map((item) => `<li><span>${escapeHtml(String(item.value))}</span><span class="muted">${escapeHtml(formatDate(item.eventTime))}</span></li>`).join("") : '<li class="muted">No observations recorded.</li>';
    $("site-detail").textContent = aggregate ? "All authorized sites · Site-qualified values remain separate" : `${selectedSiteRef} · Site-qualified context`;
    setNotice("Runtime refreshed");
  } catch (error) { setNotice(`Unable to refresh: ${error.message}`, "error"); }
}

function requestPayload() { return { siteRef: selectedSiteRef, targetEntityId: entityId, parameters: { level: Number($("level").value) / 100 }, executionEnvironmentRef: "live", approvalRequired: true, idempotencyKey: `studio-${Date.now()}` }; }
$("explain").addEventListener("click", async () => { try { if (isAggregate()) { $("explanation").textContent = "Choose one Home site to explain a single current state. Aggregate values remain separate."; return; } const explanation = await api(`/api/context/explain?${siteQuery()}&entityId=${encodeURIComponent(entityId)}`); const evidence = explanation.evidenceRefs?.length ? ` Evidence: ${explanation.evidenceRefs.join(", ")}.` : ""; $("explanation").textContent = explanation.status === "unknown" ? (explanation.reason ?? "No explanation is available.") : `${explanation.status}; source ${explanation.sourceRef}; observed ${formatDate(explanation.eventTime)}.${evidence} ${(explanation.limitations ?? []).join(" ")}`; } catch (error) { $("explanation").textContent = error.message; } });
$("level").addEventListener("input", () => { $("level-output").value = `${$("level").value}%`; $("level-output").textContent = `${$("level").value}%`; });
$("preview").addEventListener("click", async () => { try { latestRequest = requestPayload(); const decision = await api("/api/actions/preview", { method: "POST", body: JSON.stringify(latestRequest) }); $("action-result").textContent = `${decision.outcome}: ${(decision.rationaleCodes ?? []).join(", ")}`; $("action-result").className = `action-result ${decision.outcome === "allowed" ? "success" : ""}`; $("request-approval").disabled = decision.outcome !== "approval_required" && decision.outcome !== "allowed"; } catch (error) { $("action-result").textContent = error.message; $("action-result").className = "action-result error"; } });
$("request-approval").addEventListener("click", async () => { try { latestApproval = await api("/api/approvals", { method: "POST", body: JSON.stringify(latestRequest) }); $("action-result").textContent = `Approval requested: ${latestApproval.approvalRef}`; $("action-result").className = "action-result success"; $("approve").disabled = false; } catch (error) { $("action-result").textContent = error.message; $("action-result").className = "action-result error"; } });
$("approve").addEventListener("click", async () => { try { await api(`/api/approvals/${latestApproval.approvalRef}/approve`, { method: "POST" }); $("action-result").textContent = "Approved locally. Dispatch remains separately protected by the live-effects setting."; $("action-result").className = "action-result success"; $("approve").disabled = true; $("dispatch").disabled = false; } catch (error) { $("action-result").textContent = error.message; $("action-result").className = "action-result error"; } });
$("dispatch").addEventListener("click", async () => { try { if (!latestRequest || !latestApproval) throw new Error("Request and approve the action first."); const result = await api("/api/actions/dispatch", { method: "POST", body: JSON.stringify({ ...latestRequest, approvalRef: latestApproval.approvalRef }) }); const action = result.action ?? result; $("action-result").textContent = `Dispatch status: ${action.status ?? result.status}.`; $("action-result").className = `action-result ${action.status === "succeeded" ? "success" : action.status === "outcome_unknown" ? "warning" : "error"}`; } catch (error) { $("action-result").textContent = error.message; $("action-result").className = "action-result error"; } });
$("agent-form").addEventListener("submit", async (event) => { event.preventDefault(); const question = $("agent-question").value.trim(); if (!question) return; if (isAggregate()) { $("agent-result").textContent = "Choose one Home site before asking the single-site Agent."; $("agent-result").className = "agent-result error"; return; } $("agent-result").textContent = "Retrieving authorized context…"; $("agent-result").className = "agent-result"; try { const result = await api("/api/agent/message", { method: "POST", body: JSON.stringify({ question, siteRef: selectedSiteRef }) }); const evidence = result.evidenceRefs.length ? ` Evidence: ${result.evidenceRefs.join(", ")}.` : " No supporting evidence was found."; $("agent-result").textContent = `${result.answer}${evidence} Mode: ${result.mode}.`; $("agent-result").className = "agent-result success"; } catch (error) { $("agent-result").textContent = error.message; $("agent-result").className = "agent-result error"; } });

async function loadSites() {
  const result = await api("/api/sites");
  const select = $("site-select");
  authorizedSiteRefs = result.sites.map((site) => site.siteRef);
  select.innerHTML = `${result.sites.length > 1 ? '<option value="__all__">All authorized sites</option>' : ""}${result.sites.map((site) => `<option value="${escapeHtml(site.siteRef)}">${escapeHtml(site.name)} (${escapeHtml(site.siteRef)})</option>`).join("")}`;
  if (!result.sites.some((site) => site.siteRef === selectedSiteRef)) selectedSiteRef = result.sites[0]?.siteRef ?? "home.one";
  select.value = selectedSiteRef;
  select.disabled = result.sites.length < 2;
  $("site-detail").textContent = `${selectedSiteRef} · Site-qualified context`;
}
$("site-select").addEventListener("change", async (event) => { selectedSiteRef = event.target.value; latestRequest = null; latestApproval = null; $("preview").disabled = isAggregate(); $("explain").disabled = isAggregate(); $("request-approval").disabled = true; $("approve").disabled = true; $("dispatch").disabled = true; await refresh(); });
async function bootstrap() { try { await api("/api/session"); showStudio(); await loadSites(); await refresh(); } catch (error) { setNotice(`Sign in required: ${error.message}`, "error"); showAuth(); } }
$("auth-form").addEventListener("submit", async (event) => { event.preventDefault(); const recoveryCode = $("auth-recovery").value.trim(); const username = $("auth-username").value.trim(); const password = $("auth-password").value; if (!recoveryCode && (!username || !password)) { showAuth("Enter your username and password, or provide a recovery code."); return; } const payload = recoveryCode ? { recoveryCode } : { username, password }; try { await api("/api/session", { method: "POST", body: JSON.stringify(payload) }); showStudio(); await loadSites(); await refresh(); } catch (error) { showAuth(error.message); } });
$("logout").addEventListener("click", async () => { await api("/api/session/logout", { method: "POST" }); showAuth(); setNotice("Signed out of Studio"); });
bootstrap();
