// Package domain is what the insights engine promises its callers: the request a run takes, the
// report it returns, the rules and classifier it is configured with, and the ports it reads
// series and configuration through.
package domain

import (
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/rrdtool"
)

type Scope string

const (
	ScopeAll      Scope = "all"
	ScopeViewport Scope = "viewport"
)

type Severity string

const (
	SeverityCritical Severity = "critical"
	SeverityWarning  Severity = "warning"
	SeverityInfo     Severity = "info"
)

// Rank orders severities most urgent first. An unknown severity sorts last rather than first so a
// malformed value can never push a real critical finding down the list.
func (severity Severity) Rank() int {
	switch severity {
	case SeverityCritical:
		return 0
	case SeverityWarning:
		return 1
	case SeverityInfo:
		return 2
	default:
		return 3
	}
}

type Confidence string

const (
	ConfidenceLow    Confidence = "low"
	ConfidenceMedium Confidence = "medium"
	ConfidenceHigh   Confidence = "high"
)

type Direction string

const (
	DirectionRising  Direction = "rising"
	DirectionFalling Direction = "falling"
	DirectionTrend   Direction = "trend"
	DirectionGap     Direction = "gap"
	DirectionReset   Direction = "reset"
	DirectionFlat    Direction = "flat"
)

type Request struct {
	AnalysisID        string   `json:"analysisId"`
	Scope             Scope    `json:"scope"`
	FromMilliseconds  int64    `json:"fromMilliseconds"`
	UntilMilliseconds int64    `json:"untilMilliseconds"`
	SeriesIDs         []string `json:"seriesIds"`
}

type Report struct {
	Analyzed Analyzed  `json:"analyzed"`
	Findings []Finding `json:"findings"`
}

type Analyzed struct {
	Scope              Scope             `json:"scope"`
	FromMilliseconds   int64             `json:"fromMilliseconds"`
	UntilMilliseconds  int64             `json:"untilMilliseconds"`
	RulesetHash        string            `json:"rulesetHash"`
	ClassifierHash     string            `json:"classifierHash"`
	SeriesClassified   int               `json:"seriesClassified"`
	SeriesUnclassified []SeriesReference `json:"seriesUnclassified"`
	Warnings           []string          `json:"warnings"`
	Cached             bool              `json:"cached"`
}

// ConfigurationStamp names the configuration a report was made under. A report whose stamp no longer
// matches the current one was made under rules or a classifier that have since been edited.
type ConfigurationStamp struct {
	RulesetHash    string `json:"rulesetHash"`
	ClassifierHash string `json:"classifierHash"`
}

type SeriesReference struct {
	SeriesID   string `json:"seriesId"`
	Label      string `json:"label"`
	DataSource string `json:"dataSource"`
}

type Finding struct {
	ID                string      `json:"id"`
	RuleID            string      `json:"ruleId"`
	Severity          Severity    `json:"severity"`
	Inferred          bool        `json:"inferred"`
	Confidence        Confidence  `json:"confidence"`
	Match             string      `json:"match"`
	Title             string      `json:"title"`
	FromMilliseconds  int64       `json:"fromMilliseconds"`
	UntilMilliseconds int64       `json:"untilMilliseconds"`
	Cause             []CausePart `json:"cause"`
	Evidence          []Evidence  `json:"evidence"`
}

type CausePart struct {
	Text                string `json:"text"`
	Emphasis            bool   `json:"emphasis"`
	InstantMilliseconds *int64 `json:"instantMilliseconds,omitempty"`
}

type Evidence struct {
	Type                    string     `json:"type"`
	Semantic                string     `json:"semantic"`
	SeriesID                string     `json:"seriesId"`
	Source                  string     `json:"source"`
	DataSource              string     `json:"dataSource"`
	Direction               Direction  `json:"direction"`
	FromMilliseconds        int64      `json:"fromMilliseconds"`
	UntilMilliseconds       int64      `json:"untilMilliseconds"`
	FromValue               *float64   `json:"fromValue"`
	ToValue                 *float64   `json:"toValue"`
	Unit                    string     `json:"unit"`
	ConsolidationFunction   string     `json:"consolidationFunction"`
	StepMilliseconds        int64      `json:"stepMilliseconds"`
	ChangePointMilliseconds int64      `json:"changePointMilliseconds"`
	Spark                   []*float64 `json:"spark"`
}

// Catalog is the analysis as the engine sees it before reading a single sample: which series
// exist, the span they hold readings for, and a fingerprint that moves whenever any file behind
// them does.
type Catalog struct {
	FromMilliseconds  int64
	UntilMilliseconds int64
	Fingerprint       string
	Series            []SeriesInfo
}

// SeriesInfo describes one series before any of it is read. HasNoReadings marks a file whose
// archives were allocated but never written: it can be classified, and it can never be evidence.
type SeriesInfo struct {
	ID, File, Name, Label, Unit, DataSource, DataSourceType string

	StepMilliseconds  int64
	DataSourceMaximum *float64
	HasNoReadings     bool
}

type ReadRequest struct {
	AnalysisID, SeriesID string

	Function          string
	FromMilliseconds  int64
	UntilMilliseconds int64
	MaximumSamples    int
}

// Samples is one read: Values[k] stands at StartMilliseconds + k*StepMilliseconds, and a NaN is a
// hole the engine treats as missing data rather than as a number.
type Samples struct {
	StartMilliseconds       int64
	StepMilliseconds        int64
	ArchiveStepMilliseconds int64
	Function                string
	Values                  []float64
}

const (
	FunctionAverage = rrdtool.ConsolidationAverage
	FunctionMinimum = rrdtool.ConsolidationMinimum
	FunctionMaximum = rrdtool.ConsolidationMaximum
	FunctionLast    = rrdtool.ConsolidationLast
)
