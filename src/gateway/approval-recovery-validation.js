import requestSchema from '../../contracts/approval-recovery/request.schema.json' with {type:'json'};
import {approvalRecoveryContracts} from './approval-recovery-contracts.js';
const invalid=()=>Object.assign(new Error('approval recovery request does not match its published contract'),{code:'invalid_request'});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
// Only the flat constraints in this fixed public request schema are supported.
function matches(value,rule){
 if(Object.hasOwn(rule,'const')&&value!==rule.const||rule.enum&&!rule.enum.includes(value))return false;
 if(rule.type){const types=Array.isArray(rule.type)?rule.type:[rule.type];if(!types.some(type=>type==='null'?value===null:type==='array'?Array.isArray(value):typeof value===type))return false;}
 if(typeof value==='string'){
  const length=[...value].length;if(rule.minLength!==undefined&&length<rule.minLength||rule.maxLength!==undefined&&length>rule.maxLength||rule.pattern&&!new RegExp(rule.pattern).test(value))return false;
  if(rule.format==='date-time'){
   const parts=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
   if(!parts||!Number.isFinite(Date.parse(value)))return false;
   const [,year,month,day,hour,minute,second]=parts.map(Number),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
   if(month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59)return false;
  }
 }
 if(Array.isArray(value)&&(value.length>rule.maxItems||rule.uniqueItems&&new Set(value).size!==value.length||value.some(item=>!matches(item,rule.items))))return false;
 return true;
}
export function validateApprovalRecoveryRequest(payload){
 if(!object(payload)||Buffer.byteLength(JSON.stringify(payload))>approvalRecoveryContracts.maximumRequestBytes||requestSchema.required.some(key=>!Object.hasOwn(payload,key)))throw invalid();
 for(const [key,value] of Object.entries(payload))if(!Object.hasOwn(requestSchema.properties,key)||!matches(value,requestSchema.properties[key]))throw invalid();
 return structuredClone(payload);
}
