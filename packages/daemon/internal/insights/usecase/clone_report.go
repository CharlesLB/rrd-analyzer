package usecase

import (
	"slices"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

// cloneReport copies every slice and pointer, so a caller that edits the report it was handed
// cannot change what the next cache hit returns.
func cloneReport(report domain.Report) domain.Report {
	clone := report
	clone.Analyzed.SeriesUnclassified = slices.Clone(report.Analyzed.SeriesUnclassified)
	clone.Analyzed.Warnings = slices.Clone(report.Analyzed.Warnings)
	clone.Findings = make([]domain.Finding, len(report.Findings))

	for index, finding := range report.Findings {
		finding.Cause = cloneCause(finding.Cause)
		finding.Evidence = cloneEvidence(finding.Evidence)
		clone.Findings[index] = finding
	}

	return clone
}

func cloneCause(parts []domain.CausePart) []domain.CausePart {
	cloned := make([]domain.CausePart, len(parts))

	for index, part := range parts {
		if part.InstantMilliseconds != nil {
			instant := *part.InstantMilliseconds
			part.InstantMilliseconds = &instant
		}

		cloned[index] = part
	}

	return cloned
}

func cloneEvidence(items []domain.Evidence) []domain.Evidence {
	cloned := make([]domain.Evidence, len(items))

	for index, item := range items {
		item.FromValue = clonePointer(item.FromValue)
		item.ToValue = clonePointer(item.ToValue)

		spark := make([]*float64, len(item.Spark))
		for point, value := range item.Spark {
			spark[point] = clonePointer(value)
		}

		item.Spark = spark
		cloned[index] = item
	}

	return cloned
}

func clonePointer(value *float64) *float64 {
	if value == nil {
		return nil
	}

	copied := *value

	return &copied
}
