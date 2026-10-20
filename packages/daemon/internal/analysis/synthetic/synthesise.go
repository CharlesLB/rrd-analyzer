package synthetic

import (
	"math"

	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/timeunit"
)

const (
	dailyPhaseHours           = 6
	dailyWeight               = 0.8
	weeklyWeight              = 0.25
	walkDecay                 = 0.985
	walkCentre                = 0.5
	syntheticSpikeWidthFactor = 2
	percentCeiling            = 97

	memoryRampLength   = 72
	memoryRampGrowth   = 0.5
	memoryTrendFloor   = 0.7
	memoryTrendGrowth  = 0.3
	heapRampLength     = 78
	heapRampGrowth     = 0.7
	latencyDriftFloor  = 0.75
	latencyDriftGrowth = 0.55

	// A real archive keeps the extremes the average smooths away. The envelope stands in for
	// the MIN and MAX round robin archives an rrdtool database is normally created with.
	syntheticTroughRatio = 0.88
	syntheticPeakRatio   = 1.16

	hoursPerDay = 24
	daysPerWeek = 7
)

// syntheticSample is one row being drawn: the series it belongs to, the incident shape laid over
// that series, where in the run the row sits, and the random walk at it. Every step of the value
// reads most of those, so they are one value rather than five arguments threaded through.
type syntheticSample struct {
	definition       syntheticDefinition
	shape            syntheticShape
	index            int
	fromMilliseconds int64
	walk             float64
}

func synthesise(definition syntheticDefinition, fromMilliseconds, untilMilliseconds int64) []seriesDomain.Sample {
	random := newLinearCongruentialGenerator(definition.seed*seedSpread + seedOffset)
	count := int((untilMilliseconds-fromMilliseconds)/syntheticStepMilliseconds) + 1
	shape := shapeOf(definition, count, random)

	samples := make([]seriesDomain.Sample, count)
	walk := 0.0

	for index := range samples {
		walk = walk*walkDecay + (random()-walkCentre)*definition.noise
		row := syntheticSample{definition: definition, shape: shape, index: index, fromMilliseconds: fromMilliseconds, walk: walk}

		if definition.hasGap && index >= shape.gapStart && index < shape.gapEnd {
			samples[index] = seriesDomain.Unknown()

			continue
		}

		samples[index] = seriesDomain.Known(math.Max(0, row.value()))
	}

	return samples
}

// value is the reading at this row: the daily and weekly swing, the incident spike over it, the
// series' long trend, and the ceiling a percentage never passes.
func (sample syntheticSample) value() float64 {
	value := sample.withSpike(sample.swing())

	if shapeTrend, hasTrend := trendShapers[sample.definition.trend]; hasTrend {
		value = shapeTrend(sample, value)
	}

	return sample.cappedForUnit(value)
}

// swing is the daily and weekly rhythm the series is drawn around, wandered by the random walk.
func (sample syntheticSample) swing() float64 {
	definition := sample.definition
	instant := float64(sample.fromMilliseconds + int64(sample.index)*syntheticStepMilliseconds)
	hourOfDay := math.Mod(instant/float64(timeunit.MillisecondsPerHour), hoursPerDay)
	daily := math.Sin((hourOfDay - dailyPhaseHours) / hoursPerDay * math.Pi * 2)
	weekly := math.Sin(instant/float64(daysPerWeek*timeunit.MillisecondsPerDay)*math.Pi*2) * weeklyWeight

	return definition.base + definition.amplitude*(daily*dailyWeight+weekly) + definition.amplitude*sample.walk
}

// withSpike raises the value over the incident this series was given, tapering to nothing at each
// end of it. A row outside the incident keeps the value it had.
func (sample syntheticSample) withSpike(value float64) float64 {
	shape := sample.shape
	if sample.index <= shape.spikeAt || sample.index >= shape.spikeAt+shape.spikeHalfWidth*syntheticSpikeWidthFactor {
		return value
	}

	distance := math.Abs(float64(sample.index-shape.spikeAt-shape.spikeHalfWidth)) / float64(shape.spikeHalfWidth)

	return value + sample.definition.amplitude*(shape.spikeAmplitude-distance)
}

// progress is how far through the run this row sits, which the long trends grow along.
func (sample syntheticSample) progress() float64 {
	return float64(sample.index) / float64(sample.shape.count)
}

func (sample syntheticSample) cappedForUnit(value float64) float64 {
	if sample.definition.unit != seriesDomain.UnitPercent {
		return value
	}

	return math.Min(value, percentCeiling)
}

// trendShapers is the long shape each series is given over its daily swing. steadyTrend has no
// entry, which is what steady means: the row keeps the value its swing and spike produced.
var trendShapers = map[syntheticTrend]func(sample syntheticSample, value float64) float64{
	memoryGrowthTrend: memoryGrowth,
	heapRampTrend:     heapRamp,
	latencyDriftTrend: latencyDrift,
}

// memoryGrowth replaces the swing rather than adding to it: memory used is modelled as a climb
// across the run with noise on it, not as a daily rhythm, and it steepens into the outage.
func memoryGrowth(sample syntheticSample, _ float64) float64 {
	definition := sample.definition
	value := definition.base*(memoryTrendFloor+memoryTrendGrowth*sample.progress()) + definition.amplitude*sample.walk

	rampStart := sample.shape.gapStart - memoryRampLength
	if definition.hasGap && sample.index >= rampStart && sample.index < sample.shape.gapStart {
		value *= 1 + memoryRampGrowth*(float64(sample.index-rampStart)/memoryRampLength)
	}

	return value
}

// heapRamp climbs only over the rows leading into the outage, so the heap is visibly filling
// before the series goes silent.
func heapRamp(sample syntheticSample, value float64) float64 {
	rampStart := sample.shape.gapStart - heapRampLength
	if sample.index < rampStart || sample.index >= sample.shape.gapStart {
		return value
	}

	return value + sample.definition.base*heapRampGrowth*(float64(sample.index-rampStart)/heapRampLength)
}

// latencyDrift stretches the whole series across the run, so the p95 ends worse than it started.
func latencyDrift(sample syntheticSample, value float64) float64 {
	return value * (latencyDriftFloor + latencyDriftGrowth*sample.progress())
}

// archivesOf keeps the average exactly as it was and derives the extremes from it, so the
// dataset the reference test pins does not move when a read asks for MIN or MAX.
func archivesOf(average []seriesDomain.Sample, fromMilliseconds int64) []seriesDomain.Archive {
	tracks := []struct {
		function seriesDomain.ConsolidationFunction
		samples  []seriesDomain.Sample
	}{
		{seriesDomain.ConsolidationAverage, average},
		{seriesDomain.ConsolidationMinimum, scaled(average, syntheticTroughRatio)},
		{seriesDomain.ConsolidationMaximum, scaled(average, syntheticPeakRatio)},
		{seriesDomain.ConsolidationLast, average},
	}

	archives := make([]seriesDomain.Archive, 0, len(tracks))
	for _, track := range tracks {
		archives = append(archives, seriesDomain.Archive{
			Function:          track.function,
			StepMilliseconds:  syntheticStepMilliseconds,
			StartMilliseconds: fromMilliseconds,
			Samples:           track.samples,
		})
	}

	return archives
}

func scaled(samples []seriesDomain.Sample, ratio float64) []seriesDomain.Sample {
	out := make([]seriesDomain.Sample, len(samples))
	for index, sample := range samples {
		if !sample.Present {
			continue
		}

		out[index] = seriesDomain.Known(sample.Value * ratio)
	}

	return out
}
