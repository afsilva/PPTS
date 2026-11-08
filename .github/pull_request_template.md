## Summary

<!-- What behavior changes, and why? -->

## Action and regression-test inventory

List every new or changed user action, route, service operation, domain rule, authorization decision, and fixed defect. Link each to retained regression evidence.

| Action/rule/defect | Success test | Denial, validation, or boundary test | Integration/E2E evidence |
| ------------------ | ------------ | ------------------------------------ | ------------------------ |
|                    |              |                                      |                          |

## Required checklist

- [ ] Every changed action has positive and relevant negative/boundary regression tests.
- [ ] Authorization changes include explicit allowed and denied actors/resources.
- [ ] Persistence changes use real PostgreSQL tests and assert both side effects and audit records.
- [ ] Concurrency-sensitive behavior has a simultaneous-request regression test and database invariant.
- [ ] Every new route/exported business action is registered in `tests/regression-contract.json`.
- [ ] Every bug fix retains a test that reproduces the former failure.
- [ ] `npm run verify` passes.
- [ ] `npm run test:integration` passes when persistence/business behavior changed.
- [ ] Applicable full-stack E2E flows pass.
- [ ] Security, architecture, testing, operations, and user documentation are updated.
- [ ] No secret, token, production data, or identifiable legacy record is included.
