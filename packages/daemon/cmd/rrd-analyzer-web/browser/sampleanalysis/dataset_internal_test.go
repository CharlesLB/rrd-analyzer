package sampleanalysis

import (
	"math"
	"strings"
	"testing"
	"time"
)

const fileOutsideTheSample = "api_disk_used_bytes.xml"

func TestGenerateRefusesAChartOfAFileTheSampleDoesNotHold(t *testing.T) {
	tests := []struct {
		name       string
		giveCharts []openingChart
	}{
		{name: "the series a chart opens on", giveCharts: []openingChart{{fileName: fileOutsideTheSample}}},
		{name: "a series merged into a chart", giveCharts: []openingChart{{fileName: requestsFile, merged: []string{fileOutsideTheSample}}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := generate(tt.giveCharts)

			if err == nil || !strings.Contains(err.Error(), fileOutsideTheSample) {
				t.Errorf("err = %v, want a refusal naming %s", err, fileOutsideTheSample)
			}
		})
	}
}

func TestRecordingAtReadsAMomentOutsideTheRecordingAsUnknown(t *testing.T) {
	readings := recorded()

	tests := []struct {
		name       string
		giveMoment time.Time
	}{
		{name: "before the recording starts", giveMoment: recordingStart().Add(-time.Hour)},
		{name: "after the recording ends", giveMoment: recordingEnd.Add(time.Hour)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if reading := readings.at(latencyFile, tt.giveMoment); !math.IsNaN(reading) {
				t.Errorf("reading = %v, want unknown", reading)
			}
		})
	}
}
