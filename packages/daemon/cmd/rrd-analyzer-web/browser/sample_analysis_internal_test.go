package browser

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/rrd-analyzer-web/browser/sampleanalysis"
)

var errSampleUnwritten = errors.New("the sample could not be written")

func TestNewEditionFailsWhenTheSampleCannotBeWritten(t *testing.T) {
	unwritten := func() (sampleanalysis.Dataset, error) {
		return sampleanalysis.Dataset{}, errSampleUnwritten
	}

	if _, err := newEdition(context.Background(), time.Now(), unwritten); !errors.Is(err, errSampleUnwritten) {
		t.Fatalf("err = %v, want %v", err, errSampleUnwritten)
	}
}

// refusingWriter is a connection that takes the headers of an answer and then refuses its body.
type refusingWriter struct {
	header   http.Header
	attempts int
}

func (writer *refusingWriter) Header() http.Header {
	return writer.header
}

func (writer *refusingWriter) WriteHeader(int) {}

func (writer *refusingWriter) Write([]byte) (int, error) {
	writer.attempts++

	return 0, errors.New("the connection was closed")
}

func TestServeSampleAnalysisWritesTheAnswerOnceEvenToAConnectionThatRefusesIt(t *testing.T) {
	writer := &refusingWriter{header: make(http.Header)}

	serveSampleAnalysis([]byte(`{"analysisId":"a"}`))(writer, httptest.NewRequest(http.MethodGet, "/api/sample-analysis", http.NoBody))

	if writer.attempts != 1 || writer.header.Get("Content-Type") != jsonContentType {
		t.Fatalf("wrote %d times as %q, want once as %q", writer.attempts, writer.header.Get("Content-Type"), jsonContentType)
	}
}
