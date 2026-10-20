package usecase

import (
	"context"
	"path/filepath"

	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
)

// Dependencies is everything an export needs from the world: the series it reads, the source files
// a copy reads and the format that says they are sources, the dialog that says where the file goes,
// and the write that puts it there.
type Dependencies struct {
	Source  exportDomain.SeriesSource
	Library exportDomain.SourceLibrary
	Reader  exportDomain.SourceReader
	Format  exportDomain.SourceFormat
	Picker  exportDomain.SaveTargetPicker
	Writer  exportDomain.Writer
}

// Service composes exports out of the analysis library and saves them where a person points.
type Service struct {
	source  exportDomain.SeriesSource
	library exportDomain.SourceLibrary
	reader  exportDomain.SourceReader
	format  exportDomain.SourceFormat
	picker  exportDomain.SaveTargetPicker
	writer  exportDomain.Writer
}

func NewService(dependencies Dependencies) *Service {
	if dependencies.Source == nil {
		panic("export service: the series source is not wired")
	}

	if dependencies.Library == nil {
		panic("export service: the source library is not wired")
	}

	if dependencies.Reader == nil {
		panic("export service: the source reader is not wired")
	}

	if dependencies.Format == nil {
		panic("export service: the source format is not wired")
	}

	if dependencies.Picker == nil {
		panic("export service: the save target picker is not wired")
	}

	if dependencies.Writer == nil {
		panic("export service: the writer is not wired")
	}

	return &Service{
		source:  dependencies.Source,
		library: dependencies.Library,
		reader:  dependencies.Reader,
		format:  dependencies.Format,
		picker:  dependencies.Picker,
		writer:  dependencies.Writer,
	}
}

// SaveCSV encodes the export and writes it where the native save dialog points; a cancelled dialog
// writes nothing and reports an empty result.
func (service *Service) SaveCSV(callerContext context.Context, request exportDomain.CSVRequest) (exportDomain.SavedExport, error) {
	document, err := service.EncodeCSV(callerContext, request)
	if err != nil {
		return exportDomain.SavedExport{}, err
	}

	path, err := service.saveToPickedTarget(callerContext, document.FileName, document.Content)
	if err != nil || path == "" {
		return exportDomain.SavedExport{}, err
	}

	return exportDomain.SavedExport{Path: path, SampleCount: document.SampleCount, SeriesCount: document.SeriesCount}, nil
}

// SaveImage writes an image the frontend composed and encoded, wherever the native save dialog
// points. The frontend owns the palette and the typography, so the bytes arrive finished; only the
// base of the suggested name reaches the dialog, so a name can suggest a file but never a folder.
func (service *Service) SaveImage(callerContext context.Context, suggestedName string, content []byte) (string, error) {
	if len(content) == 0 {
		return "", exportDomain.ErrNothingToExport
	}

	return service.saveToPickedTarget(callerContext, filepath.Base(suggestedName), content)
}

// saveToPickedTarget writes the content wherever the native save dialog points, offering it the
// suggested name. A cancelled dialog writes nothing and reports an empty path.
func (service *Service) saveToPickedTarget(callerContext context.Context, suggestedName string, content []byte) (string, error) {
	path, err := service.picker.PickSaveTarget(callerContext, suggestedName)
	if err != nil || path == "" {
		return "", err
	}

	if err := service.writer.Write(callerContext, path, content); err != nil {
		return "", err
	}

	return path, nil
}

// EncodeCSV builds the CSV of the requested series over the window, and names it after the window
// that was asked for, though its rows cover the export grid laid around that window.
func (service *Service) EncodeCSV(callerContext context.Context, request exportDomain.CSVRequest) (exportDomain.CSVDocument, error) {
	bundle, err := service.source.Bundle(callerContext, request.AnalysisID)
	if err != nil {
		return exportDomain.CSVDocument{}, err
	}

	if len(request.SeriesIDs) == 0 {
		return exportDomain.CSVDocument{}, exportDomain.ErrNothingToExport
	}

	grid := ExportGrid(seriesNamed(bundle.Series, request.SeriesIDs), request.FromMilliseconds, request.UntilMilliseconds)

	windows, err := service.source.Windows(callerContext, request.AnalysisID, request.SeriesIDs, grid)
	if err != nil {
		return exportDomain.CSVDocument{}, err
	}

	table := Table(bundle, windows, grid.FromMilliseconds, grid.UntilMilliseconds)

	content, err := EncodeTable(table)
	if err != nil {
		return exportDomain.CSVDocument{}, err
	}

	return exportDomain.CSVDocument{
		FileName:    CSVFileName(table.SeriesNames, request.FromMilliseconds, request.UntilMilliseconds),
		Content:     content,
		SampleCount: len(table.Rows),
		SeriesCount: table.SeriesCount(),
	}, nil
}
