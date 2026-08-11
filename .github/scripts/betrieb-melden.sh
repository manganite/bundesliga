#!/usr/bin/env bash
# =============================================================================
#  Operational red/green signal as a GitHub issue.
#
#  Why an issue and not the built-in failure mail: a workflow started by a bot
#  dispatch does not reliably notify the operator, and that is exactly the
#  channel this repository depends on. Twice in one week the data was correct in
#  the repository while the site served an older state, and both times a human
#  noticed before the notification did (2026-08-08 dead deploy trigger,
#  2026-08-09..11 red test gate blocking four deploys). Issues notify reliably.
#
#  The open issue IS the state marker: open means this channel is red. It closes
#  itself on the next green run, in the same self-healing spirit as the
#  carry-forward marking — nobody has to remember to clear it.
#
#  One issue per workflow, found by an invisible marker in the body rather than
#  by title matching, so a retitled issue is still recognised. A repeated failure
#  comments on the open issue instead of opening another one.
#
#  Inputs (all required except BETRIEB_LAUF):
#    BETRIEB_STATUS    rot | gruen
#    BETRIEB_WORKFLOW  stable key, one per workflow (e.g. data, deploy)
#    BETRIEB_TITEL     human-readable workflow name
#    BETRIEB_LAUF      URL of the run
#    GH_TOKEN          GITHUB_TOKEN with `issues: write`
# =============================================================================
set -euo pipefail

: "${BETRIEB_STATUS:?BETRIEB_STATUS fehlt}"
: "${BETRIEB_WORKFLOW:?BETRIEB_WORKFLOW fehlt}"
: "${BETRIEB_TITEL:?BETRIEB_TITEL fehlt}"
lauf="${BETRIEB_LAUF:-(kein Lauf-Link)}"
stempel="$(date -u +'%Y-%m-%d %H:%M UTC')"

# Invisible, stable, and part of the body — the identity of the issue does not
# depend on its title.
marke="<!-- betrieb:${BETRIEB_WORKFLOW} -->"

# Validated before the first API call, so a typo costs a message and not a
# request.
case "${BETRIEB_STATUS}" in
  rot|gruen) ;;
  *) echo "betrieb: unbekannter Status '${BETRIEB_STATUS}' — erwartet rot|gruen" >&2; exit 1 ;;
esac

offen="$(gh issue list --label betrieb --state open --limit 100 --json number,body \
  --jq "map(select(.body // \"\" | contains(\"${marke}\"))) | .[0].number // empty")"

case "${BETRIEB_STATUS}" in
  rot)
    if [ -n "${offen}" ]; then
      # Already red. Comment rather than open a second issue — a multi-day
      # outage must stay one thread.
      gh issue comment "${offen}" --body \
        "Weiterhin rot: **${BETRIEB_TITEL}** um ${stempel}.

Lauf: ${lauf}"
      echo "betrieb: an Issue #${offen} kommentiert"
    else
      # The label may not exist yet on a fresh repository. Creating it must not
      # overwrite an existing one, hence no --force.
      gh label create betrieb \
        --color B60205 \
        --description "Betriebsmeldung: ein Workflow ist rot (schließt sich beim nächsten grünen Lauf selbst)" \
        >/dev/null 2>&1 || true

      # No error swallowing here: this job is its own signal, and a reporting
      # step that fails silently is the failure mode being fixed.
      neu="$(gh issue create \
        --title "Betrieb: ${BETRIEB_TITEL} ist rot" \
        --label betrieb \
        --body "${marke}
**${BETRIEB_TITEL}** ist fehlgeschlagen (${stempel}).

Lauf: ${lauf}

Dieses Issue ist der sichtbare Zustandsmerker für diesen Workflow: solange es
offen ist, ist der Kanal rot. Es **schließt sich selbst**, sobald derselbe
Workflow wieder grün läuft — es von Hand zu schließen unterdrückt nur die
Anzeige, nicht die Ursache.")"
      echo "betrieb: Issue eröffnet — ${neu}"
    fi
    ;;

  gruen)
    if [ -n "${offen}" ]; then
      gh issue comment "${offen}" --body \
        "Wieder grün: **${BETRIEB_TITEL}** um ${stempel}.

Lauf: ${lauf}

Wird automatisch geschlossen."
      gh issue close "${offen}" --reason completed
      echo "betrieb: Issue #${offen} geschlossen"
    else
      echo "betrieb: nichts offen, nichts zu tun"
    fi
    ;;
esac
