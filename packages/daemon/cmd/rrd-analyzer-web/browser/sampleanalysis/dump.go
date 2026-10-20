package sampleanalysis

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

const (
	// heartbeatSeconds is how long the data source waits for an update before a row turns unknown:
	// two steps, which is what rrdtool create is usually given.
	heartbeatSeconds = 2 * stepSeconds

	unknownValue = "NaN"

	// valueDigits is the precision rrdtool dump writes every number with.
	valueDigits = 10

	// dumpHeaderFormat is the start of the XML an rrdtool dump writes for a database with one data
	// source, named value, and one archive of averages at the step it was updated at.
	dumpHeaderFormat = `<?xml version="1.0" encoding="utf-8"?>
<rrd>
	<version>0003</version>
	<step>%d</step>
	<lastupdate>%d</lastupdate>
	<ds>
		<name> value </name>
		<type> %s </type>
		<minimal_heartbeat>%d</minimal_heartbeat>
		<min>0.0000000000e+00</min>
		<max>%s</max>
		<last_ds>U</last_ds>
		<value>NaN</value>
		<unknown_sec> 0 </unknown_sec>
	</ds>
	<rra>
		<cf>AVERAGE</cf>
		<pdp_per_row>1</pdp_per_row>
		<params>
			<xff>5.0000000000e-01</xff>
		</params>
		<cdp_prep>
			<ds>
				<primary_value>NaN</primary_value>
				<secondary_value>NaN</secondary_value>
				<value>NaN</value>
				<unknown_datapoints>0</unknown_datapoints>
			</ds>
		</cdp_prep>
		<database>
`

	rowStart   = "\t\t\t<row><v>"
	rowEnd     = "</v></row>\n"
	dumpFooter = "\t\t</database>\n\t</rra>\n</rrd>\n"

	// bytesPerRow is about what one row takes, so the dump is sized once rather than grown.
	bytesPerRow = len(rowStart) + len("-1.0000000000e+00") + len(rowEnd)
)

// dumpOf writes the readings as an rrdtool dump of the metric's database.
func dumpOf(source metric, readings []float64) []byte {
	var dump strings.Builder

	dump.Grow(len(dumpHeaderFormat) + len(readings)*bytesPerRow + len(dumpFooter))

	fmt.Fprintf(&dump, dumpHeaderFormat, stepSeconds, recordingEnd.Unix(), source.sourceType, heartbeatSeconds, maximumOf(source))

	for _, reading := range readings {
		dump.WriteString(rowStart)
		dump.WriteString(valueText(reading))
		dump.WriteString(rowEnd)
	}

	dump.WriteString(dumpFooter)

	return []byte(dump.String())
}

func maximumOf(source metric) string {
	if source.maximum <= 0 {
		return unknownValue
	}

	return valueText(source.maximum)
}

func valueText(value float64) string {
	if math.IsNaN(value) {
		return unknownValue
	}

	return strconv.FormatFloat(value, 'e', valueDigits, 64)
}
