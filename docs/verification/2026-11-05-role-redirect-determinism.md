# Role-denial test independent of demo tenant latency

Actual first-main run `42137240862`, attempt 1 at candidate `63ae8d6`, exposes a macOS CRM coverage failure in `app routing > denies_crm_direct_routes_to_an_authenticated_unauthorized_role`. Native `1f3f1deb-cf0c-43f5-aa3d-c75f41a06d0c` has 113/114 passes; the first dashboard query expires after 1.049 seconds. This is a genuine test failure separate from the missing historical harness manifest. Its original completed log, native report and API-digest-checked archive remain retained.

Read-only analysis distinguishes this case from the earlier gallery repair: the overview page renders its dashboard heading even while its data is loading. Delaying dashboard data therefore does not explain this heading query. The real tenant provider waits for the demo `/api/tenants` response before the role-denial redirect and lazy overview rendering share the test's one-second query budget.

Controlled coverage runs keep the original Viewer session, auth/role/tenant components, all three direct routes, original assertions and query deadline. Raising only the owned tenant response delay from 200 to 850 ms, with the identical `tenantsPayload`, reproduces the query failure at 1.074 seconds. The observed shell has the same customer-route announcement while redirect readiness is pending; no protected CRM request occurs. Immediate identical tenant data passes all three original denials. An overview-data delay of 1.5 seconds still passes those denials, providing a negative control for the alternative explanation. These are controlled local traces, not a hosted network trace or a response-time guarantee.

The repair changes only `apps/crm-web/src/test/app-router.test.tsx`: this one test installs an immediate MSW response for `/api/tenants` using the exact existing payload. Real tenant/provider loading, bearer fetch, authentication, Viewer role, role routing and all three protected-route assertions remain active. The zero-CRM-request spy and listener cleanup remain unchanged. Existing global `resetHandlers` removes the test-local override after each case. Application/demo delays and all other tests, clocks, retries and query limits are unchanged.

| Verification | Actual result | Native invocation |
| --- | --- | --- |
| Focused routing | 8/8 pass | `4f983f04` |
| Complete normal CRM | 114/114, 23 files, no unhandled errors | `809cf2c3-35c3-4944-8608-92d7a78b6090` |
| Complete CRM with coverage and synthetic main metadata | 114/114, 23 files, no unhandled errors | `4261202c-250b-4f08-bff6-28c59a8fecae` |
| Independent final-source routing run | 8/8 pass | `ed28881b-7bea-4eb6-9218-253fc39bfc01` |

Final app TypeScript, one-file Biome and patch whitespace pass. Independent spec and quality review approves the exact frozen source with zero findings, including byte-for-byte restoration of the original file after removing the imports and local fixture setup. Source SHA-256 is `daa61c9b2101f2a03953be0ef36c279344e65134af62848262d82a802a0ec47c`. The bound declaration moves from line 8 to 9; controller-owned manifest, registry and catalog are refreshed. All 37 portable core files and both earlier fixture repairs remain unchanged.

These checks reuse the primary local installation/browser cache. Main-context coverage uses explicitly synthetic run `900000017`, attempt 1, with legacy-F/C4 revision variables and actual source parent C4 plus captured working bytes. No local result is promoted to hosted or fresh-install proof. Detailed diagnosis, payload/trace/source invariants and raw native copies are under `output/readiness-milestones/app-router-diagnostic/`; the independent task review is retained separately. Combined successor verification, exact source review, both full hosted PR cells and actual main/API audit remain required. Live staging remains pending.
