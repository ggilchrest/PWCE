// Generated from public capability definitions and schemas.
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const capabilityContracts=freeze({
  "bundleId": "pwce-capability-contracts.bundle.v1",
  "bundleVersion": "1.0.0",
  "digestAlgorithm": "sha256-ordered-path-bytes-v1",
  "bundleDigest": "6df58c602d8a43fdababd388c588aef631662e5904139837baa36db9c6730a0c",
  "artifacts": [
    {
      "path": "contracts/capabilities/catalog.json",
      "sha256": "d23f06b1b40814c1f7e5c2fb1ad556bb0f4089c1b1466b7e53af8bd2361d3bed"
    },
    {
      "path": "contracts/capabilities/light-set-level/descriptor.json",
      "sha256": "6e805ece30e0cd3d12b90d5afd7cc82a91e013917f3d75f950cd80e93865d051"
    },
    {
      "path": "contracts/capabilities/light-set-level/input.schema.json",
      "sha256": "cafb6e1ced3bbaa386ec6a59980eda545ab44f410ed9e1de809509be48bc7b6f"
    },
    {
      "path": "contracts/capabilities/light-set-level/result.schema.json",
      "sha256": "98ffa74264afed417b87d4cd385129508e2b90768d579002b6237298cc9460fc"
    }
  ],
  "capabilities": [
    {
      "capabilityRef": "home.light.set_level",
      "operation": "light.set_level",
      "schemaVersion": "1.0.0",
      "title": "Set light brightness",
      "description": "Set the absolute brightness of one light at an authorized site. A level of 0.4 requests 40 percent. Current grants, required Human approval, target availability and final admission are checked separately.",
      "inputSchemaRef": "https://pwce.local/contracts/home-light-set-level-input-1.0.0.schema.json",
      "resultSchemaRef": "https://pwce.local/contracts/home-light-set-level-result-1.0.0.schema.json",
      "effectClass": "reversible",
      "approval": "policy",
      "idempotency": "required",
      "offline": "fixture_only",
      "latencyClass": "bounded",
      "simulationSupported": false,
      "inputSchemaArtifact": {
        "reference": "https://pwce.local/contracts/home-light-set-level-input-1.0.0.schema.json",
        "sha256": "cafb6e1ced3bbaa386ec6a59980eda545ab44f410ed9e1de809509be48bc7b6f",
        "byteLength": 830,
        "mediaType": "application/schema+json",
        "schemaRef": "https://json-schema.org/draft/2020-12/schema"
      },
      "resultSchemaArtifact": {
        "reference": "https://pwce.local/contracts/home-light-set-level-result-1.0.0.schema.json",
        "sha256": "98ffa74264afed417b87d4cd385129508e2b90768d579002b6237298cc9460fc",
        "byteLength": 2006,
        "mediaType": "application/schema+json",
        "schemaRef": "https://json-schema.org/draft/2020-12/schema"
      }
    }
  ]
});
export const capabilitySchemas=freeze([
  {
    "artifact": {
      "reference": "https://pwce.local/contracts/home-light-set-level-input-1.0.0.schema.json",
      "sha256": "cafb6e1ced3bbaa386ec6a59980eda545ab44f410ed9e1de809509be48bc7b6f",
      "byteLength": 830,
      "mediaType": "application/schema+json",
      "schemaRef": "https://json-schema.org/draft/2020-12/schema"
    },
    "schemaJson": "{\n  \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n  \"$id\": \"https://pwce.local/contracts/home-light-set-level-input-1.0.0.schema.json\",\n  \"title\": \"Set an absolute light brightness at one scoped target\",\n  \"type\": \"object\",\n  \"required\": [\n    \"siteRef\",\n    \"targetEntityId\",\n    \"parameters\"\n  ],\n  \"additionalProperties\": false,\n  \"properties\": {\n    \"siteRef\": {\n      \"type\": \"string\",\n      \"pattern\": \"^[a-z0-9][a-z0-9._-]{0,63}$\"\n    },\n    \"targetEntityId\": {\n      \"type\": \"string\",\n      \"minLength\": 1,\n      \"maxLength\": 128\n    },\n    \"parameters\": {\n      \"type\": \"object\",\n      \"required\": [\n        \"level\"\n      ],\n      \"additionalProperties\": false,\n      \"properties\": {\n        \"level\": {\n          \"type\": \"number\",\n          \"minimum\": 0,\n          \"maximum\": 1\n        }\n      }\n    }\n  }\n}\n"
  },
  {
    "artifact": {
      "reference": "https://pwce.local/contracts/home-light-set-level-result-1.0.0.schema.json",
      "sha256": "98ffa74264afed417b87d4cd385129508e2b90768d579002b6237298cc9460fc",
      "byteLength": 2006,
      "mediaType": "application/schema+json",
      "schemaRef": "https://json-schema.org/draft/2020-12/schema"
    },
    "schemaJson": "{\n  \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n  \"$id\": \"https://pwce.local/contracts/home-light-set-level-result-1.0.0.schema.json\",\n  \"title\": \"Original producer light-action result; only succeeded confirms an effect\",\n  \"type\": \"object\",\n  \"required\": [\n    \"status\",\n    \"externalEffectOccurred\"\n  ],\n  \"additionalProperties\": false,\n  \"properties\": {\n    \"status\": {\n      \"enum\": [\n        \"succeeded\",\n        \"partially_succeeded\",\n        \"failed\",\n        \"rejected\",\n        \"denied\",\n        \"timed_out\",\n        \"cancelled\",\n        \"outcome_unknown\"\n      ]\n    },\n    \"externalEffectOccurred\": {\n      \"enum\": [\n        true,\n        false,\n        \"unknown\"\n      ]\n    },\n    \"reasonCode\": {\n      \"type\": \"string\",\n      \"pattern\": \"^[a-zA-Z0-9_.-]{1,128}$\"\n    },\n    \"observed\": {},\n    \"dispatchAcknowledged\": {\n      \"type\": \"boolean\"\n    },\n    \"completedAt\": {\n      \"type\": \"string\",\n      \"format\": \"date-time\"\n    },\n    \"reconciledAt\": {\n      \"type\": \"string\",\n      \"format\": \"date-time\"\n    }\n  },\n  \"allOf\": [\n    {\n      \"if\": {\n        \"properties\": {\n          \"status\": {\n            \"enum\": [\n              \"succeeded\",\n              \"partially_succeeded\"\n            ]\n          }\n        }\n      },\n      \"then\": {\n        \"properties\": {\n          \"externalEffectOccurred\": {\n            \"const\": true\n          }\n        }\n      }\n    },\n    {\n      \"if\": {\n        \"properties\": {\n          \"status\": {\n            \"const\": \"outcome_unknown\"\n          }\n        }\n      },\n      \"then\": {\n        \"properties\": {\n          \"externalEffectOccurred\": {\n            \"const\": \"unknown\"\n          }\n        }\n      }\n    },\n    {\n      \"if\": {\n        \"properties\": {\n          \"status\": {\n            \"enum\": [\n              \"denied\",\n              \"rejected\"\n            ]\n          }\n        }\n      },\n      \"then\": {\n        \"properties\": {\n          \"externalEffectOccurred\": {\n            \"const\": false\n          }\n        }\n      }\n    }\n  ]\n}\n"
  }
]);
