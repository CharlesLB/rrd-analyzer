package usecase

import (
	"context"
	"fmt"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	sharingDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

// SharingLibrary is the analysis library as a live session reads and rebuilds it: the owner's side
// reads an analysis whole to publish it, and a viewer's side creates one over the files it
// downloaded and lays the owner's arrangement over it, through the same rules a person's own edits
// go through.
type SharingLibrary struct {
	analyses *Service
}

func NewSharingLibrary(analyses *Service) *SharingLibrary {
	if analyses == nil {
		panic("sharing library: the analysis service is not wired")
	}

	return &SharingLibrary{analyses: analyses}
}

func (library *SharingLibrary) Analysis(callerContext context.Context, analysisID string) (analysisDomain.Analysis, error) {
	return library.analyses.find(callerContext, analysisID)
}

func (library *SharingLibrary) Create(callerContext context.Context, name string, files []analysisDomain.SourceFile) (string, error) {
	created, err := library.analyses.Create(callerContext, name, files)
	if err != nil {
		return "", err
	}

	return created.ID, nil
}

func (library *SharingLibrary) AddSources(callerContext context.Context, analysisID string, files []analysisDomain.SourceFile) error {
	_, err := library.analyses.AddSources(callerContext, analysisID, files)

	return err
}

// Arrange gives an analysis the owner's name, canvas, chart library order and series colors. The
// colors are written whole, normalised the way a person's pick is, rather than one at a time: the
// owner may have given a series its default color back, and only replacing the list drops it.
func (library *SharingLibrary) Arrange(callerContext context.Context, analysisID string, arrangement sharingDomain.Arrangement) error {
	analysis, err := library.analyses.find(callerContext, analysisID)
	if err != nil {
		return err
	}

	if analysis.Name != arrangement.Name {
		if _, err := library.analyses.Rename(callerContext, analysisID, arrangement.Name); err != nil {
			return err
		}
	}

	if err := library.analyses.SaveCanvas(callerContext, analysisID, orEmpty(arrangement.Canvas)); err != nil {
		return err
	}

	if err := library.analyses.SaveLibraryOrder(callerContext, analysisID, orEmpty(arrangement.LibraryOrder)); err != nil {
		return err
	}

	colors := make([]analysisDomain.SeriesColor, 0, len(arrangement.SeriesColors))
	for _, color := range arrangement.SeriesColors {
		normalised, err := normalisedColor(color.Color)
		if err != nil {
			return fmt.Errorf("%q: %w", color.Color, err)
		}

		if normalised == defaultColor {
			continue
		}

		color.Color = normalised
		colors = append(colors, color)
	}

	if err := library.analyses.store.SaveSeriesColors(callerContext, analysisID, colors); err != nil {
		return fmt.Errorf("record the series colors: %w", err)
	}

	return nil
}

func (library *SharingLibrary) Delete(callerContext context.Context, analysisID string) error {
	return library.analyses.Delete(callerContext, analysisID)
}

// orEmpty is a list as an analysis stores it: empty rather than absent. A state written by a build
// that left a list out reads as null, and a stored null would read back as no list at all.
func orEmpty[T any](items []T) []T {
	if items == nil {
		return []T{}
	}

	return items
}
