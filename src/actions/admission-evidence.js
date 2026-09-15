import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { actionFingerprint } from './approval-service.js';
import { capabilityContracts } from './capability-contracts.js';

const fail = () => { throw Object.assign(new Error('original admission evidence is invalid'), {code:'admission_evidence_invalid'}); };
const hash = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, maximum=128) => typeof value === 'string' && value.length > 0 && value.length <= maximum;
const identity = value => value === null || text(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const keys = (value, expected) => object(value) && Object.keys(value).sort().join(',') === expected;
const reasons = values => Array.isArray(values) && values.length > 0 && values.length <= 16 && values.every(value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(value));
const site = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value);
const descriptor = capabilityContracts.capabilities[0];

/** An immutable wire projection from durable producer custody. Never constructs
 * an admission from a request, refreshes its deadline or reports an effect. */
export function admissionEvidence(original) {
  if (!object(original)) return fail();
  const action = structuredClone(original), gateway = action.gatewayScope, binding = action.capabilitySnapshot;
  if (!uuid(action.actionRef) || !text(action.idempotencyKey) || !text(action.principalRef) || !text(action.targetEntityId) || !text(action.targetIdentity,500) || !site(action.siteRef) ||
    action.capabilityRef !== descriptor.capabilityRef || action.capabilityVersion !== descriptor.schemaVersion || action.operation !== descriptor.operation ||
    !keys(action.parameters,'level') || !Number.isFinite(action.parameters.level) || action.parameters.level < 0 || action.parameters.level > 1 ||
    !['normal','live','test','replay','simulation','dry-run'].includes(action.executionEnvironmentRef) || !Number.isSafeInteger(action.grantRevision) || action.grantRevision < 1 ||
    !keys(gateway,'assistantRef,audienceRef,endpointRef,participantRefs,worldRef') || !text(gateway.worldRef) || !identity(gateway.assistantRef) || !identity(gateway.endpointRef) || !identity(gateway.audienceRef) ||
    !Array.isArray(gateway.participantRefs) || gateway.participantRefs.length > 32 || !gateway.participantRefs.every(value=>text(value)) || new Set(gateway.participantRefs).size !== gateway.participantRefs.length ||
    !text(action.requestFingerprint,8192) || action.requestFingerprint !== actionFingerprint(action) ||
    typeof action.approvalRequired !== 'boolean' || !identity(action.approvalRef) || action.approvalRequired && action.approvalRef === null || action.executionEnvironmentRef === 'live' && !action.approvalRequired ||
    !time(action.createdAt) || !time(action.deadlineAt) || Date.parse(action.deadlineAt) <= Date.parse(action.createdAt) || Date.parse(action.deadlineAt)-Date.parse(action.createdAt) > 30000 ||
    !keys(action.decision,'outcome,rationaleCodes') || action.decision.outcome !== 'allowed' || !reasons(action.decision.rationaleCodes) ||
    !keys(binding,'expiresAt,sha256,snapshotJson,snapshotRef') || !uuid(binding.snapshotRef) || !time(binding.expiresAt) || !text(binding.snapshotJson,32768) || Buffer.byteLength(binding.snapshotJson)>32768 || !digest(binding.sha256) || hash(binding.snapshotJson)!==binding.sha256) return fail();
  let record; try { record=JSON.parse(binding.snapshotJson); } catch { return fail(); }
  const snapshot=record?.snapshot, scope=record?.scope;
  if (!keys(record,'scope,snapshot,sourceDigest') || !digest(record.sourceDigest) || !Array.isArray(scope) || scope.length !== 11 || !uuid(scope[0]) || scope[1] !== action.principalRef || !Number.isSafeInteger(scope[2]) || scope[2]<1 || scope[3] !== action.grantRevision ||
    !Array.isArray(scope[4]) || !scope[4].length || scope[4].length>128 || !scope[4].every(site) || new Set(scope[4]).size!==scope[4].length ||
    !isDeepStrictEqual(scope.slice(5),[gateway.assistantRef,gateway.endpointRef,gateway.participantRefs,gateway.audienceRef,gateway.worldRef,action.executionEnvironmentRef]) ||
    !keys(snapshot,'availability,capabilities,expiresAt,invalidationSequence,issuedAt,limitations,principalRef,profileId,profileVersion,siteRefs,snapshotRef,sourceRevision') ||
    snapshot.profileId !== 'pwce-agent-gateway.v1' || snapshot.profileVersion !== '1.0.0' || snapshot.snapshotRef !== binding.snapshotRef || snapshot.expiresAt !== binding.expiresAt ||
    snapshot.principalRef !== action.principalRef || !isDeepStrictEqual(snapshot.siteRefs,scope[4]) || !snapshot.siteRefs.includes(action.siteRef) || snapshot.sourceRevision !== action.grantRevision || snapshot.invalidationSequence !== action.grantRevision ||
    !time(snapshot.issuedAt) || Date.parse(snapshot.issuedAt)>Date.parse(action.createdAt) || Date.parse(binding.expiresAt)<Date.parse(action.deadlineAt) ||
    snapshot.availability !== 'configured' || !isDeepStrictEqual(snapshot.capabilities,[{...descriptor,available:true,authorization:'grant_required'}]) ||
    !Array.isArray(snapshot.limitations) || snapshot.limitations.length>8 || snapshot.limitations.some(value=>typeof value!=='string'||value.length>500)) return fail();
  const precondition = action.preconditionChecks?.[0] ?? null;
  if (typeof action.preconditionsRequired !== 'boolean' || action.preconditionsRequired !== (precondition!==null) || action.snapshotRequired!==true || action.executionEnvironmentRef==='live' && precondition===null) return fail();
  let preconditionCustody = null;
  if (precondition !== null) {
    if (!keys(precondition,'checkedAt,phase,requestFingerprint,result,schemaVersion,sha256,targetIdentity') || precondition.schemaVersion!=='1.0.0' || precondition.phase!=='admission' || precondition.targetIdentity!==action.targetIdentity || precondition.requestFingerprint!==action.requestFingerprint ||
      !time(precondition.checkedAt) || Date.parse(precondition.checkedAt)>Date.parse(action.createdAt) || !keys(precondition.result,'allowed,observed,reasonCode') || precondition.result.allowed!==true || !reasons([precondition.result.reasonCode]) || !digest(precondition.sha256)) return fail();
    const entry={schemaVersion:precondition.schemaVersion,phase:precondition.phase,targetIdentity:precondition.targetIdentity,requestFingerprint:precondition.requestFingerprint,checkedAt:precondition.checkedAt,result:precondition.result};
    const checkJson=JSON.stringify(entry);
    if(hash(checkJson)!==precondition.sha256 || Buffer.byteLength(checkJson)>16384)return fail();
    preconditionCustody={sha256:precondition.sha256,checkJson};
  }
  const proof={schemaVersion:'1.0.0',kind:'pwce.action.admission',actionRef:action.actionRef,idempotencyKey:action.idempotencyKey,requestFingerprint:action.requestFingerprint,
    principalRef:action.principalRef,capabilityRef:action.capabilityRef,capabilityVersion:action.capabilityVersion,operation:action.operation,siteRef:action.siteRef,targetEntityId:action.targetEntityId,parameters:action.parameters,
    executionEnvironmentRef:action.executionEnvironmentRef,gatewayScope:gateway,grantRevision:action.grantRevision,targetIdentity:action.targetIdentity,deadlineAt:action.deadlineAt,approvalRequired:action.approvalRequired,approvalRef:action.approvalRef,
    capabilitySnapshot:binding,precondition:preconditionCustody,admittedAt:action.createdAt,decision:action.decision};
  if(Buffer.byteLength(JSON.stringify(proof))>65536)return fail();
  return proof;
}
