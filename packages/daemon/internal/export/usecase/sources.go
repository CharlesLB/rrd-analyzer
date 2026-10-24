package usecase

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
)

const (
	archiveFileExtension = ".zip"
	singleSourceCopy     = 1
	firstRepeatNumber    = 2
)

// EncodeSources copies the files an analysis was created from: the one file byte for byte, or a zip
// archive named after the analysis holding every file when there are several. A file that is not a
// source is refused and nothing is copied: an analysis can be created over any path, and only its
// sources are its to hand out.
func (service *Service) EncodeSources(callerContext context.Context, analysisID string) (exportDomain.SourcesDocument, error) {
	set, err := service.library.Sources(callerContext, analysisID)
	if err != nil {
		return exportDomain.SourcesDocument{}, err
	}

	if len(set.Files) == 0 {
		return exportDomain.SourcesDocument{}, exportDomain.ErrNothingToExport
	}

	contents, err := service.readSources(callerContext, set.Files)
	if err != nil {
		return exportDomain.SourcesDocument{}, err
	}

	if len(set.Files) == singleSourceCopy {
		return exportDomain.SourcesDocument{FileName: filepath.Base(set.Files[0].Name), Content: contents[0], FileCount: singleSourceCopy}, nil
	}

	archive, err := archiveOf(set.Files, contents)
	if err != nil {
		return exportDomain.SourcesDocument{}, err
	}

	return exportDomain.SourcesDocument{FileName: SourcesArchiveName(set.AnalysisName), Content: archive, FileCount: len(set.Files)}, nil
}

// SaveSources writes the copy of the sources wherever the native save dialog points; a cancelled
// dialog writes nothing and reports an empty result.
func (service *Service) SaveSources(callerContext context.Context, analysisID string) (exportDomain.SavedSources, error) {
	document, err := service.EncodeSources(callerContext, analysisID)
	if err != nil {
		return exportDomain.SavedSources{}, err
	}

	path, err := service.saveToPickedTarget(callerContext, document.FileName, document.Content)
	if err != nil || path == "" {
		return exportDomain.SavedSources{}, err
	}

	return exportDomain.SavedSources{Path: path, FileCount: document.FileCount}, nil
}

// SourcesArchiveName names the archive of several sources after the analysis they were opened as.
func SourcesArchiveName(analysisName string) string {
	slug := slugOf(analysisName)
	if slug == "" {
		slug = exportFilePrefix
	}

	return slug + archiveFileExtension
}

func (service *Service) readSources(callerContext context.Context, files []exportDomain.SourceFile) ([][]byte, error) {
	contents := make([][]byte, 0, len(files))
	for _, file := range files {
		if file.Path == "" {
			return nil, fmt.Errorf("%q: %w", file.Name, exportDomain.ErrSourceUnlocated)
		}

		content, err := service.reader.Read(callerContext, file.Path)
		if err != nil {
			return nil, err
		}

		if !service.format.Recognises(content) {
			return nil, fmt.Errorf("%q: %w", file.Name, exportDomain.ErrNotASource)
		}

		contents = append(contents, content)
	}

	return contents, nil
}

// archiveOf zips the sources. Adding an entry fails on a name too long for the format, and writing
// one fails when the name makes it a directory, as a source named "/" does. Closing writes only the
// central directory into a bytes.Buffer, which never fails a write, so the error Close returns is
// always nil here.
func archiveOf(files []exportDomain.SourceFile, contents [][]byte) ([]byte, error) {
	var buffer bytes.Buffer

	archive := zip.NewWriter(&buffer)
	for index, entryName := range distinctEntryNames(files) {
		entry, err := archive.Create(entryName)
		if err != nil {
			return nil, fmt.Errorf("add %q to the archive: %w", entryName, err)
		}

		if _, err := entry.Write(contents[index]); err != nil {
			return nil, fmt.Errorf("write %q into the archive: %w", entryName, err)
		}
	}

	_ = archive.Close()

	return buffer.Bytes(), nil
}

// distinctEntryNames names each file in the archive by its own base name. Two sources may share one,
// the same metric kept by two hosts, so a repeat is numbered before its extension rather than
// overwriting the file already in the archive. A name is numbered until it is free, since a source
// can itself be called cpu-2.rrd.
func distinctEntryNames(files []exportDomain.SourceFile) []string {
	taken := make(map[string]bool, len(files))
	names := make([]string, 0, len(files))

	for _, file := range files {
		name := freeEntryName(filepath.Base(file.Name), taken)
		taken[name] = true
		names = append(names, name)
	}

	return names
}

func freeEntryName(base string, taken map[string]bool) string {
	if !taken[base] {
		return base
	}

	extension := filepath.Ext(base)
	stem := strings.TrimSuffix(base, extension)

	for number := firstRepeatNumber; ; number++ {
		if name := stem + string(slugSeparator) + strconv.Itoa(number) + extension; !taken[name] {
			return name
		}
	}
}
