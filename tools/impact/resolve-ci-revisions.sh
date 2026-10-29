#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'CI revision authority error: %s\n' "$1" >&2
  exit 1
}

event_name="${GITHUB_EVENT_NAME:-}"
requested_head="${IMPACT_HEAD:-}"
[[ -n "$event_name" ]] || fail "missing GITHUB_EVENT_NAME"
[[ -n "$requested_head" ]] || fail "missing IMPACT_HEAD"

case "$event_name" in
  workflow_dispatch)
    manual_base_ref="${PROOFLINE_MANUAL_BASE_REF:-}"
    case "$manual_base_ref" in
      main | master) ;;
      *) fail "manual base ref must be the reviewed main or master choice" ;;
    esac
    requested_base="refs/remotes/origin/${manual_base_ref}"
    ;;
  pull_request | push)
    requested_base="${IMPACT_BASE:-}"
    [[ -n "$requested_base" ]] || fail "missing event-supplied IMPACT_BASE"
    ;;
  *) fail "unsupported event ${event_name}" ;;
esac

[[ "$(git rev-parse --is-shallow-repository 2>/dev/null)" == "false" ]] ||
  fail "repository history is shallow or unavailable"
resolved_base="$(git rev-parse --verify "${requested_base}^{commit}" 2>/dev/null)" ||
  fail "base authority does not resolve: ${requested_base}"
resolved_head="$(git rev-parse --verify "${requested_head}^{commit}" 2>/dev/null)" ||
  fail "head authority does not resolve: ${requested_head}"
checkout_head="$(git rev-parse --verify "HEAD^{commit}" 2>/dev/null)" ||
  fail "checkout HEAD does not resolve"
[[ "$resolved_head" == "$checkout_head" ]] ||
  fail "checkout HEAD differs from the event-supplied head authority"

merge_bases="$(git merge-base --all "$resolved_base" "$resolved_head" 2>/dev/null)" ||
  fail "base and head have no merge base"
merge_base_count="$(printf '%s\n' "$merge_bases" | awk 'NF { count += 1 } END { print count + 0 }')"
[[ "$merge_base_count" == "1" ]] || fail "base and head do not have exactly one merge base"

printf 'IMPACT_BASE=%s\n' "$resolved_base"
printf 'IMPACT_HEAD=%s\n' "$resolved_head"
