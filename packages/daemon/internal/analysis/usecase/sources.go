package usecase

import (
	"context"
	"fmt"
	"slices"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// AddedSources is an analysis after sources were added to it, and how many of the files asked for
// it did not already hold.
type AddedSources struct {
	Analysis analysisDomain.Analysis
	Added    int
}

// AddSources adds files to an analysis after the ones it already reads. A file the analysis already
// lists is skipped, so picking the same files twice adds them once, and the count reported is the
// store's: two requests for the same file at the same moment add it once between them. The new files
// are read before they are stored: one that cannot be read is refused here, rather than kept and
// failing the whole analysis every time it is opened. What that read parsed is then put after the
// series already held, so adding one file to an analysis of a hundred reads one file, once.
func (service *Service) AddSources(callerContext context.Context, analysisID string, files []analysisDomain.SourceFile) (AddedSources, error) {
	if len(files) == 0 {
		return AddedSources{}, analysisDomain.ErrNoSources
	}

	analysis, err := service.find(callerContext, analysisID)
	if err != nil {
		return AddedSources{}, err
	}

	unlisted := analysisDomain.SourcesNotListed(analysis.Files, files)
	if len(unlisted) == 0 {
		return AddedSources{Analysis: analysis}, nil
	}

	read, err := service.loader.Load(callerContext, unlisted)
	if err != nil {
		return AddedSources{}, fmt.Errorf("read the sources added to %q: %w", analysis.Name, err)
	}

	added, err := service.store.AddSources(callerContext, analysisID, unlisted)
	if err != nil {
		return AddedSources{}, fmt.Errorf("add sources: %w", err)
	}

	updated, err := service.find(callerContext, analysisID)
	if err != nil {
		service.bundles.Forget(analysisID)

		return AddedSources{}, err
	}

	service.bundles.Amend(analysisID, func(held parsedSources) (parsedSources, bool) {
		return held.extendedBy(sourcesAdded{requested: unlisted, added: added, series: read, analysis: updated})
	})

	return AddedSources{Analysis: updated, Added: len(added)}, nil
}

// sourcesAdded is one addition as the store settled it: the files asked for and the ones it wrote,
// the series read out of the files asked for, and the analysis as it stands afterwards.
type sourcesAdded struct {
	requested []analysisDomain.SourceFile
	added     []analysisDomain.SourceFile
	series    []seriesDomain.Series
	analysis  analysisDomain.Analysis
}

// extendedBy is the parsed series with the series of the added files after them, named and coloured
// by position exactly as reading every file again would name them, which costs nothing because the
// added files were already read to check them.
//
// It declines whenever that would not be the same as reading afresh. The series read belong to the
// files asked for, so the store must have written every one of them; and the series kept here must
// have been read from precisely the files the analysis listed before the addition, which they are
// not when another addition landed in between or a read begun after this one already holds the new
// files. And every file has to be one on disk: a source with no path is not read but stood in for,
// and what stands in for it is the loader's to decide over all the files it is handed together.
// Declining only costs the read this saves.
func (held parsedSources) extendedBy(addition sourcesAdded) (parsedSources, bool) {
	if !slices.Equal(addition.added, addition.requested) || !slices.Equal(addition.analysis.Files, slices.Concat(held.files, addition.added)) {
		return parsedSources{}, false
	}

	if slices.ContainsFunc(addition.analysis.Files, func(file analysisDomain.SourceFile) bool { return file.Path == "" }) {
		return parsedSources{}, false
	}

	return parsedSources{
		bundle: assemble(addition.analysis, slices.Concat(held.bundle.Series, addition.series)),
		files:  addition.analysis.Files,
	}, true
}
