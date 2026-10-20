package sampleanalysis

import (
	"math"
	"math/rand/v2"
	"time"
)

const (
	gaugeType  = "GAUGE"
	deriveType = "DERIVE"

	gibibyte = 1 << 30
	kibibyte = 1 << 10

	percentCeiling = 100.0

	// noiseStream is the second half of every metric's seed. The first half tells the metrics apart;
	// this one only has to stay the same from one build to the next.
	noiseStream = 0x5A3F_17C2_9B04_E86D
)

// metric is one source of the sample: the file it is kept as, how rrdtool stores it and the level it
// read at each moment. The level carries the shape of the day and of every incident; spread is the
// noise laid over it, as a fraction of the level. seed tells the metric's noise apart from every
// other's, so reshaping one metric never moves another. maximum is the ceiling the data source
// declares and no reading crosses, none when zero.
type metric struct {
	fileName   string
	sourceType string
	maximum    float64
	seed       uint64
	spread     float64
	level      func(at time.Time) float64
}

// metrics are the sample's sources, in the order the analysis lists them, which is the order its
// series are numbered in.
var metrics = []metric{
	{fileName: requestsFile, sourceType: deriveType, seed: 1, spread: 0.05, level: requestsPerSecond},
	{fileName: latencyFile, sourceType: gaugeType, seed: 2, spread: 0.04, level: latencyP95Milliseconds},
	{fileName: cpuUserFile, sourceType: gaugeType, maximum: percentCeiling, seed: 3, spread: 0.03, level: cpuUserPercent},
	{fileName: cpuSystemFile, sourceType: gaugeType, maximum: percentCeiling, seed: 4, spread: 0.08, level: cpuSystemPercent},
	{fileName: loadFile, sourceType: gaugeType, seed: 5, spread: 0.05, level: loadOneMinute},
	{fileName: memoryUsedFile, sourceType: gaugeType, seed: 6, spread: 0.006, level: memoryUsedBytes},
	{fileName: heapObjectsFile, sourceType: gaugeType, seed: 7, spread: 0.02, level: heapObjects},
	{fileName: gcPauseFile, sourceType: gaugeType, seed: 8, spread: 0.12, level: gcPauseMilliseconds},
	{fileName: uptimeFile, sourceType: gaugeType, seed: 9, level: uptimeSeconds},
	{fileName: networkFile, sourceType: deriveType, seed: 10, spread: 0.05, level: networkReceivedBytesPerSecond},
}

// recording is every metric's readings, by the file the metric is kept as. The log quotes it, so a
// number an entry mentions is the number the chart shows at that moment.
type recording map[string][]float64

func recorded() recording {
	readings := make(recording, len(metrics))
	for _, source := range metrics {
		readings[source.fileName] = source.readings()
	}

	return readings
}

// at is what the metric read in the row that holds the moment, unknown outside the recording.
func (readings recording) at(fileName string, moment time.Time) float64 {
	values := readings[fileName]

	row := int(moment.Sub(recordingStart()) / (stepSeconds * time.Second))
	if row < 0 || row >= len(values) {
		return math.NaN()
	}

	return values[row]
}

// readings are what the metric reported at every row of the recording. Nothing reports while the
// service is down, so those rows are unknown in every source alike.
func (source metric) readings() []float64 {
	// The noise only has to look like a measurement and come out the same on every visit, which a
	// seeded generator gives and a cryptographic one cannot.
	//nolint:gosec // G404: the sample's noise is meant to be reproducible, not unpredictable.
	noise := rand.New(rand.NewPCG(source.seed, noiseStream))
	values := make([]float64, rowCount)

	for row := range rowCount {
		at := momentAt(row)
		if isDown(at) {
			values[row] = math.NaN()

			continue
		}

		values[row] = source.bounded(source.level(at) * (1 + source.spread*noise.NormFloat64()))
	}

	return values
}

func (source metric) bounded(value float64) float64 {
	if source.maximum > 0 {
		return clamped(value, 0, source.maximum)
	}

	return math.Max(0, value)
}

func requestsPerSecond(at time.Time) float64 {
	return (40 + 180*dailyActivity(at)) * weekShare(at) * (1 + 2.2*burstShare(at))
}

// latencyP95Milliseconds drifts from about 110 ms to about 170 ms over the two weeks, on top of the
// day's own swing, and jumps under the burst and while the leak keeps the garbage collector busy.
func latencyP95Milliseconds(at time.Time) float64 {
	drifting := 108 + 64*recordingShare(at)

	return drifting + 14*dailyActivity(at) + 160*burstShare(at) + 120*math.Pow(leakShare(at), 2)
}

func cpuUserPercent(at time.Time) float64 {
	usual := 10 + 30*dailyActivity(at)*weekShare(at) + 18*leakShare(at)

	return usual + (91-usual)*burstShare(at)
}

func cpuSystemPercent(at time.Time) float64 {
	return 3 + 7*dailyActivity(at)*weekShare(at) + 8*burstShare(at) + 4*leakShare(at)
}

func loadOneMinute(at time.Time) float64 {
	return 0.35 + 1.6*dailyActivity(at)*weekShare(at) + 0.8*burstShare(at) + leakShare(at)
}

// memoryUsedBytes creeps up by a little every day the process runs, as caches fill, and climbs
// steeply through the leak until the kernel kills the process just short of the host's memory.
func memoryUsedBytes(at time.Time) float64 {
	return gibibyte * (2.4 + 0.5*dailyActivity(at) + 0.03*math.Min(daysUp(at), 30) + 4.8*leakShare(at))
}

func heapObjects(at time.Time) float64 {
	return 1.6e6 + 0.8e6*dailyActivity(at) + 0.02e6*math.Min(daysUp(at), 30) + 6.5e6*leakShare(at)
}

func gcPauseMilliseconds(at time.Time) float64 {
	return 1.1 + 1.4*dailyActivity(at) + 2.5*burstShare(at) + 42*math.Pow(leakShare(at), 2)
}

func uptimeSeconds(at time.Time) float64 {
	return at.Sub(lastStartBefore(at)).Seconds()
}

func networkReceivedBytesPerSecond(at time.Time) float64 {
	return 180*kibibyte + 3.1*kibibyte*requestsPerSecond(at)
}
