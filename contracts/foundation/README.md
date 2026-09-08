# Public PWCE contract foundation

This directory is the minimal checked-in source foundation for the public
PWCE contract validation and Agent Gateway build. It contains only the public
shared types, envelope rules, conformance vectors, and their manifest.

The private specification repository may propose and review changes, but it is
not required to validate or build the public contract foundation. The public
validation command is:

```sh
npm run validate
```

The Agent Gateway schemas and operation catalog remain under
`contracts/gateway/` and are included by the checked-in Gateway bundle
manifest. Private roadmaps, evidence, world-model records, and credentials
are not public build inputs.
