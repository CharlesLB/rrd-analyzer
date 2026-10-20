package usecase_test

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"reflect"
	"testing"

	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
	exportUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/usecase"
)

// sourceShelf serves one analysis' source files from memory and records where a save went.
type sourceShelf struct {
	set       exportDomain.SourceSet
	contents  map[string]string
	target    string
	suggested []string
	written   map[string][]byte
}

func (shelf *sourceShelf) Sources(context.Context, string) (exportDomain.SourceSet, error) {
	return shelf.set, nil
}

func (shelf *sourceShelf) Read(_ context.Context, path string) ([]byte, error) {
	content, found := shelf.contents[path]
	if !found {
		return nil, exportDomain.ErrSourceUnreadable
	}

	return []byte(content), nil
}

// Recognises takes every file for a source but the ones holding notASource, so each test says for
// itself which file is the stranger.
func (shelf *sourceShelf) Recognises(content []byte) bool {
	return string(content) != notASource
}

const notASource = "-----BEGIN OPENSSH PRIVATE KEY-----"

func (shelf *sourceShelf) PickSaveTarget(_ context.Context, suggestedName string) (string, error) {
	shelf.suggested = append(shelf.suggested, suggestedName)

	return shelf.target, nil
}

func (shelf *sourceShelf) Write(_ context.Context, path string, content []byte) error {
	if shelf.written == nil {
		shelf.written = map[string][]byte{}
	}

	shelf.written[path] = content

	return nil
}

func newSourceService(shelf *sourceShelf) *exportUsecase.Service {
	return exportUsecase.NewService(exportUsecase.Dependencies{Source: &recordingSource{}, Library: shelf, Reader: shelf, Format: shelf, Picker: shelf, Writer: shelf})
}

func archivedFiles(t *testing.T, content []byte) map[string]string {
	t.Helper()

	archive, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("open the archive: %v", err)
	}

	files := make(map[string]string, len(archive.File))
	for _, entry := range archive.File {
		opened, err := entry.Open()
		if err != nil {
			t.Fatalf("open %q: %v", entry.Name, err)
		}

		read, err := io.ReadAll(opened)
		_ = opened.Close()
		if err != nil {
			t.Fatalf("read %q: %v", entry.Name, err)
		}

		files[entry.Name] = string(read)
	}

	return files
}

func TestEncodeSourcesOfOneSourceCopiesThatFileUnderItsOwnName(t *testing.T) {
	shelf := &sourceShelf{
		set:      exportDomain.SourceSet{AnalysisName: "Capacity", Files: []exportDomain.SourceFile{{Name: "cpu.rrd", Path: "/data/cpu.rrd"}}},
		contents: map[string]string{"/data/cpu.rrd": "RRD cpu"},
	}

	document, err := newSourceService(shelf).EncodeSources(context.Background(), "a1")
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	if document.FileName != "cpu.rrd" || string(document.Content) != "RRD cpu" || document.FileCount != 1 {
		t.Errorf("document = %q holding %q (%d files), want cpu.rrd holding its bytes", document.FileName, document.Content, document.FileCount)
	}
}

func TestEncodeSourcesOfSeveralSourcesArchivesThemUnderTheAnalysisNameAndNumbersARepeatedName(t *testing.T) {
	shelf := &sourceShelf{
		set: exportDomain.SourceSet{AnalysisName: "Atlas prod · capacity", Files: []exportDomain.SourceFile{
			{Name: "cpu.rrd", Path: "/hosts/a/cpu.rrd"},
			{Name: "cpu.rrd", Path: "/hosts/b/cpu.rrd"},
			{Name: "memory.rrd", Path: "/hosts/a/memory.rrd"},
		}},
		contents: map[string]string{"/hosts/a/cpu.rrd": "cpu a", "/hosts/b/cpu.rrd": "cpu b", "/hosts/a/memory.rrd": "memory a"},
	}

	document, err := newSourceService(shelf).EncodeSources(context.Background(), "a1")
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	want := map[string]string{"cpu.rrd": "cpu a", "cpu-2.rrd": "cpu b", "memory.rrd": "memory a"}
	if got := archivedFiles(t, document.Content); !reflect.DeepEqual(got, want) {
		t.Errorf("archive holds %v, want %v", got, want)
	}

	if document.FileName != "atlas-prod-capacity.zip" || document.FileCount != 3 {
		t.Errorf("document = %q of %d files, want atlas-prod-capacity.zip of 3", document.FileName, document.FileCount)
	}
}

func TestEncodeSourcesOfARepeatedNameThatMeetsASourceAlreadyNumberedNumbersItAgain(t *testing.T) {
	shelf := &sourceShelf{
		set: exportDomain.SourceSet{AnalysisName: "Capacity", Files: []exportDomain.SourceFile{
			{Name: "cpu.rrd", Path: "/hosts/a/cpu.rrd"},
			{Name: "cpu.rrd", Path: "/hosts/b/cpu.rrd"},
			{Name: "cpu-2.rrd", Path: "/hosts/c/cpu-2.rrd"},
		}},
		contents: map[string]string{"/hosts/a/cpu.rrd": "cpu a", "/hosts/b/cpu.rrd": "cpu b", "/hosts/c/cpu-2.rrd": "cpu c"},
	}

	document, err := newSourceService(shelf).EncodeSources(context.Background(), "a1")
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	want := map[string]string{"cpu.rrd": "cpu a", "cpu-2.rrd": "cpu b", "cpu-2-2.rrd": "cpu c"}
	if got := archivedFiles(t, document.Content); !reflect.DeepEqual(got, want) {
		t.Errorf("archive holds %v, want %v", got, want)
	}
}

func TestSourcesArchiveNameFallsBackWhenTheAnalysisNameHasNothingToSlug(t *testing.T) {
	if got := exportUsecase.SourcesArchiveName("· ·"); got != "rrd.zip" {
		t.Errorf("SourcesArchiveName = %q, want rrd.zip", got)
	}
}

func TestEncodeSourcesRefusesASourceWithoutAPathBeforeReadingAnything(t *testing.T) {
	shelf := &sourceShelf{set: exportDomain.SourceSet{Files: []exportDomain.SourceFile{{Name: "picked.rrd"}}}}

	if _, err := newSourceService(shelf).EncodeSources(context.Background(), "a1"); !errors.Is(err, exportDomain.ErrSourceUnlocated) {
		t.Fatalf("err = %v, want %v", err, exportDomain.ErrSourceUnlocated)
	}
}

func TestEncodeSourcesRefusesAnAnalysisWithoutSources(t *testing.T) {
	if _, err := newSourceService(&sourceShelf{}).EncodeSources(context.Background(), "a1"); !errors.Is(err, exportDomain.ErrNothingToExport) {
		t.Fatalf("err = %v, want %v", err, exportDomain.ErrNothingToExport)
	}
}

func TestSaveSourcesWritesTheCopyWhereTheSaveDialogPoints(t *testing.T) {
	shelf := &sourceShelf{
		set:      exportDomain.SourceSet{Files: []exportDomain.SourceFile{{Name: "cpu.rrd", Path: "/data/cpu.rrd"}}},
		contents: map[string]string{"/data/cpu.rrd": "RRD cpu"},
		target:   "/exports/cpu-copy.rrd",
	}

	saved, err := newSourceService(shelf).SaveSources(context.Background(), "a1")
	if err != nil {
		t.Fatalf("save: %v", err)
	}

	if saved.Path != "/exports/cpu-copy.rrd" || saved.FileCount != 1 || string(shelf.written[saved.Path]) != "RRD cpu" {
		t.Errorf("saved %+v, wrote %q; want the source's bytes at the picked target", saved, shelf.written[saved.Path])
	}

	if !reflect.DeepEqual(shelf.suggested, []string{"cpu.rrd"}) {
		t.Errorf("suggested %v, want the source's own name", shelf.suggested)
	}
}

func TestSaveSourcesWritesNothingWhenTheSaveDialogIsCancelled(t *testing.T) {
	shelf := &sourceShelf{
		set:      exportDomain.SourceSet{Files: []exportDomain.SourceFile{{Name: "cpu.rrd", Path: "/data/cpu.rrd"}}},
		contents: map[string]string{"/data/cpu.rrd": "RRD cpu"},
	}

	saved, err := newSourceService(shelf).SaveSources(context.Background(), "a1")

	if err != nil || saved != (exportDomain.SavedSources{}) || len(shelf.written) != 0 {
		t.Errorf("saved %+v, %v, wrote %d files; want nothing written", saved, err, len(shelf.written))
	}
}

func TestEncodeSources_AFileThatIsNotASource_IsRefusedAndNothingIsCopied(t *testing.T) {
	tests := []struct {
		name      string
		giveFiles []exportDomain.SourceFile
	}{
		{name: "alone", giveFiles: []exportDomain.SourceFile{{Name: "id_rsa", Path: "/home/dev/.ssh/id_rsa"}}},
		{name: "among sources", giveFiles: []exportDomain.SourceFile{{Name: "cpu.rrd", Path: "/data/cpu.rrd"}, {Name: "id_rsa", Path: "/home/dev/.ssh/id_rsa"}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shelf := &sourceShelf{
				set:      exportDomain.SourceSet{AnalysisName: "Capacity", Files: tt.giveFiles},
				contents: map[string]string{"/data/cpu.rrd": "RRD cpu", "/home/dev/.ssh/id_rsa": notASource},
			}

			document, err := newSourceService(shelf).EncodeSources(context.Background(), "a1")

			if !errors.Is(err, exportDomain.ErrNotASource) || len(document.Content) != 0 {
				t.Errorf("err = %v with %d bytes handed over, want %v and none", err, len(document.Content), exportDomain.ErrNotASource)
			}
		})
	}
}
