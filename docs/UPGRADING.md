# Upgrading Proofline source

Proofline `0.9.0-preview.2` is a **public source preview with unpublished packaged distribution**, manifest schema 1. A version string does not identify verified bytes: record the full old/new Git commits, target commit and copied-core SHA-256 inventories. [Project status](PROJECT_STATUS.md) names the active evidence and limitations. The [support policy](../.github/SUPPORT.md) names the maintainer and supported scope.

The [source-native onboarding operator](GETTING_STARTED.md#upgrade-and-interruptions) provides a read-only upgrade plan and explicit apply for unchanged previously installed core. It recomputes prior inventories from trusted local Git objects and refuses target edits or removed files; incomplete transactions retain evidence for review. The manual protocol below remains the authority for an application's full adaptation, governance and verification.

## Prepare a compatible upgrade

1. Preserve a clean, full-history target checkout, its lockfile, manifest, rule catalog, baseline and append-only execution record. Keep prior native failures and passing evidence. Make a disposable copy or branch; do not initialize over existing target history.
2. Review the immutable source diff and candidate notes, including guard/runner/release changes. Use Node 24.22.1, pnpm 11.24.0 and Git 2.48+. Keep package pins, lockfile and browser installation coherent. Run source and installed `doctor` checks as described in the [portable guide](PORTABLE_TEST_AUTOMATION.md). A successful doctor is a prerequisite check, not a passed suite.
3. Inventory the non-test reusable files under `tools/impact` and `tools/proofline` using the distribution's `prepareTarget`/`assertCopiedCore` contract. Copy unchanged core bytes from the chosen source; reconcile additions and removals explicitly. Preserve target-owned app code, manifest, routes, test bindings, lifecycle and workflow contracts. Do not replace them with the CRM or work-orders product.
4. Commit the upgrade in the target's existing history and record real `IMPACT_BASE`/`IMPACT_HEAD`. Append an upgrade event identifying changed paths and source commits; never rewrite earlier JSONL bytes. Preserve coverage floors. Harness changes normally require canonical-full fallback; impact diagnostics cannot replace full gates.

Schema/provider changes require a separately reviewed migration with failing compatibility fixtures. Do not relabel a new schema as v1, lower coverage minima, or reuse earlier native success at a new source revision. Optional actual-process runtime metadata remains a strict addition to v1 evidence; unknown fields still fail closed.

## Reverify before adoption

Run the target's own documented commands for static manifest validation, typecheck, discovery/selection, canonical unit and browser, measured coverage and its ratchet, append-only record governance, and production-negative auditing. Use genuine numeric-loopback fixtures and visible multi-screen workflows; never contact live providers or models. Confirm required identities genuinely pass without expected-failure/retry substitution. Verify the copied-core inventory again after execution.

For a release-quality change to this repository, repeat both frozen independent installations with separate stores/browser caches, the complete [fresh-state gate](TESTING.md#completion-gate), explicit scenario worker/shard checks and release directory/ZIP verification at the committed implementation head. Dependency reuse is useful for a bounded development rehearsal, but is not fresh-install evidence. Collect source/session/runtime/native identities and preserve failures as well as successes. Hosted compatibility and API artifact verification require their own actual hosted provenance.

## Revert or investigate

If any gate fails, retain that invocation and exact command before changing anything. Stop adoption and compare immutable core hashes, lockfile/browser/runtime resolution, target metadata and real source revisions. Restore the prior source inventory in the disposable copy and rerun its gates if needed; a rollback is another source change requiring fresh evidence. Do not edit a failing report into a pass. Artifact expiry and trusted-run recovery follow [release recovery](RELEASE_RECOVERY.md).

The November 2026 maintenance rehearsal exercises schema-1 core replacement from `024aa838ade882fdcca46e63a4ae665569c16fd0` to `d262c0c617193a1aa9988af26d2dde21ac512ba1` against an existing work-orders history. It is a local, dependency-reuse rehearsal, not a schema migration, new independent installation, hosted run or maintenance SLA.
