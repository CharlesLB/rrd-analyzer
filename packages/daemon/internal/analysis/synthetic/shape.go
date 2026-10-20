package synthetic

const (
	syntheticGapLength     = 46
	gapPosition            = 0.62
	spikePosition          = 0.45
	requestSpikeLead       = 7
	cpuSpikeHalfWidth      = 15
	defaultSpikeHalfWidth  = 11
	cpuSpikeAmplitude      = 3.4
	defaultSpikeAmplitude  = 2.4
	randomSpikeWindowStart = 0.35
	randomSpikeWindowWidth = 0.4
)

// syntheticShape is where one series' incident sits: the spike it rises into and, for a series
// that goes silent, the rows it reports nothing over.
type syntheticShape struct {
	spikeAt        int
	spikeHalfWidth int
	spikeAmplitude float64
	gapStart       int
	gapEnd         int
	count          int
}

// shapeOf places the incident the design reference was drawn around: the CPU saturation lands at
// the same row for every run, the request burst a little before it so the two overlap, and every
// other series draws its spike from the generator. The generator is only consulted for those
// others, which is what keeps the row sequence of the random walk identical to the reference.
func shapeOf(definition syntheticDefinition, count int, random func() float64) syntheticShape {
	shape := syntheticShape{
		spikeHalfWidth: defaultSpikeHalfWidth,
		spikeAmplitude: defaultSpikeAmplitude,
		gapStart:       int(float64(count) * gapPosition),
		count:          count,
	}
	shape.gapEnd = shape.gapStart + syntheticGapLength

	switch definition.name {
	case cpuUserSeries:
		shape.spikeAt = int(float64(count) * spikePosition)
		shape.spikeHalfWidth = cpuSpikeHalfWidth
		shape.spikeAmplitude = cpuSpikeAmplitude
	case requestRateSeries:
		shape.spikeAt = int(float64(count)*spikePosition) - requestSpikeLead
	default:
		shape.spikeAt = int(float64(count) * (randomSpikeWindowStart + random()*randomSpikeWindowWidth))
	}

	return shape
}
