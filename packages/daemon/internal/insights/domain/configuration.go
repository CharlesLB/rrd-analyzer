package domain

// Configuration is the active ruleset and classifier after the embedded defaults and the user's
// overrides were merged and validated. Rules and entries that failed validation are absent from
// it and present in Diagnostics, one diagnostic per problem.
type Configuration struct {
	Rules          []Rule
	Classifier     []ClassifierEntry
	RulesetHash    string
	ClassifierHash string
	Diagnostics    []Diagnostic
}

// ClassifierEntry maps a series to a semantic type. Every clause that is set must hold; a phrase
// is one or more words joined by "_" that must appear as consecutive name tokens, and a trailing
// "*" lets the last word match as a prefix (sd* matches sda).
type ClassifierEntry struct {
	Type              string   `json:"type"`
	FileAny           []string `json:"fileAny,omitempty"`
	DataSourceAny     []string `json:"dataSourceAny,omitempty"`
	NameAny           []string `json:"nameAny,omitempty"`
	DataSourceTypeAny []string `json:"dataSourceTypeAny,omitempty"`
	ExcludeAny        []string `json:"excludeAny,omitempty"`
}

const (
	TypeSystemDown = "system.down"
	TypeSystemUp   = "system.up"

	AliasWindow  = "window"
	AliasFinding = "finding"
)

type IntervalMode string

const (
	IntervalEpisodes IntervalMode = "episodes"
	IntervalWindow   IntervalMode = "window"
)

type Rule struct {
	ID       string       `json:"id"`
	Severity Severity     `json:"severity"`
	Title    string       `json:"title"`
	Match    string       `json:"match"`
	Inferred bool         `json:"inferred"`
	Interval IntervalMode `json:"interval"`

	Onset []InstantExpression `json:"onset,omitempty"`
	End   []InstantExpression `json:"end,omitempty"`

	// Supersedes names the more general rules a finding of this one makes redundant: a finding of
	// any of them overlapping a finding of this rule is left out of the report.
	Supersedes []string `json:"supersedes,omitempty"`

	// Anchor is the alias every finding of the rule hangs from: the trigger when there is one,
	// otherwise the condition the rule names, otherwise its first condition.
	Anchor     string      `json:"anchor"`
	Trigger    *Condition  `json:"trigger,omitempty"`
	Conditions []Condition `json:"conditions"`
	Evidence   []string    `json:"evidence"`
	Cause      Template    `json:"cause"`
	Partial    *Variant    `json:"partial,omitempty"`
}

// AllConditions is the trigger, when the rule has one, then its conditions as declared.
func (rule Rule) AllConditions() []Condition {
	all := make([]Condition, 0, len(rule.Conditions)+1)
	if rule.Trigger != nil {
		all = append(all, *rule.Trigger)
	}

	return append(all, rule.Conditions...)
}

// EvaluationOrder is the order the causal join visits conditions in: the anchor first, then every
// other condition as declared. A reference may only point backwards in it.
func (rule Rule) EvaluationOrder() []Condition {
	all := rule.AllConditions()
	ordered := make([]Condition, 0, len(all))

	for _, condition := range all {
		if condition.Alias == rule.Anchor {
			ordered = append(ordered, condition)
		}
	}

	for _, condition := range all {
		if condition.Alias != rule.Anchor {
			ordered = append(ordered, condition)
		}
	}

	return ordered
}

// Variant is the wording a rule uses when an optional condition found nothing, so a finding never
// claims a driver it did not observe.
type Variant struct {
	Title string   `json:"title"`
	Match string   `json:"match"`
	Cause Template `json:"cause"`
}

type Condition struct {
	Alias                string             `json:"alias"`
	Type                 string             `json:"type"`
	When                 When               `json:"when"`
	Function             string             `json:"function"`
	Optional             bool               `json:"optional"`
	LookbackMilliseconds int64              `json:"lookbackMilliseconds"`
	After                string             `json:"after,omitempty"`
	WithinMilliseconds   int64              `json:"withinMilliseconds"`
	Overlaps             string             `json:"overlaps,omitempty"`
	PercentOf            PercentOf          `json:"percentOf"`
	Parameters           DetectorParameters `json:"parameters"`

	// Repeats keeps only bursts of the detector's episodes: at least Repeats of them starting within
	// RepeatsWithinMilliseconds of the first, each burst becoming one episode that counts them.
	Repeats                   int   `json:"repeats,omitempty"`
	RepeatsWithinMilliseconds int64 `json:"repeatsWithinMilliseconds,omitempty"`

	// Since starts a lookback at the end of the latest episode of the named condition before the
	// anchor, when there is one inside the lookback: what built up to a restart began at the
	// restart before it.
	Since string `json:"since,omitempty"`

	// ForecastLevel keeps only episodes whose pace carries the series on to that level, measuring
	// how long after the episode's last reading it would get there; ForecastWithinMilliseconds, when
	// set, keeps only those that get there that soon.
	ForecastLevel              *float64 `json:"forecastLevel,omitempty"`
	ForecastWithinMilliseconds int64    `json:"forecastWithinMilliseconds,omitempty"`
}

type Detector string

const (
	DetectorGap         Detector = "gap"
	DetectorReset       Detector = "reset"
	DetectorRising      Detector = "rising"
	DetectorFalling     Detector = "falling"
	DetectorSpike       Detector = "spike"
	DetectorChangePoint Detector = "change_point"
	DetectorThreshold   Detector = "threshold"
	DetectorExcursion   Detector = "excursion"
	DetectorDrift       Detector = "drift"
	DetectorDown        Detector = "down"
	DetectorFlat        Detector = "flat"
)

type Comparison string

const (
	ComparisonAbove Comparison = ">"
	ComparisonBelow Comparison = "<"
)

type When struct {
	Detector   Detector   `json:"detector"`
	Comparison Comparison `json:"comparison,omitempty"`
	Level      float64    `json:"level"`
	Percent    bool       `json:"percent"`
}

type PercentKind string

const (
	PercentSelf              PercentKind = "self"
	PercentDataSourceMaximum PercentKind = "ds.max"
	PercentSum               PercentKind = "sum"
	PercentMedian            PercentKind = "median"
)

type PercentOf struct {
	Kind PercentKind `json:"kind,omitempty"`
	Sum  []string    `json:"sum,omitempty"`
}

// DetectorParameters carries every tunable a detector reads, already filled with its default, so
// the ruleset hash changes when a default does.
type DetectorParameters struct {
	MinimumRun                  int      `json:"minimumRun,omitempty"`
	ThresholdFraction           float64  `json:"thresholdFraction,omitempty"`
	MinimumSamples              int      `json:"minimumSamples,omitempty"`
	PeakAtLeast                 *float64 `json:"peakAtLeast,omitempty"`
	PeakOverMedian              *float64 `json:"peakOverMedian,omitempty"`
	Ratio                       float64  `json:"ratio,omitempty"`
	EdgeFraction                float64  `json:"edgeFraction,omitempty"`
	MinimumEdgeSamples          int      `json:"minimumEdgeSamples,omitempty"`
	SmoothingMilliseconds       int64    `json:"smoothingMilliseconds,omitempty"`
	Theta                       float64  `json:"theta,omitempty"`
	Sustain                     int      `json:"sustain,omitempty"`
	Level                       *float64 `json:"level,omitempty"`
	MaximumDurationMilliseconds int64    `json:"maximumDurationMilliseconds,omitempty"`
	MinimumDurationMilliseconds int64    `json:"minimumDurationMilliseconds,omitempty"`
	DropFraction                float64  `json:"dropFraction,omitempty"`
	Tolerance                   float64  `json:"tolerance,omitempty"`
	MaximumEpisodes             int      `json:"maximumEpisodes,omitempty"`
}

type TokenField string

const (
	FieldBase     TokenField = "base"
	FieldPeak     TokenField = "peak"
	FieldMean     TokenField = "mean"
	FieldOnset    TokenField = "onset"
	FieldEnd      TokenField = "end"
	FieldDuration TokenField = "duration"
	FieldLag      TokenField = "lag"
	FieldCount    TokenField = "count"
	FieldEta      TokenField = "eta"
)

// Template is cause text split into literal prose and the tokens interpolated into it.
type Template []TemplateSegment

type TemplateSegment struct {
	Text  string `json:"text,omitempty"`
	Token *Token `json:"token,omitempty"`
}

// Token names what to interpolate. A lag token measures from LagFrom's onset to Alias's onset.
type Token struct {
	Alias   string     `json:"alias"`
	LagFrom string     `json:"lagFrom,omitempty"`
	Field   TokenField `json:"field"`
}

// InstantExpression is one candidate for a finding's edge: an alias' onset or end, shifted by a
// signed offset. A rule lists several and the first whose alias matched wins.
type InstantExpression struct {
	Alias              string     `json:"alias"`
	Field              TokenField `json:"field"`
	OffsetMilliseconds int64      `json:"offsetMilliseconds"`
}
