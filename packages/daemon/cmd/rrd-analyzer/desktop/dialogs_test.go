package desktop

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/messages"
)

var errDialogFailed = errors.New("the dialog could not be opened")

func TestNewDialogs_MissingCollaborator_PanicsNamingIt(t *testing.T) {
	tests := []struct {
		name          string
		giveConstruct func()
	}{
		{name: "no native dialogs", giveConstruct: func() { newDialogs(nil, analysisInfra.NewSourceDescriber()) }},
		{name: "no source describer", giveConstruct: func() { newDialogs(&nativeStandIn{}, nil) }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Error("construction went through, want a panic naming the missing collaborator")
				}
			}()

			tt.giveConstruct()
		})
	}
}

func TestDialogsPickSources_DescribesTheSourcesTheOpenDialogPicked(t *testing.T) {
	path := writtenDump(t, "cpu.xml")
	native := &nativeStandIn{picked: []string{path}}

	picked, err := newDialogs(native, analysisInfra.NewSourceDescriber()).PickSources(context.Background())

	want := []surface.FileInfo{{Name: "cpu.xml", Path: path, Size: int64(len(oneSourceDump))}}
	if err != nil || !reflect.DeepEqual(picked, want) {
		t.Fatalf("picked = %+v, %v; want %+v", picked, err, want)
	}

	opened := native.openedSources[0]
	if opened.Title != messages.PickSourcesTitle || len(opened.Filters) != 1 || opened.Filters[0].Pattern != messages.SourceFilterPattern {
		t.Errorf("the dialog was opened as %+v, want the source title and filter", opened)
	}
}

func TestDialogsPickSaveTarget_AnswersWhereTheSaveDialogPoints(t *testing.T) {
	directory := t.TempDir()
	native := &nativeStandIn{saveDirectory: directory}

	target, err := newDialogs(native, analysisInfra.NewSourceDescriber()).PickSaveTarget(context.Background(), "cpu.csv")

	if err != nil || target != filepath.Join(directory, "cpu.csv") {
		t.Fatalf("target = %q, %v; want cpu.csv in %s", target, err, directory)
	}

	if opened := native.openedSaves[0]; opened.Title != messages.SaveExportTitle || opened.DefaultFilename != "cpu.csv" {
		t.Errorf("the dialog was opened as %+v, want the export title offering cpu.csv", opened)
	}
}

func TestDialogs_ADialogThatCannotOpen_FailsWithTheReason(t *testing.T) {
	opener := newDialogs(&nativeStandIn{dialogErr: errDialogFailed}, analysisInfra.NewSourceDescriber())

	tests := []struct {
		name string
		give func() error
	}{
		{name: "the open dialog", give: func() error {
			_, err := opener.PickSources(context.Background())

			return err
		}},
		{name: "the save dialog", give: func() error {
			_, err := opener.PickSaveTarget(context.Background(), "cpu.csv")

			return err
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.give(); !errors.Is(err, errDialogFailed) {
				t.Errorf("err = %v, want %v", err, errDialogFailed)
			}
		})
	}
}

func TestDialogs_BeforeTheWindowStarts_OpenUnderTheCallersContext(t *testing.T) {
	native := &nativeStandIn{}

	if _, err := newDialogs(native, analysisInfra.NewSourceDescriber()).PickSaveTarget(context.Background(), "cpu.csv"); err != nil {
		t.Fatalf("pick: %v", err)
	}

	if isWindowContext(native.dialogContexts[0]) {
		t.Error("the dialog opened in a window's context before any window started")
	}
}

func TestDialogs_AfterTheWindowStarts_OpenParentedToTheWindow(t *testing.T) {
	native := &nativeStandIn{}
	opener := newDialogs(native, analysisInfra.NewSourceDescriber())
	opener.bindTo(windowContext())

	if _, err := opener.PickSaveTarget(context.Background(), "cpu.csv"); err != nil {
		t.Fatalf("pick: %v", err)
	}

	if !isWindowContext(native.dialogContexts[0]) {
		t.Error("the dialog opened outside the window's context, want it parented to the window")
	}
}
