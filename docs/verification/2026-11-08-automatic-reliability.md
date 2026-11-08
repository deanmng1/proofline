# Automatic reliability observation after collector repair

Collector source: **`a4a6558344fae88c7398634ad6e5fbd3cac2dda1` (N)**. Actual automatic collector [42525501938](https://github.com/deanmng1/proofline/actions/runs/42525501938), attempt1, completes successfully on `workflow_run`. Its sole `collect` job is128868123381. Canonical main run [42523510015](https://github.com/deanmng1/proofline/actions/runs/42523510015) appears in the collected sample at exact N with its original successful first-attempt outcome.

This is supplementary aggregate GitHub history, not native test/release authority. The retained offline audit passes. Independent API, archive/log and content review separately accepts this automatic observation; final whole-project rating is separate. No new project rating is assigned here.

## Actual source, acquisition and immutable artifact

The collector is exact workflow409733012, `.github/workflows/reliability.yml`, in `deanmng1/proofline`, on main. Before/after API observations agree on run/source/attempt/status, job/step facts and artifact identity. The job log corroborates checkout of exact N, Node24.22.1 and the pinned upload action. The observation itself identifies canonical verification workflow399855475, `.github/workflows/verify.yml`, transport `github-api` and authority `supplementary-only`.

Artifact **13634973257**, named `proofline-reliability-42525501938-1`, is29766 bytes. Its SHA256 is **`ba6bd6493a1ebaa50fb7acd01108b3d5eac3f348576e6c61d7512e1b1396477c`**. API digest, downloaded ZIP digest and logged upload digest agree; the upload log also binds the artifact ID. The archive contains exactly three files, with no duplicate or additional entries:

| Native filename | Bytes | SHA256 |
| --- | ---: | --- |
| `observation.json` | 229639 | `7e8abea08764b7b86c77be8955d2f9196e14920df4bb31ea0a085dd71579022e` |
| `summary.json` | 488869 | `40820ed1d20372ce37416485b874000bdafbbe6f76b590d8c228891e4adbf2ef` |
| `summary.md` | 3487 | `8f17eb7b72d5a7380bf5db8f95d8d9e3c46043614b4f945a88024645b359fa62` |

The unchanged source writer recomputes all three files into new exclusive directory `output/adopter-confidence/collector-N-recomputed-2`. Each reproduced file equals the captured native bytes exactly. Source N runtime modules are checked against local immutable Git blobs before import; stored transport or success flags alone do not establish provenance. The acquisition does not separately save the triggering workflow_run event payload, so it does not supply a direct event-payload binding to a particular triggering run.

## Full30-day sample and retained failures

The run-creation window is **`2026-10-09T21:30:15Z` through `2026-11-08T21:30:15Z`**, exactly30 days, observed at `2026-11-08T21:30:15.272Z`. It contains **7 runs /7 first attempts**: **4 failures and3 successes**, with no retries, unavailable first attempts or duplicate observations. The earlier six observed run IDs and all their normalized attempt/job/step facts remain present unchanged; the sample was not shortened to avoid the historical job layout.

| Canonical run | First-attempt outcome |
| --- | --- |
| 40760705216 | failure |
| 40782532217 | failure |
| 42137240862 | failure |
| 42146835227 | failure |
| 42163108445 | success |
| 42283479092 | success |
| 42523510015 | success at N |

The two historical jobs, **123071531306** and **123147528800**, retain exact name `verify`, original failed outcomes and `platform: null`. Each retains raw `failedSteps: ["Preview impact selection"]`. Both current platforms and all16 current canonical gates remain unknown for these jobs; the historical step label does not become current gate evidence. The repair preserves those original failures and uncertainty rather than inventing a platform or rewriting history.

PR/fork runs are outside this canonical default-branch sample. These seven observed runs do not establish a per-test flake rate, infrastructure cause, future reliability or SLA.

## Retention and preserved operator failure

Pinned source and actual upload inputs request **90-day retention**. API metadata records artifact creation at **`2026-11-08T21:30:24Z`** and expiration at **`2027-02-06T21:30:03Z`**. The actual creation-to-expiration interval is **89.99975694444444 days**: expiration is90 days after collector run creation at `2026-11-08T21:30:03Z`,21 seconds before a full90 days measured from artifact creation. This reports the nominal setting and precise observed dates separately.

The first acquisition, `collector-N-capture`, and its failed offline audit remain retained. The acquisition wrapper emitted its own observedAt using Python's default six-digit microsecond UTC-offset format; the auditor required canonical millisecond-Z format. Native artifact timestamps and all snapshot content were unchanged.

Only the acquisition wrapper's timestamp serialization was corrected. A new read-only capture of the same successful run/artifact was written to `collector-N-capture-2`, followed by a new passing offline audit and new reproduction directory. The two captured archives and all three native payloads are byte-identical. No collector rerun, source/workflow/auditor/policy change or native payload rewrite was used to obtain the passing audit. The original wrapper, first capture, failed audit log and correction record remain preserved separately.

Earlier collector failures also retain their original outcomes: initial automatic C1 run42287627375 and scheduled November7/8 runs42379327650 and42488950608 remain failed. A later successful observation does not replace them or alter the original verification outcomes.

## Preservation and limits

Raw evidence is retained under `output/adopter-confidence/collector-N-capture-2`, with `collector-N-audit-2.log` and `collector-N-recomputed-2`; the earlier capture/audit and failure evidence remain alongside them. The [exact snapshot](2026-11-08-reliability/) preserves native `observation.json` as `observation.json.txt`, `summary.json` as `summary.json.txt`, and `summary.md` unchanged. Its [SHA256SUMS](2026-11-08-reliability/SHA256SUMS) covers all three byte-identical files.

Actual hosted main verification, required native outcomes and release eligibility are separate evidence. This observation adds no human adoption, measured onboarding time, long-term operating history, support SLA, publication or deployment claim. Live staging remains pending.
