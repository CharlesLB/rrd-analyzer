package rules

import (
	"fmt"
	"math"
	"slices"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

const (
	keyMinimumRun         = "min_run"
	keyThresholdFraction  = "threshold_fraction"
	keyMinimumSamples     = "min_samples"
	keyPeakAtLeast        = "peak_at_least"
	keyPeakOverMedian     = "peak_over_median"
	keyRatio              = "ratio"
	keyEdgeFraction       = "edge_fraction"
	keyMinimumEdgeSamples = "min_edge_samples"
	keyWindow             = "window"
	keyTheta              = "theta"
	keySustain            = "sustain"
	keyLevel              = "level"
	keyMaximumDuration    = "max_duration"
	keyMinimumDuration    = "min_duration"
	keyDropFraction       = "drop_fraction"
	keyTolerance          = "tolerance"
	keyMaximumEpisodes    = "max_episodes"
)

// detectorParameter is one tunable a condition may set: the key a document spells it with, whether
// the document set it, and how a set value is checked and written into the detector's parameters.
// detectorParameters is the one list both the applicability check and the assignment walk, so a
// parameter cannot be checked under one key and applied under another.
type detectorParameter struct {
	key   string
	isSet func(document conditionDocument) bool
	apply func(checker *checker, document conditionDocument, parameters *domain.DetectorParameters, location string)
}

var detectorParameters = []detectorParameter{
	checked(keyMinimumRun, (*checker).countAtLeastOne,
		func(document conditionDocument) *int { return document.MinimumRun },
		func(parameters *domain.DetectorParameters) *int { return &parameters.MinimumRun }),
	checked(keyThresholdFraction, (*checker).fraction,
		func(document conditionDocument) *float64 { return document.ThresholdFraction },
		func(parameters *domain.DetectorParameters) *float64 { return &parameters.ThresholdFraction }),
	checked(keyMinimumSamples, (*checker).countAtLeastOne,
		func(document conditionDocument) *int { return document.MinimumSamples },
		func(parameters *domain.DetectorParameters) *int { return &parameters.MinimumSamples }),
	finiteBound(keyPeakAtLeast,
		func(document conditionDocument) *float64 { return document.PeakAtLeast },
		func(parameters *domain.DetectorParameters) **float64 { return &parameters.PeakAtLeast }),
	positiveBound(keyPeakOverMedian,
		func(document conditionDocument) *float64 { return document.PeakOverMedian },
		func(parameters *domain.DetectorParameters) **float64 { return &parameters.PeakOverMedian }),
	checked(keyRatio, (*checker).positive,
		func(document conditionDocument) *float64 { return document.Ratio },
		func(parameters *domain.DetectorParameters) *float64 { return &parameters.Ratio }),
	checked(keyEdgeFraction, (*checker).fraction,
		func(document conditionDocument) *float64 { return document.EdgeFraction },
		func(parameters *domain.DetectorParameters) *float64 { return &parameters.EdgeFraction }),
	checked(keyMinimumEdgeSamples, (*checker).countAtLeastOne,
		func(document conditionDocument) *int { return document.MinimumEdgeSamples },
		func(parameters *domain.DetectorParameters) *int { return &parameters.MinimumEdgeSamples }),
	duration(keyWindow,
		func(document conditionDocument) *string { return document.Window },
		func(parameters *domain.DetectorParameters) *int64 { return &parameters.SmoothingMilliseconds }),
	checked(keyTheta, (*checker).positive,
		func(document conditionDocument) *float64 { return document.Theta },
		func(parameters *domain.DetectorParameters) *float64 { return &parameters.Theta }),
	checked(keySustain, (*checker).countAtLeastOne,
		func(document conditionDocument) *int { return document.Sustain },
		func(parameters *domain.DetectorParameters) *int { return &parameters.Sustain }),
	finiteBound(keyLevel,
		func(document conditionDocument) *float64 { return document.Level },
		func(parameters *domain.DetectorParameters) **float64 { return &parameters.Level }),
	duration(keyMaximumDuration,
		func(document conditionDocument) *string { return document.MaximumDuration },
		func(parameters *domain.DetectorParameters) *int64 { return &parameters.MaximumDurationMilliseconds }),
	duration(keyMinimumDuration,
		func(document conditionDocument) *string { return document.MinimumDuration },
		func(parameters *domain.DetectorParameters) *int64 { return &parameters.MinimumDurationMilliseconds }),
	checked(keyDropFraction, (*checker).fraction,
		func(document conditionDocument) *float64 { return document.DropFraction },
		func(parameters *domain.DetectorParameters) *float64 { return &parameters.DropFraction }),
	checked(keyTolerance, (*checker).fraction,
		func(document conditionDocument) *float64 { return document.Tolerance },
		func(parameters *domain.DetectorParameters) *float64 { return &parameters.Tolerance }),
	checked(keyMaximumEpisodes, (*checker).countAtLeastOne,
		func(document conditionDocument) *int { return document.MaximumEpisodes },
		func(parameters *domain.DetectorParameters) *int { return &parameters.MaximumEpisodes }),
}

// checked is a parameter the detector has a default for: a set value is validated by check and
// replaces it.
func checked[Value any](key string, check func(*checker, string, *Value, Value, string) Value, value func(conditionDocument) *Value, target func(*domain.DetectorParameters) *Value) detectorParameter {
	return detectorParameter{
		key:   key,
		isSet: func(document conditionDocument) bool { return value(document) != nil },
		apply: func(checker *checker, document conditionDocument, parameters *domain.DetectorParameters, location string) {
			*target(parameters) = check(checker, key, value(document), *target(parameters), location)
		},
	}
}

// finiteBound is a bound a detector goes without unless the document gives one, as any finite number.
func finiteBound(key string, value func(conditionDocument) *float64, target func(*domain.DetectorParameters) **float64) detectorParameter {
	return detectorParameter{
		key:   key,
		isSet: func(document conditionDocument) bool { return value(document) != nil },
		apply: func(checker *checker, document conditionDocument, parameters *domain.DetectorParameters, location string) {
			*target(parameters) = checker.finite(key, value(document), location)
		},
	}
}

// fallbackNeverTaken is what checker.positive answers for a parameter the document leaves out.
// positiveBound returns before asking in that case, so this is only ever the argument it must pass.
const fallbackNeverTaken = 0

// positiveBound is a bound a detector goes without unless the document gives one, as a positive
// number.
func positiveBound(key string, value func(conditionDocument) *float64, target func(*domain.DetectorParameters) **float64) detectorParameter {
	return detectorParameter{
		key:   key,
		isSet: func(document conditionDocument) bool { return value(document) != nil },
		apply: func(checker *checker, document conditionDocument, parameters *domain.DetectorParameters, location string) {
			if value(document) == nil {
				return
			}

			positive := checker.positive(key, value(document), fallbackNeverTaken, location)
			*target(parameters) = &positive
		},
	}
}

// duration is a span written as text, such as "30m", and held in milliseconds.
func duration(key string, value func(conditionDocument) *string, target func(*domain.DetectorParameters) *int64) detectorParameter {
	return detectorParameter{
		key:   key,
		isSet: func(document conditionDocument) bool { return value(document) != nil },
		apply: func(checker *checker, document conditionDocument, parameters *domain.DetectorParameters, location string) {
			if value(document) == nil {
				return
			}

			*target(parameters) = checker.duration(key, *value(document), location)
		},
	}
}

var (
	slopeParameters = []string{keyWindow, keyTheta, keySustain}

	applicableParameters = map[domain.Detector][]string{
		domain.DetectorGap:         {keyMinimumRun, keyMinimumDuration},
		domain.DetectorDown:        {keyMinimumRun, keyMinimumDuration, keyDropFraction},
		domain.DetectorReset:       {keyDropFraction},
		domain.DetectorExcursion:   {keyThresholdFraction, keyMinimumSamples, keyPeakAtLeast, keyPeakOverMedian, keyMaximumEpisodes},
		domain.DetectorDrift:       {keyRatio, keyEdgeFraction, keyMinimumEdgeSamples, keyMinimumDuration},
		domain.DetectorThreshold:   {keyMinimumDuration},
		domain.DetectorRising:      slopeParameters,
		domain.DetectorFalling:     slopeParameters,
		domain.DetectorChangePoint: slopeParameters,
		domain.DetectorSpike:       {keyLevel, keyTheta, keyMaximumDuration},
		domain.DetectorFlat:        {keyMinimumDuration, keyTolerance},
	}
)

func defaultParameters(detector domain.Detector) domain.DetectorParameters {
	switch detector {
	case domain.DetectorGap:
		return domain.DetectorParameters{MinimumRun: signal.DefaultMinimumRun}
	case domain.DetectorDown:
		return domain.DetectorParameters{MinimumRun: signal.DefaultMinimumRun, DropFraction: signal.DefaultResetDropFraction}
	case domain.DetectorReset:
		return domain.DetectorParameters{DropFraction: signal.DefaultResetDropFraction}
	case domain.DetectorExcursion:
		return domain.DetectorParameters{ThresholdFraction: signal.DefaultThresholdFraction, MinimumSamples: signal.DefaultExcursionSamples}
	case domain.DetectorDrift:
		return domain.DetectorParameters{
			Ratio: signal.DefaultDriftRatio, EdgeFraction: signal.DefaultEdgeFraction, MinimumEdgeSamples: signal.DefaultMinimumEdgeSamples,
		}
	case domain.DetectorRising, domain.DetectorFalling:
		return domain.DetectorParameters{Theta: signal.DefaultTrendTheta, Sustain: signal.DefaultTrendSustain}
	case domain.DetectorChangePoint:
		return domain.DetectorParameters{Theta: signal.DefaultChangePointTheta, Sustain: signal.DefaultChangePointSustain}
	case domain.DetectorSpike:
		return domain.DetectorParameters{Theta: signal.DefaultSpikeTheta}
	case domain.DetectorFlat:
		return domain.DetectorParameters{Tolerance: signal.DefaultFlatTolerance, MinimumDurationMilliseconds: signal.DefaultFlatMinimumDuration}
	default:
		return domain.DetectorParameters{}
	}
}

func (checker *checker) parameters(document conditionDocument, detector domain.Detector, location string) domain.DetectorParameters {
	if document.MinimumRun != nil && document.MinimumDuration != nil {
		checker.add(invalidParameter, fmt.Sprintf("%s: %s and %s both size the run; give one", location, keyMinimumRun, keyMinimumDuration))
	}

	if detector != "" {
		for _, parameter := range detectorParameters {
			if parameter.isSet(document) && !slices.Contains(applicableParameters[detector], parameter.key) {
				checker.add(parameterNotApplicable, fmt.Sprintf("%s: %s does not apply to a %s condition", location, parameter.key, detector))
			}
		}
	}

	parameters := defaultParameters(detector)
	for _, parameter := range detectorParameters {
		parameter.apply(checker, document, &parameters, location)
	}

	return parameters
}

func (checker *checker) countAtLeastOne(key string, value *int, fallback int, location string) int {
	if value == nil {
		return fallback
	}

	if *value < 1 {
		checker.add(invalidParameter, fmt.Sprintf("%s: %s must be at least 1, got %d", location, key, *value))
	}

	return *value
}

func (checker *checker) fraction(key string, value *float64, fallback float64, location string) float64 {
	if value == nil {
		return fallback
	}

	if !(*value > 0 && *value <= 1) {
		checker.add(invalidParameter, fmt.Sprintf("%s: %s must be above 0 and at most 1, got %v", location, key, *value))
	}

	return *value
}

func (checker *checker) positive(key string, value *float64, fallback float64, location string) float64 {
	if value == nil {
		return fallback
	}

	if !(*value > 0) || math.IsInf(*value, 0) {
		checker.add(invalidParameter, fmt.Sprintf("%s: %s must be a positive number, got %v", location, key, *value))
	}

	return *value
}

func (checker *checker) finite(key string, value *float64, location string) *float64 {
	if value != nil && (math.IsNaN(*value) || math.IsInf(*value, 0)) {
		checker.add(invalidParameter, fmt.Sprintf("%s: %s must be a finite number", location, key))
	}

	return value
}
