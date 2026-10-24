package usecase_test

import (
	"errors"
	"fmt"
	"testing"

	rrdDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/domain"
	rrdUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/usecase"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const twoArchiveDump = `<?xml version="1.0" encoding="utf-8"?>
<rrd>
  <version>0003</version>
  <step>300</step>
  <lastupdate>3000</lastupdate>
  <ds><name> inbound </name><type> GAUGE </type></ds>
  <ds><name> outbound </name><type> COUNTER </type></ds>
  <rra>
    <cf>AVERAGE</cf>
    <pdp_per_row>2</pdp_per_row>
    <cdp_prep><ds><value>NaN</value></ds></cdp_prep>
    <database>
      <row><v>1.0e+00</v><v>NaN</v></row>
      <row><v>2.0e+00</v><v>7.0e+00</v></row>
      <row><v>3.0e+00</v><v>8.0e+00</v></row>
    </database>
  </rra>
  <rra>
    <cf>AVERAGE</cf>
    <pdp_per_row>1</pdp_per_row>
    <database>
      <row><v>1.0e+01</v><v>NaN</v></row>
      <row><v>2.0e+01</v><v>9.0e+00</v></row>
      <row><v>3.0e+01</v><v>1.0e+01</v></row>
    </database>
  </rra>
  <rra>
    <cf>MAX</cf>
    <pdp_per_row>1</pdp_per_row>
    <database>
      <row><v>5.0e+01</v><v>NaN</v></row>
      <row><v>6.0e+01</v><v>NaN</v></row>
      <row><v>7.0e+01</v><v>NaN</v></row>
    </database>
  </rra>
</rrd>`

func TestParseDumpKeepsEveryArchiveAtItsOwnResolution(t *testing.T) {
	parsed, err := rrdUsecase.ParseDump([]byte(twoArchiveDump), "/sources/atlas-node1.rrd")
	if err != nil {
		t.Fatalf("parse dump: %v", err)
	}

	if len(parsed) != 2 {
		t.Fatalf("want one series per data source, got %d", len(parsed))
	}

	inbound := parsed[0]
	if inbound.Name != "atlas_node1_inbound" {
		t.Errorf("name = %q, want atlas_node1_inbound", inbound.Name)
	}
	if inbound.Label != "node1_inbound" {
		t.Errorf("label = %q, want node1_inbound", inbound.Label)
	}
	if inbound.StartMilliseconds != 1200*1000 || inbound.StepMilliseconds != 300*1000 {
		t.Errorf("grid = start %d step %d, want 1200000/300000", inbound.StartMilliseconds, inbound.StepMilliseconds)
	}

	if len(inbound.Archives) != 3 {
		t.Fatalf("want one archive per rra, got %d", len(inbound.Archives))
	}

	// The coarse rows end at 1800, 2400 and 3000 s, so the first one consolidates 1200 to 1800 s.
	coarse := archiveOf(t, inbound, seriesDomain.ConsolidationAverage, 600*1000)
	if coarse.StartMilliseconds != 1200*1000 {
		t.Errorf("coarse archive starts at %d, want 1200000", coarse.StartMilliseconds)
	}

	assertSamples(t, "coarse AVERAGE", coarse.Samples, []float64{1, 2, 3})

	fine := archiveOf(t, inbound, seriesDomain.ConsolidationAverage, 300*1000)
	if fine.StartMilliseconds != 2100*1000 {
		t.Errorf("fine archive starts at %d, want 2100000", fine.StartMilliseconds)
	}

	assertSamples(t, "fine AVERAGE", fine.Samples, []float64{10, 20, 30})
	assertSamples(t, "MAX", archiveOf(t, inbound, seriesDomain.ConsolidationMaximum, 300*1000).Samples, []float64{50, 60, 70})
}

func TestParseDumpDropsAnArchiveItCannotPlot(t *testing.T) {
	dump := `<rrd><version>0003</version><step>300</step><lastupdate>3000</lastupdate>` +
		`<ds><name> value </name><type> GAUGE </type></ds>` +
		`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database><row><v>1.0</v></row></database></rra>` +
		`<rra><cf>HWPREDICT</cf><pdp_per_row>1</pdp_per_row><database><row><v>99.0</v></row></database></rra>` +
		`<rra><cf>FAILURES</cf><pdp_per_row>1</pdp_per_row><database><row><v>1.0</v></row></database></rra></rrd>`

	parsed, err := rrdUsecase.ParseDump([]byte(dump), "/sources/forecast.rrd")
	if err != nil {
		t.Fatalf("parse dump: %v", err)
	}

	if len(parsed[0].Archives) != 1 {
		t.Fatalf("want only the average archive, got %d", len(parsed[0].Archives))
	}

	if parsed[0].Archives[0].Function != seriesDomain.ConsolidationAverage {
		t.Errorf("kept %q, want AVERAGE", parsed[0].Archives[0].Function)
	}
}

func TestParseDumpKeepsUnknownReadingsAsGaps(t *testing.T) {
	parsed, err := rrdUsecase.ParseDump([]byte(twoArchiveDump), "/sources/atlas-node1.rrd")
	if err != nil {
		t.Fatalf("parse dump: %v", err)
	}

	outbound := parsed[1]

	coarse := archiveOf(t, outbound, seriesDomain.ConsolidationAverage, 600*1000)
	if coarse.Samples[0].Present {
		t.Errorf("the first coarse row is unknown and must stay a gap, got %v", coarse.Samples[0].Value)
	}

	assertSamples(t, "coarse AVERAGE", coarse.Samples, []float64{0, 7, 8})
	assertSamples(t, "fine AVERAGE", archiveOf(t, outbound, seriesDomain.ConsolidationAverage, 300*1000).Samples, []float64{0, 9, 10})
}

func TestParseDumpMarksRateDataSourcesPerSecond(t *testing.T) {
	parsed, err := rrdUsecase.ParseDump([]byte(twoArchiveDump), "/sources/atlas-node1.rrd")
	if err != nil {
		t.Fatalf("parse dump: %v", err)
	}

	if parsed[0].Unit != "" {
		t.Errorf("GAUGE unit = %q, want empty", parsed[0].Unit)
	}
	if parsed[1].Unit != "/s" {
		t.Errorf("COUNTER unit = %q, want /s", parsed[1].Unit)
	}
}

func TestParseDumpReadsTheMaximumADataSourceDeclaresAndNoneWhenItIsUnset(t *testing.T) {
	dump := `<rrd><version>0003</version><step>300</step><lastupdate>900</lastupdate>` +
		`<ds><name>used</name><type>GAUGE</type><min>0.0e+00</min><max> 1.0000000000e+02 </max></ds>` +
		`<ds><name>free</name><type>GAUGE</type><min>0.0e+00</min><max>NaN</max></ds>` +
		`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database>` +
		`<row><v>40</v><v>60</v></row><row><v>45</v><v>55</v></row>` +
		`</database></rra></rrd>`

	parsed, err := rrdUsecase.ParseDump([]byte(dump), "/sources/memory.rrd")
	if err != nil {
		t.Fatalf("parse dump: %v", err)
	}

	if parsed[0].DataSourceMaximum == nil || *parsed[0].DataSourceMaximum != 100 {
		t.Errorf("used maximum = %v, want 100", parsed[0].DataSourceMaximum)
	}
	if parsed[1].DataSourceMaximum != nil {
		t.Errorf("free maximum = %v, want none for NaN", *parsed[1].DataSourceMaximum)
	}
}

func TestParseDumpOfAComputeDataSourceDeclaresNoMaximumWhateverItsCeilingWordsHold(t *testing.T) {
	dump := `<rrd><version>0003</version><step>300</step><lastupdate>900</lastupdate>` +
		`<ds><name>total</name><type>COMPUTE</type><max>4.2e+01</max></ds>` +
		`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database>` +
		`<row><v>40</v></row><row><v>45</v></row>` +
		`</database></rra></rrd>`

	parsed, err := rrdUsecase.ParseDump([]byte(dump), "/sources/total.rrd")
	if err != nil {
		t.Fatalf("parse dump: %v", err)
	}

	if parsed[0].DataSourceMaximum != nil {
		t.Errorf("COMPUTE maximum = %v, want none", *parsed[0].DataSourceMaximum)
	}
}

func TestParseDumpMarksEveryRateTypeRrdtoolDividesByTheInterval(t *testing.T) {
	tests := []struct {
		name     string
		give     string
		wantUnit string
	}{
		{name: "gauge", give: "GAUGE", wantUnit: ""},
		{name: "counter", give: "COUNTER", wantUnit: "/s"},
		{name: "derive", give: "DERIVE", wantUnit: "/s"},
		{name: "absolute", give: "ABSOLUTE", wantUnit: "/s"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dump := `<rrd><version>0003</version><step>300</step><lastupdate>1700000000</lastupdate>` +
				`<ds><name> value </name><type> ` + tt.give + ` </type></ds>` +
				`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database>` +
				`<row><v>1.0</v></row><row><v>2.0</v></row></database></rra></rrd>`

			parsed, err := rrdUsecase.ParseDump([]byte(dump), "/sources/probe.rrd")
			if err != nil {
				t.Fatalf("parse dump: %v", err)
			}

			if parsed[0].Unit != tt.wantUnit {
				t.Errorf("%s unit = %q, want %q", tt.give, parsed[0].Unit, tt.wantUnit)
			}
		})
	}
}

func TestParseDumpRejectsXMLThatIsNotADump(t *testing.T) {
	tests := []struct {
		name string
		give string
	}{
		{name: "another document", give: `<html><body>not an rrd</body></html>`},
		{name: "a dump cut short", give: `<rrd><step>300</step><lastupdate>30`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := rrdUsecase.ParseDump([]byte(tt.give), "/sources/page.xml")
			if !errors.Is(err, rrdDomain.ErrNotAnRRDDump) {
				t.Fatalf("err = %v, want %v", err, rrdDomain.ErrNotAnRRDDump)
			}
		})
	}
}

func TestParseDumpRejectsDumpWithoutRows(t *testing.T) {
	dump := `<rrd><step>300</step><lastupdate>3000</lastupdate><ds><name>a</name><type>GAUGE</type></ds></rrd>`

	_, err := rrdUsecase.ParseDump([]byte(dump), "/sources/empty.rrd")
	if !errors.Is(err, rrdDomain.ErrEmptyArchive) {
		t.Fatalf("err = %v, want %v for a dump with no archive rows", err, rrdDomain.ErrEmptyArchive)
	}
}

func archiveOf(t *testing.T, series seriesDomain.Series, function seriesDomain.ConsolidationFunction, stepMilliseconds int64) seriesDomain.Archive {
	t.Helper()

	for _, archive := range series.Archives {
		if archive.Function == function && archive.StepMilliseconds == stepMilliseconds {
			return archive
		}
	}

	t.Fatalf("no %s archive at a %d ms step", function, stepMilliseconds)

	return seriesDomain.Archive{}
}

// A want of 0 stands for a gap: no fixture in this file stores a real zero.
func assertSamples(t *testing.T, name string, got []seriesDomain.Sample, want []float64) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("%s length = %d, want %d", name, len(got), len(want))
	}

	for index, expected := range want {
		if expected == 0 {
			if got[index].Present {
				t.Errorf("%s row %d = %v, want a gap", name, index, got[index].Value)
			}

			continue
		}

		if !got[index].Present || got[index].Value != expected {
			t.Errorf("%s row %d = %+v, want %v", name, index, got[index], expected)
		}
	}
}

// rrdtool stamps each row at the end of the hour it consolidates. A chart column over 01:00 to
// 02:00 must show the row for that hour, the one stamped 02:00, not the one stamped 01:00.
func TestParseDumpPlacesEachRowOverTheIntervalItConsolidates(t *testing.T) {
	dump := `<rrd><version>0003</version><step>3600</step><lastupdate>7200</lastupdate>` +
		`<ds><name>value</name><type>GAUGE</type></ds>` +
		`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database>` +
		`<row><v>1.0e+00</v></row><row><v>2.0e+00</v></row>` +
		`</database></rra></rrd>`

	parsed, err := rrdUsecase.ParseDump([]byte(dump), "/sources/hourly.rrd")
	if err != nil {
		t.Fatalf("parse dump: %v", err)
	}

	hour := seriesDomain.Aggregate(parsed[0], seriesDomain.AggregationRequest{
		FromMilliseconds: 3600 * 1000, UntilMilliseconds: 7200 * 1000, Columns: 1, Function: seriesDomain.ConsolidationAverage,
	})

	if len(hour) != 1 || !hour[0].Present || hour[0].Value != 2 {
		t.Errorf("01:00 to 02:00 reads %+v, want the row stamped 02:00, 2", hour)
	}

	if until := parsed[0].UntilMilliseconds(); until != 7200*1000 {
		t.Errorf("readings end at %d, want the last update, 7200000", until)
	}
}

func TestIsSource(t *testing.T) {
	tests := []struct {
		name string
		give string
		want bool
	}{
		{name: "an xml dump", give: twoArchiveDump, want: true},
		{name: "a binary database, even in a layout only rrdtool reads", give: "RRD\x00a layout this build does not read in place", want: true},
		{name: "a private key", give: "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk\n", want: false},
		{name: "xml that is not a dump", give: `<?xml version="1.0"?><settings><token>secret</token></settings>`, want: false},
		{name: "nothing", give: "", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := rrdUsecase.IsSource([]byte(tt.give)); got != tt.want {
				t.Errorf("IsSource = %t, want %t", got, tt.want)
			}
		})
	}
}

// The header of a dump is text anyone can write. Each of these is a number the binary reader refuses
// and that, taken at its word, overflows the arithmetic turning rows into instants: the series came
// back with a negative step, or with its rows stamped before the epoch.
func TestParseDumpRefusesAnXMLHeaderPastWhatTheBinaryReaderAllows(t *testing.T) {
	const dump = `<rrd><step>%s</step><lastupdate>%s</lastupdate>
<ds><name>value</name><type>GAUGE</type><max>NaN</max></ds>
<rra><cf>AVERAGE</cf><pdp_per_row>%s</pdp_per_row><database><row><v>1</v></row><row><v>2</v></row></database></rra></rrd>`

	tests := []struct {
		name           string
		giveStep       string
		giveLastUpdate string
		givePointsRow  string
	}{
		{name: "a step whose milliseconds overflow", giveStep: "9223372036854775", giveLastUpdate: "1788026400", givePointsRow: "1"},
		{name: "a step that overflows once multiplied by the points per row", giveStep: "4611686018427387904", giveLastUpdate: "1788026400", givePointsRow: "2"},
		{name: "points per row that overflow the step", giveStep: "300", giveLastUpdate: "1788026400", givePointsRow: "30744573456182586"},
		{name: "a last update whose milliseconds overflow", giveStep: "300", giveLastUpdate: "9223372036854775000", givePointsRow: "1"},
		{name: "a last update before the epoch", giveStep: "300", giveLastUpdate: "-1788026400", givePointsRow: "1"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := rrdUsecase.ParseDump(fmt.Appendf(nil, dump, tt.giveStep, tt.giveLastUpdate, tt.givePointsRow), "/sources/crafted.xml")

			if !errors.Is(err, rrdDomain.ErrNotAnRRDDump) {
				t.Fatalf("err = %v, want %v; parsed %d series", err, rrdDomain.ErrNotAnRRDDump, len(parsed))
			}
		})
	}
}

func TestParseDumpReadsAReadingMissingFromARowAsAGap(t *testing.T) {
	dump := `<rrd><version>0003</version><step>300</step><lastupdate>3000</lastupdate>` +
		`<ds><name>inbound</name><type>GAUGE</type></ds><ds><name>outbound</name><type>GAUGE</type></ds>` +
		`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database>` +
		`<row><v>1.0</v><v>2.0</v></row><row><v>3.0</v></row></database></rra></rrd>`

	parsed, err := rrdUsecase.ParseDump([]byte(dump), "/sources/link.rrd")
	if err != nil {
		t.Fatalf("parse dump: %v", err)
	}

	assertSamples(t, "inbound", archiveOf(t, parsed[0], seriesDomain.ConsolidationAverage, 300*1000).Samples, []float64{1, 3})
	assertSamples(t, "outbound", archiveOf(t, parsed[1], seriesDomain.ConsolidationAverage, 300*1000).Samples, []float64{2, 0})
}

func TestParseDumpLeavesOutAnArchiveWithoutRowsOrWithoutPointsPerRow(t *testing.T) {
	dump := `<rrd><version>0003</version><step>300</step><lastupdate>3000</lastupdate>` +
		`<ds><name>value</name><type>GAUGE</type></ds>` +
		`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database></database></rra>` +
		`<rra><cf>MAX</cf><pdp_per_row>0</pdp_per_row><database><row><v>9.0</v></row></database></rra>` +
		`<rra><cf>AVERAGE</cf><pdp_per_row>2</pdp_per_row><database><row><v>1.0</v></row></database></rra></rrd>`

	parsed, err := rrdUsecase.ParseDump([]byte(dump), "/sources/sparse.rrd")
	if err != nil {
		t.Fatalf("parse dump: %v", err)
	}

	if len(parsed[0].Archives) != 1 || parsed[0].Archives[0].StepMilliseconds != 600*1000 {
		t.Fatalf("archives = %+v, want only the average over two steps", parsed[0].Archives)
	}
}
