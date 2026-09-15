import requestSchema from '../../contracts/gateway-dispatch/request.schema.json' with { type: 'json' };

const invalid = () => Object.assign(new Error('trusted dispatch request does not match its published contract'), { code: 'invalid_request' });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// The bounded binding implements this request schema's flat field constraints;
// it does not claim to implement arbitrary JSON Schema supplied by a caller.
function fieldMatches(value, rule) {
  if (Object.hasOwn(rule, 'const') && value !== rule.const) return false;
  if (rule.enum && !rule.enum.includes(value)) return false;
  if (rule.type) {
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    if (!types.some(type => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'object' ? object(value) : typeof value === type)) return false;
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    if (rule.minLength !== undefined && length < rule.minLength || rule.maxLength !== undefined && length > rule.maxLength) return false;
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) return false;
    if (rule.format === 'date-time' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))) return false;
  }
  if (Array.isArray(value)) {
    if (value.length > rule.maxItems || rule.uniqueItems && new Set(value).size !== value.length) return false;
    if (rule.items && value.some(item => !fieldMatches(item, rule.items))) return false;
  }
  if (object(value) && rule.maxProperties !== undefined && Object.keys(value).length > rule.maxProperties) return false;
  return true;
}
export function validateDispatchRequest(payload) {
  if (!object(payload) || requestSchema.required.some(key => !Object.hasOwn(payload, key))) throw invalid();
  for (const [key, value] of Object.entries(payload)) {
    if (!Object.hasOwn(requestSchema.properties, key) || !fieldMatches(value, requestSchema.properties[key])) throw invalid();
  }
  if ((payload.operation === 'capabilities.invoke') !== Object.hasOwn(payload, 'actionRef')) throw invalid();
  const { dispatchProfileId: _profile, dispatchProfileVersion: _version, ...request } = payload;
  return request;
}
