package signal

const (
	SparkPoints = 26

	// SparkSmoothingRadius is how many samples on each side of a sparkline point are averaged
	// into it, so a single noisy reading does not dominate a 60 pixel drawing. It is exported
	// because a caller that wants a line drawn to the edge of what it asked for has to have read
	// this many samples past that edge.
	SparkSmoothingRadius = 2
)

// Spark is the reference prototype's sparkline, returned as points rather than as a path so the
// front can draw it at any size. It spreads SparkPoints over the range, each the mean of the
// present samples within the smoothing radius, and a point with none is nil, which the drawing
// shows as a lifted pen.
func Spark(values []float64, from, until int) []*float64 {
	first := max(0, from)
	last := max(first+1, min(len(values)-1, until))

	points := make([]*float64, SparkPoints)
	for point := range points {
		center := int(RoundHalfUp(float64(first) + float64((last-first)*point)/float64(SparkPoints-1)))

		sum := 0.0
		count := 0

		for index := center - SparkSmoothingRadius; index <= center+SparkSmoothingRadius; index++ {
			if index >= 0 && index < len(values) && Present(values[index]) {
				sum += values[index]
				count++
			}
		}

		if count > 0 {
			mean := sum / float64(count)
			points[point] = &mean
		}
	}

	return points
}
