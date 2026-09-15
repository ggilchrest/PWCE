/** Human review only. Dispatch stays with the original requesting Gateway scope. */
export function initializeGatewayApprovals({ api, selectedSite }) {
  const list = document.getElementById('gateway-approval-list'), notice = document.getElementById('gateway-approval-notice');
  const refresh = document.getElementById('gateway-approval-refresh'), previous = document.getElementById('gateway-approval-previous'), next = document.getElementById('gateway-approval-next');
  let generation = 0, cursor = null, following = null, history = [];
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  function record(approval) {
    const request = approval.gatewayReview.request, scope = request.gatewayScope;
    const expired = Date.parse(approval.expiresAt) <= Date.now();
    const state = approval.status === 'pending' && expired ? 'expired' : approval.status;
    const card = element('article', undefined, 'gateway-review-record');
    const heading = element('div', undefined, 'card-heading');
    heading.append(element('h3', approval.gatewayReview.effectSummary), element('span', state, 'status-pill'));
    const reference = element('p', `Request ${approval.approvalRef}`, 'mono review-reference');
    const details = element('details'), summary = element('summary', 'Review target and scope');
    const fields = element('dl', undefined, 'review-fields');
    for (const [label, value] of [
      ['Target', request.targetEntityId], ['Site', request.siteRef], ['Brightness level (0–1)', String(request.parameters.level)],
      ['Effect', approval.gatewayReview.effectClass], ['Capability', `${request.capabilityRef} · ${request.capabilityVersion}`],
      ['Operation', request.operation], ['Execution environment', request.executionEnvironmentRef], ['World', scope.worldRef],
      ['Requesting principal', request.principalRef], ['Assistant', scope.assistantRef ?? 'Not supplied'], ['Endpoint', scope.endpointRef ?? 'Not supplied'],
      ['Participants', scope.participantRefs.join(', ') || 'None supplied'], ['Audience', scope.audienceRef ?? 'Not supplied'],
      ['Expires', new Date(approval.expiresAt).toLocaleString()], ['Original request key', approval.requestKey]
    ]) { const row = element('div'); row.append(element('dt', label), element('dd', value)); fields.append(row); }
    details.append(summary, fields);
    if (state === 'pending') {
      const label = element('label', undefined, 'review-confirmation'), check = element('input'); check.type = 'checkbox';
      label.append(check, element('span', 'I reviewed this exact target, effect, scope and expiry.'));
      const approve = element('button', 'Approve this request', 'button primary'); approve.type = 'button'; approve.disabled = true;
      const feedback = element('p', 'Approval does not dispatch the action. The Assistant must explicitly resume its original request.', 'muted review-feedback'); feedback.setAttribute('role','status');
      check.addEventListener('change', () => { approve.disabled = !check.checked || Date.parse(approval.expiresAt) <= Date.now(); });
      approve.addEventListener('click', async () => {
        const ticket = generation; approve.disabled = true; check.disabled = true; approve.textContent = 'Approving…';
        try {
          await api(`/api/approvals/${encodeURIComponent(approval.approvalRef)}/approve`, { method: 'POST', body: JSON.stringify({ confirmationDigest: approval.confirmationDigest }) });
          if (ticket !== generation) return;
          heading.lastElementChild.textContent = 'approved'; approve.textContent = 'Approved';
          feedback.textContent = 'Approved. The Assistant may now explicitly resume the original request. No action was dispatched by this review.';
        } catch (error) {
          if (ticket !== generation) return;
          approve.textContent = 'Refresh before retrying'; feedback.textContent = `${error.message}. Refresh requests to inspect the current decision before trying again.`;
        }
        feedback.tabIndex = -1; feedback.focus();
      });
      details.append(label, approve, feedback);
    } else details.append(element('p', state === 'approved' ? `Approved by ${approval.approvedBy}. Dispatch remains a separate operation.` : 'This request is no longer pending. A new request and review are required.', 'muted'));
    card.append(heading, reference, details); return card;
  }
  async function load() {
    const ticket = ++generation; refresh.disabled = true; previous.disabled = true; next.disabled = true; list.replaceChildren(); notice.textContent = 'Loading Assistant requests…';
    const query = new URLSearchParams({ limit: '5' }); if (selectedSite()) query.set('siteRef', selectedSite()); if (cursor) query.set('cursor', cursor);
    try {
      const result = await api(`/api/approvals?${query}`); if (ticket !== generation) return;
      for (const approval of result.approvals) list.append(record(approval));
      following = result.nextCursor; notice.textContent = result.approvals.length ? `${result.approvals.length} request(s) on this page. Open a request to review its full scope.` : 'No Assistant requests in this site scope.';
      previous.disabled = history.length === 0; next.disabled = !following;
    } catch (error) { if (ticket === generation) notice.textContent = `Requests unavailable: ${error.message}`; }
    finally { if (ticket === generation) refresh.disabled = false; }
  }
  function reset() { generation++; cursor = null; following = null; history = []; list.replaceChildren(); notice.textContent = 'Refresh to load requests in the current site scope.'; refresh.disabled = false; previous.disabled = true; next.disabled = true; }
  refresh.addEventListener('click', () => { reset(); void load(); });
  next.addEventListener('click', () => { if (following) { history.push(cursor); cursor = following; void load(); } });
  previous.addEventListener('click', () => { if (history.length) { cursor = history.pop(); void load(); } });
  return { load, reset };
}
