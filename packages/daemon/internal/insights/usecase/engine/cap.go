package engine

import (
	"cmp"
	"slices"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

// capAndOrder bounds the episodes of a condition and returns them in time order, ties broken by
// catalog order, which is what makes the earliest-match join deterministic.
func capAndOrder(episodes []located, limit int) []located {
	if limit > 0 && len(episodes) > limit {
		episodes = spreadOverIncidents(episodes, limit)
	}

	slices.SortStableFunc(episodes, compareLocated)

	return episodes
}

// incident is the episodes of one kind that overlap in time, whichever series they are on: an
// outage is a gap in every series at once, and it is one thing that happened, not forty.
type incident struct {
	kind domain.Direction

	// members are strongest first.
	members []located
}

func (grouped incident) strongest() located {
	return grouped.members[0]
}

// seat is where an episode sits when the cap is filled: behind every episode that is stronger
// within its own incident, and then behind the incidents of its kind that are stronger than its own.
type seat struct {
	episode      located
	memberRank   int
	incidentRank int
}

// spreadOverIncidents keeps limit episodes, the strongest of every incident before the second
// strongest of any. Keeping simply the strongest episodes let one incident crowd out the rest: two
// outages across forty series are eighty gaps, the thirty-two longest all belong to the longer
// outage, and the shorter one was never reported.
//
// Incidents are ranked against others of their own kind only. Magnitude ranks episodes of one
// detector: a gap's is a count of samples and a reset's a fraction below one, so ranked together
// every reset lost to every gap.
func spreadOverIncidents(episodes []located, limit int) []located {
	seats := make([]seat, 0, len(episodes))

	for _, ofKind := range rankedByKind(incidentsOf(episodes)) {
		for incidentRank, grouped := range ofKind {
			for memberRank, member := range grouped.members {
				seats = append(seats, seat{episode: member, memberRank: memberRank, incidentRank: incidentRank})
			}
		}
	}

	slices.SortStableFunc(seats, func(left, right seat) int {
		return cmp.Or(
			cmp.Compare(left.memberRank, right.memberRank),
			cmp.Compare(left.incidentRank, right.incidentRank),
			compareLocated(left.episode, right.episode),
		)
	})

	kept := make([]located, 0, limit)
	for _, seated := range seats[:limit] {
		kept = append(kept, seated.episode)
	}

	return kept
}

// incidentsOf groups the episodes of each kind that overlap in time, an episode joining the
// incident it starts inside of. Its members come out strongest first.
func incidentsOf(episodes []located) []incident {
	ordered := slices.Clone(episodes)
	slices.SortStableFunc(ordered, func(left, right located) int {
		return cmp.Or(cmp.Compare(left.episode.Direction, right.episode.Direction), compareLocated(left, right))
	})

	var incidents []incident

	reach := int64(0)

	for _, episode := range ordered {
		last := len(incidents) - 1
		if last >= 0 && incidents[last].kind == episode.episode.Direction && episode.onset <= reach {
			incidents[last].members = append(incidents[last].members, episode)
			reach = max(reach, episode.end)

			continue
		}

		incidents = append(incidents, incident{kind: episode.episode.Direction, members: []located{episode}})
		reach = episode.end
	}

	for _, grouped := range incidents {
		slices.SortStableFunc(grouped.members, strongerFirst)
	}

	return incidents
}

// rankedByKind splits incidents, which arrive grouped by kind, into one list a kind, each
// strongest first.
func rankedByKind(incidents []incident) [][]incident {
	var byKind [][]incident

	for _, grouped := range incidents {
		last := len(byKind) - 1
		if last >= 0 && byKind[last][0].kind == grouped.kind {
			byKind[last] = append(byKind[last], grouped)

			continue
		}

		byKind = append(byKind, []incident{grouped})
	}

	for _, ofKind := range byKind {
		slices.SortStableFunc(ofKind, func(left, right incident) int { return strongerFirst(left.strongest(), right.strongest()) })
	}

	return byKind
}

func strongerFirst(left, right located) int {
	return cmp.Or(cmp.Compare(right.episode.Magnitude, left.episode.Magnitude), compareLocated(left, right))
}
