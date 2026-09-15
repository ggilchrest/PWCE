import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {admissionEvidence} from './admission-evidence.js';
import {normalizeTargetResult} from './action-service.js';

const fail=()=>{throw Object.assign(new Error('original invocation evidence is invalid'),{code:'invocation_evidence_invalid'});};
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
function result(value,earliest){
 if(!value||typeof value!=='object'||Array.isArray(value))return fail();
 const {completedAt,reconciledAt,...feedback}=value;
 if(!time(completedAt)||Date.parse(completedAt)<earliest||reconciledAt!==undefined&&(!time(reconciledAt)||reconciledAt!==completedAt)||!isDeepStrictEqual(normalizeTargetResult(feedback),feedback)||Buffer.byteLength(JSON.stringify(value))>17000)return fail();
 return structuredClone(value);
}

/** Project actual producer custody only. Calling this never reconciles or sends. */
export function invocationEvidence(original){
 const admission=admissionEvidence(original),action=structuredClone(original),attemptRef=action.attemptRef??null,startedAt=action.startedAt??null;
 if((attemptRef===null)!==(startedAt===null)||attemptRef!==null&&(!uuid(attemptRef)||!time(startedAt)||Date.parse(startedAt)<Date.parse(admission.admittedAt)))return fail();
 const earliest=Date.parse(startedAt??admission.admittedAt),current=action.result===null?null:result(action.result,earliest),dispatch=action.dispatchResult==null?null:result(action.dispatchResult,earliest);
 if(action.status==='admitted'){if(attemptRef!==null||current!==null||dispatch!==null)return fail();}
 else if(action.status==='started'){if(attemptRef===null||current!==null||dispatch!==null)return fail();}
 else if(!current||current.status!==action.status||attemptRef===null&&(!['denied','rejected'].includes(current.status)||current.externalEffectOccurred!==false))return fail();
 if(dispatch?.reconciledAt!==undefined)return fail();
 const history=action.reconciliations??[];if(!Array.isArray(history)||history.length>17)return fail();
 for(const item of history){const {sha256,...entry}=item;if(!uuid(entry.reconciliationRef)||entry.actionRef!==action.actionRef||entry.attemptRef!==attemptRef||entry.requestFingerprint!==admission.requestFingerprint||entry.targetIdentity!==admission.targetIdentity||sha256!==createHash('sha256').update(JSON.stringify(entry)).digest('hex'))return fail();}
 const last=history.at(-1);
 if(last){if(!current||attemptRef===null||!time(last.startedAt)||!time(last.completedAt)||Date.parse(last.startedAt)<earliest||Date.parse(last.completedAt)<Date.parse(last.startedAt)||!isDeepStrictEqual(current,{...last.reportedResult,completedAt:last.completedAt,reconciledAt:last.completedAt}))return fail();}
 else if(current?.reconciledAt!==undefined||dispatch!==null&&!isDeepStrictEqual(current,dispatch))return fail();
 const proof={schemaVersion:'1.0.0',kind:'pwce.action.invocation',actionRef:action.actionRef,admissionEvidence:admission,status:action.status,attemptRef,startedAt,dispatchResult:dispatch,result:current,reconciliationRef:last?.reconciliationRef??null};
 if(Buffer.byteLength(JSON.stringify(proof))>131072)return fail();return proof;
}
