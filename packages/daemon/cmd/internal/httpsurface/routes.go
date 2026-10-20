// Package httpsurface is the application surface spoken over HTTP: the routes the browser gateway
// calls, the bodies they read and write, and what each domain error means as a status. The
// development server serves it on a port; the browser edition serves it inside the tab, to a
// gateway that never leaves the page.
package httpsurface

import (
	"net/http"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
	insightsDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

// Routes is the whole surface, grouped the way the frontend uses it. The desktop binary reaches the
// same surface.Operations through Wails bindings instead, so nothing here may hold behaviour of its
// own: every handler parses, calls, and shapes.
func Routes(operations *surface.Operations) *http.ServeMux {
	mux := http.NewServeMux()

	registerBuildRoutes(mux, operations)
	registerLibraryRoutes(mux, operations)
	registerAnalysisRoutes(mux, operations)
	registerInsightsRoutes(mux, operations)
	registerExportRoutes(mux, operations)
	registerSearchHistoryRoutes(mux, operations)

	return mux
}

// registerInsightsRoutes takes the analysis from the path rather than the body, so a request can
// only ever run over the analysis its URL names.
func registerInsightsRoutes(mux *http.ServeMux, operations *surface.Operations) {
	mux.HandleFunc("POST /api/analyses/{id}/insights", func(writer http.ResponseWriter, request *http.Request) {
		var body insightsDomain.Request
		if !decode(writer, request, &body) {
			return
		}

		body.AnalysisID = request.PathValue("id")

		report, err := operations.RunInsights(request.Context(), body)
		respond(writer, report, err)
	})

	mux.HandleFunc("GET /api/insights/configuration", func(writer http.ResponseWriter, request *http.Request) {
		stamp, err := operations.InsightsConfiguration(request.Context())
		respond(writer, stamp, err)
	})
}

func registerBuildRoutes(mux *http.ServeMux, operations *surface.Operations) {
	mux.HandleFunc("GET /api/build", func(writer http.ResponseWriter, request *http.Request) {
		respond(writer, operations.Build(), nil)
	})
}

func registerLibraryRoutes(mux *http.ServeMux, operations *surface.Operations) {
	mux.HandleFunc("GET /api/analyses", func(writer http.ResponseWriter, request *http.Request) {
		listed, err := operations.ListAnalyses(request.Context())
		respond(writer, listed, err)
	})

	mux.HandleFunc("POST /api/analyses", func(writer http.ResponseWriter, request *http.Request) {
		var body createAnalysisBody
		if !decode(writer, request, &body) {
			return
		}

		created, err := operations.CreateAnalysis(request.Context(), body.Name, body.Files)
		respond(writer, created, err)
	})

	mux.HandleFunc("PATCH /api/analyses/{id}", func(writer http.ResponseWriter, request *http.Request) {
		var body renameBody
		if !decode(writer, request, &body) {
			return
		}

		renamed, err := operations.RenameAnalysis(request.Context(), request.PathValue("id"), body.Name)
		respond(writer, renamed, err)
	})

	mux.HandleFunc("DELETE /api/analyses/{id}", func(writer http.ResponseWriter, request *http.Request) {
		respondEmpty(writer, operations.DeleteAnalysis(request.Context(), request.PathValue("id")))
	})

	mux.HandleFunc("POST /api/analyses/{id}/sources", func(writer http.ResponseWriter, request *http.Request) {
		var body addSourcesBody
		if !decode(writer, request, &body) {
			return
		}

		added, err := operations.AddSources(request.Context(), request.PathValue("id"), body.Files)
		respond(writer, added, err)
	})

	mux.HandleFunc("PUT /api/analyses/{id}/canvas", func(writer http.ResponseWriter, request *http.Request) {
		var body canvasBody
		if !decode(writer, request, &body) {
			return
		}

		respondEmpty(writer, operations.SaveCanvas(request.Context(), request.PathValue("id"), body.Canvas))
	})

	mux.HandleFunc("PUT /api/analyses/{id}/library-order", func(writer http.ResponseWriter, request *http.Request) {
		var body libraryOrderBody
		if !decode(writer, request, &body) {
			return
		}

		respondEmpty(writer, operations.SaveLibraryOrder(request.Context(), request.PathValue("id"), body.LibraryOrder))
	})

	mux.HandleFunc("PUT /api/analyses/{id}/series-color", func(writer http.ResponseWriter, request *http.Request) {
		var body seriesColorBody
		if !decode(writer, request, &body) {
			return
		}

		respondEmpty(writer, operations.SaveSeriesColor(request.Context(), request.PathValue("id"), body.SeriesColor))
	})
}

func registerAnalysisRoutes(mux *http.ServeMux, operations *surface.Operations) {
	mux.HandleFunc("GET /api/analyses/{id}/bundle", func(writer http.ResponseWriter, request *http.Request) {
		bundle, err := operations.OpenAnalysis(request.Context(), request.PathValue("id"))
		respond(writer, bundle, err)
	})

	mux.HandleFunc("GET /api/analyses/{id}/missing-sources", func(writer http.ResponseWriter, request *http.Request) {
		missing, err := operations.MissingSources(request.Context(), request.PathValue("id"))
		respond(writer, missing, err)
	})
	mux.HandleFunc("POST /api/series", func(writer http.ResponseWriter, request *http.Request) {
		var body analysisUsecase.WindowRequest
		if !decode(writer, request, &body) {
			return
		}

		windows, err := operations.FetchSeries(request.Context(), body)
		respond(writer, windows, err)
	})

	mux.HandleFunc("POST /api/chart", func(writer http.ResponseWriter, request *http.Request) {
		var body analysisUsecase.WindowRequest
		if !decode(writer, request, &body) {
			return
		}

		chart, err := operations.FetchChart(request.Context(), body)
		respond(writer, chart, err)
	})
}

// registerSearchHistoryRoutes answers every change with the field's history after it, so the
// frontend never reads a list back to show the term it just typed.
func registerSearchHistoryRoutes(mux *http.ServeMux, operations *surface.Operations) {
	mux.HandleFunc("GET /api/search-history/{field}", func(writer http.ResponseWriter, request *http.Request) {
		history, err := operations.SearchHistory(request.Context(), request.PathValue("field"))
		respond(writer, history, err)
	})

	mux.HandleFunc("POST /api/search-history/{field}", func(writer http.ResponseWriter, request *http.Request) {
		var body searchTermBody
		if !decode(writer, request, &body) {
			return
		}

		history, err := operations.RememberSearch(request.Context(), request.PathValue("field"), body.Term)
		respond(writer, history, err)
	})

	mux.HandleFunc("POST /api/search-history/{field}/forget", func(writer http.ResponseWriter, request *http.Request) {
		var body searchTermBody
		if !decode(writer, request, &body) {
			return
		}

		history, err := operations.ForgetSearch(request.Context(), request.PathValue("field"), body.Term)
		respond(writer, history, err)
	})
}

// registerExportRoutes returns the encoded document rather than writing it: a browser has no
// native save dialog to offer, so the frontend downloads what comes back.
func registerExportRoutes(mux *http.ServeMux, operations *surface.Operations) {
	mux.HandleFunc("GET /api/analyses/{id}/sources", func(writer http.ResponseWriter, request *http.Request) {
		document, err := operations.EncodeSourcesExport(request.Context(), request.PathValue("id"))
		if err != nil {
			fail(writer, err)

			return
		}

		respond(writer, sourcesExport{FileName: document.FileName, Content: document.Content, FileCount: document.FileCount}, nil)
	})

	mux.HandleFunc("POST /api/export/csv", func(writer http.ResponseWriter, request *http.Request) {
		var body surface.ExportRequest
		if !decode(writer, request, &body) {
			return
		}

		document, err := operations.EncodeCSVExport(request.Context(), body)
		if err != nil {
			fail(writer, err)

			return
		}

		respond(writer, csvExport{
			FileName:    document.FileName,
			Content:     string(document.Content),
			SampleCount: document.SampleCount,
			SeriesCount: document.SeriesCount,
		}, nil)
	})
}

// RegisterDevelopmentRoutes adds the routes that put the library into an exact state. The access
// time and canvas a library row renders come from stored state, and neither the end-to-end suite nor
// the design check can get there through the normal create. Only the development server adds them.
func RegisterDevelopmentRoutes(mux *http.ServeMux, operations *surface.Operations) {
	mux.HandleFunc("POST /api/dev/reset", func(writer http.ResponseWriter, request *http.Request) {
		respondEmpty(writer, operations.ResetLibrary(request.Context()))
	})

	mux.HandleFunc("POST /api/dev/analyses", func(writer http.ResponseWriter, request *http.Request) {
		var body developmentAnalysisBody
		if !decode(writer, request, &body) {
			return
		}

		created, err := operations.CreateSeededAnalysis(request.Context(), surface.SeededAnalysis{
			Name:         body.Name,
			Files:        body.Files,
			LastAccessed: time.UnixMilli(body.LastAccessedMilliseconds),
			Canvas:       body.Canvas,
		})

		respond(writer, created, err)
	})
}
