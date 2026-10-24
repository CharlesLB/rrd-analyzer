package desktop

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
	insightsDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/version"
)

var pngSignature = []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}

func sourceAt(path string) surface.FileInfo {
	return surface.FileInfo{Name: filepath.Base(path), Path: path, Size: int64(len(oneSourceDump))}
}

func createdOver(t *testing.T, api *API, paths ...string) surface.AnalysisView {
	t.Helper()

	files := make([]surface.FileInfo, 0, len(paths))
	for _, path := range paths {
		files = append(files, sourceAt(path))
	}

	created, err := api.CreateAnalysis("Capacity", files)
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	return created
}

func TestNewAPI_MissingSurfaceOrDialogs_PanicsNamingThem(t *testing.T) {
	windowDialogs := newDialogs(&nativeStandIn{}, analysisInfra.NewSourceDescriber())

	tests := []struct {
		name          string
		giveConstruct func()
	}{
		{name: "no surface", giveConstruct: func() { NewAPI(nil, windowDialogs) }},
		{name: "no dialogs", giveConstruct: func() { NewAPI(operationsOver(t, windowDialogs), nil) }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Error("construction went through, want a panic naming what is missing")
				}
			}()

			tt.giveConstruct()
		})
	}
}

func TestAPI_BeforeTheWindowStarts_ReachesTheLibrary(t *testing.T) {
	listed, err := apiOver(t, &nativeStandIn{}).ListAnalyses()

	if err != nil || len(listed) != 0 {
		t.Fatalf("listed = %+v, %v; want an empty library", listed, err)
	}
}

func TestAPI_AWindowThatHasClosed_EndsTheCallsMadeAfter(t *testing.T) {
	api := apiOver(t, &nativeStandIn{})
	closed, closeWindow := context.WithCancel(windowContext())
	api.start(closed)
	closeWindow()

	_, err := api.ListAnalyses()

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want %v", err, context.Canceled)
	}
}

func TestAPISelectRRDFiles_OpensTheDialogInTheWindowAndDescribesWhatItPicked(t *testing.T) {
	path := writtenDump(t, "cpu.xml")
	native := &nativeStandIn{picked: []string{path}}
	api := apiOver(t, native)
	api.start(windowContext())

	picked, err := api.SelectRRDFiles()

	if err != nil || !reflect.DeepEqual(picked, []surface.FileInfo{sourceAt(path)}) {
		t.Fatalf("picked = %+v, %v; want %s described", picked, err, path)
	}

	if !isWindowContext(native.dialogContexts[0]) {
		t.Error("the dialog opened outside the window's context")
	}
}

func TestAPIDescribeSources_DescribesADroppedFolderAsTheSourcesInsideIt(t *testing.T) {
	path := writtenDump(t, "cpu.xml")

	described, err := apiOver(t, &nativeStandIn{}).DescribeSources([]string{filepath.Dir(path)})

	if err != nil || !reflect.DeepEqual(described, []surface.FileInfo{sourceAt(path)}) {
		t.Fatalf("described = %+v, %v; want %s", described, err, path)
	}
}

func TestAPI_CreateRenameAndDelete_AreWhatTheLibraryListsAfterward(t *testing.T) {
	api := apiOver(t, &nativeStandIn{})
	created := createdOver(t, api, writtenDump(t, "cpu.xml"))

	if _, err := api.RenameAnalysis(created.ID, "Atlas prod"); err != nil {
		t.Fatalf("rename: %v", err)
	}

	renamed, err := api.ListAnalyses()
	if err != nil || len(renamed) != 1 || renamed[0].Name != "Atlas prod" {
		t.Fatalf("listed after the rename = %+v, %v; want Atlas prod alone", renamed, err)
	}

	if err := api.DeleteAnalysis(created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	if remaining, err := api.ListAnalyses(); err != nil || len(remaining) != 0 {
		t.Errorf("listed after the delete = %+v, %v; want an empty library", remaining, err)
	}
}

func TestAPIAddSources_AnswersHowManyOfTheFilesWereNew(t *testing.T) {
	api := apiOver(t, &nativeStandIn{})
	listed := writtenDump(t, "cpu.xml")
	created := createdOver(t, api, listed)

	added, err := api.AddSources(created.ID, []surface.FileInfo{sourceAt(listed), sourceAt(writtenDump(t, "memory.xml"))})

	if err != nil || added.Added != 1 || added.Analysis.ID != created.ID {
		t.Fatalf("added = %+v, %v; want the one file new to %s", added, err, created.ID)
	}
}

func TestAPI_ASavedCanvasOrderAndColor_AreWhatTheAnalysisReopensWith(t *testing.T) {
	api := apiOver(t, &nativeStandIn{})
	created := createdOver(t, api, writtenDump(t, "cpu.xml"), writtenDump(t, "memory.xml"))
	opened, err := api.OpenAnalysis(created.ID)
	if err != nil || len(opened.Series) != 2 {
		t.Fatalf("opened %+v, %v; want two series", opened.Series, err)
	}

	first, second := opened.Series[0], opened.Series[1]
	saves := []error{
		api.SaveCanvas(created.ID, []analysisDomain.CanvasChart{{SeriesID: first.ID, Label: first.Label}}),
		api.SaveLibraryOrder(created.ID, []analysisDomain.ChartReference{{SeriesID: second.ID, Label: second.Label}}),
		api.SaveSeriesColor(created.ID, analysisDomain.SeriesColor{SeriesID: second.ID, Label: second.Label, Color: "#AABBCC"}),
	}
	if err := errors.Join(saves...); err != nil {
		t.Fatalf("save: %v", err)
	}

	reopened, err := api.OpenAnalysis(created.ID)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}

	if len(reopened.Canvas) != 1 || reopened.Series[0].ID != second.ID || reopened.Series[0].Color != "#aabbcc" {
		t.Errorf("reopened on %d charts listing %s first in %q, want one chart and %s first in #aabbcc",
			len(reopened.Canvas), reopened.Series[0].ID, reopened.Series[0].Color, second.ID)
	}
}

func TestAPIMissingSources_NamesTheFileNoLongerOnDisk(t *testing.T) {
	api := apiOver(t, &nativeStandIn{})
	path := writtenDump(t, "cpu.xml")
	created := createdOver(t, api, path)
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove the source: %v", err)
	}

	missing, err := api.MissingSources(created.ID)

	if err != nil || len(missing) != 1 || missing[0].Path != path {
		t.Fatalf("missing = %+v, %v; want %s", missing, err, path)
	}
}

func TestAPI_FetchSeriesAndChart_AnswerAWindowForEachSeriesAsked(t *testing.T) {
	api := apiOver(t, &nativeStandIn{})
	created := createdOver(t, api, writtenDump(t, "cpu.xml"))
	bundle, err := api.OpenAnalysis(created.ID)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	request := analysisUsecase.WindowRequest{
		AnalysisID:        created.ID,
		SeriesIDs:         []string{bundle.Series[0].ID},
		FromMilliseconds:  bundle.FromMilliseconds,
		UntilMilliseconds: bundle.UntilMilliseconds,
		Columns:           3,
	}

	windows, windowsErr := api.FetchSeries(request)
	chart, chartErr := api.FetchChart(request)

	if windowsErr != nil || len(windows) != 1 || windows[0].SeriesID != bundle.Series[0].ID {
		t.Errorf("series = %+v, %v; want one window of %s", windows, windowsErr, bundle.Series[0].ID)
	}

	if chartErr != nil || len(chart.Windows) != 1 || len(chart.Statistics) != 1 {
		t.Errorf("chart = %+v, %v; want one window and its statistics", chart, chartErr)
	}
}

func TestAPI_Exports_WriteWhereTheSaveDialogPoints(t *testing.T) {
	native := &nativeStandIn{saveDirectory: t.TempDir()}
	api := apiOver(t, native)
	created := createdOver(t, api, writtenDump(t, "cpu.xml"))

	csv, csvErr := api.ExportCSV(surface.ExportRequest{AnalysisID: created.ID, SeriesIDs: []string{"s0"}, UntilMilliseconds: 900000})
	image, imageErr := api.ExportImage("chart.png", pngSignature)
	sources, sourcesErr := api.ExportSources(created.ID)
	if err := errors.Join(csvErr, imageErr, sourcesErr); err != nil {
		t.Fatalf("export: %v", err)
	}

	tests := []struct {
		name        string
		givePath    string
		wantContent string
	}{
		{name: "the csv", givePath: csv.Path, wantContent: "timestamp,"},
		{name: "the image", givePath: image, wantContent: string(pngSignature)},
		{name: "the sources", givePath: sources.Path, wantContent: oneSourceDump},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			written, err := os.ReadFile(tt.givePath)

			if err != nil || filepath.Dir(tt.givePath) != native.saveDirectory || !strings.HasPrefix(string(written), tt.wantContent) {
				t.Errorf("wrote %q at %q (%v), want it in %s starting %q", written, tt.givePath, err, native.saveDirectory, tt.wantContent)
			}
		})
	}
}

func TestAPI_SearchHistory_AnswersEachChangeWithTheFieldsHistory(t *testing.T) {
	api := apiOver(t, &nativeStandIn{})

	_, rememberErr := api.RememberSearch("library", "cpu")
	remembered, rememberAgainErr := api.RememberSearch("library", "memory")
	forgotten, forgetErr := api.ForgetSearch("library", "cpu")
	history, historyErr := api.SearchHistory("library")
	if err := errors.Join(rememberErr, rememberAgainErr, forgetErr, historyErr); err != nil {
		t.Fatalf("search history: %v", err)
	}

	if !reflect.DeepEqual(remembered, []string{"memory", "cpu"}) || !reflect.DeepEqual(forgotten, []string{"memory"}) || !reflect.DeepEqual(history, forgotten) {
		t.Errorf("remembered %q, forgotten %q, read back %q; want the latest first and cpu gone", remembered, forgotten, history)
	}
}

func TestAPIRunInsights_AnswersAReportStampedWithTheConfigurationInUse(t *testing.T) {
	api := apiOver(t, &nativeStandIn{})
	created := createdOver(t, api, writtenDump(t, "cpu.xml"))

	report, runErr := api.RunInsights("run-1", insightsDomain.Request{AnalysisID: created.ID, Scope: insightsDomain.ScopeAll})
	stamp, stampErr := api.InsightsConfiguration()
	if err := errors.Join(runErr, stampErr); err != nil {
		t.Fatalf("insights: %v", err)
	}

	if report.Analyzed.RulesetHash == "" || report.Analyzed.RulesetHash != stamp.RulesetHash || report.Analyzed.ClassifierHash != stamp.ClassifierHash {
		t.Errorf("report stamped %+v, configuration %+v; want the same non-empty hashes", report.Analyzed, stamp)
	}
}

func TestAPICancelInsights_ArrivingBeforeItsRun_StopsTheRun(t *testing.T) {
	api := apiOver(t, &nativeStandIn{})
	created := createdOver(t, api, writtenDump(t, "cpu.xml"))

	api.CancelInsights("run-1")
	_, err := api.RunInsights("run-1", insightsDomain.Request{AnalysisID: created.ID, Scope: insightsDomain.ScopeAll})

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want %v", err, context.Canceled)
	}
}

func TestAPIBuild_AnswersTheStampedIdentity(t *testing.T) {
	build := apiOver(t, &nativeStandIn{}).Build()

	if build.Version != version.Version || build.Summary != version.Summary() {
		t.Errorf("build = %+v, want version %q summarised %q", build, version.Version, version.Summary())
	}
}
