# Demonstration rule catalog

These deterministic examples are test fixtures for the reference harness. They are not insurer, accounting, legal, payroll, or provider policy.

| Rule ID | Demonstration behavior | Primary automated coverage |
| --- | --- | --- |
| POL-001 | A quote binds once into one immutable Risk Secure or Risk Secure Plus policy. Replayed source events do nothing. | `apply-event.test.ts` |
| COM-001 | An on-bind plan earns commission on a bound premium. Basis-point calculation rounds half-up to whole cents. | `commission.test.ts` |
| COM-002 | An as-earned plan accrues only after a settled premium payment and becomes payable exactly at its UTC hold boundary. | `commission.test.ts` |
| COM-003 | A cumulative refund generates only the incremental negative commission adjustment, never a duplicate reversal. | `apply-event.test.ts` |
| FIN-001 | Deposits, settled premiums, refunds, and claim payments are append-only and idempotent by `sourceEventId`. | `apply-event.test.ts` |
| FIN-002 | Deposits and claim payments never create agent commission. | `commission.test.ts` |

All money is integer USD cents. Rates are integer basis points. A later UI or API change may display these events but must not recalculate them.
