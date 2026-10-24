package infrastructure_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	rrdDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/domain"
	rrdInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/infrastructure"
)

const oneSourceDump = `<rrd><version>0003</version><step>300</step><lastupdate>900</lastupdate>` +
	`<ds><name>value</name><type>GAUGE</type></ds>` +
	`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database>` +
	`<row><v>1.0e+00</v></row><row><v>2.0e+00</v></row><row><v>3.0e+00</v></row>` +
	`</database></rra></rrd>`

type fixedDumpReader struct {
	dump []byte
	err  error
}

func (reader fixedDumpReader) ReadDump(context.Context, string) ([]byte, error) {
	return reader.dump, reader.err
}

func TestSeriesReaderParsesTheDumpItWasHanded(t *testing.T) {
	series, err := rrdInfra.NewSeriesReader(fixedDumpReader{dump: []byte(oneSourceDump)}).ReadSeries(context.Background(), "/data/cpu.xml")
	if err != nil {
		t.Fatalf("read series: %v", err)
	}

	if len(series) != 1 || len(series[0].Archives) != 1 || len(series[0].Archives[0].Samples) != 3 {
		t.Fatalf("series = %+v, want one series with three rows", series)
	}
}

func TestSeriesReaderPassesOnWhyTheSourceCouldNotBeRead(t *testing.T) {
	_, err := rrdInfra.NewSeriesReader(fixedDumpReader{err: rrdDomain.ErrUnreadableSource}).ReadSeries(context.Background(), "/data/cpu.rrd")

	if !errors.Is(err, rrdDomain.ErrUnreadableSource) {
		t.Fatalf("err = %v, want %v", err, rrdDomain.ErrUnreadableSource)
	}
}

func TestSeriesReaderReportsADumpThatDoesNotParse(t *testing.T) {
	_, err := rrdInfra.NewSeriesReader(fixedDumpReader{dump: []byte("<rrd><step>")}).ReadSeries(context.Background(), "/data/cut.xml")

	if !errors.Is(err, rrdDomain.ErrNotAnRRDDump) {
		t.Fatalf("err = %v, want %v", err, rrdDomain.ErrNotAnRRDDump)
	}
}

func TestNewSeriesReaderWithoutADumpReaderPanicsNamingTheWire(t *testing.T) {
	defer func() {
		recovered := recover()
		if message, isText := recovered.(string); !isText || !strings.Contains(message, "DumpReader") {
			t.Errorf("panic = %v, want a message naming the DumpReader", recovered)
		}
	}()

	rrdInfra.NewSeriesReader(nil)
}
