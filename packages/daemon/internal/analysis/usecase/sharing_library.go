package usecase

import (
	"context"

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

// Arrange gives an analysis the owner's name, canvas, chart library order and series colors, through
// the rules a person's own edits go through. A list a state left out is stored empty by the store,
// the way every absent list of an analysis is.
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

	if err := library.analyses.SaveCanvas(callerContext, analysisID, arrangement.Canvas); err != nil {
		return err
	}

	if err := library.analyses.SaveLibraryOrder(callerContext, analysisID, arrangement.LibraryOrder); err != nil {
		return err
	}

	return library.analyses.SaveSeriesColors(callerContext, analysisID, arrangement.SeriesColors)
}

func (library *SharingLibrary) Delete(callerContext context.Context, analysisID string) error {
	return library.analyses.Delete(callerContext, analysisID)
}
