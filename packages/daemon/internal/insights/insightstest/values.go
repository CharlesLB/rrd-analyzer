// Package insightstest builds the value slices the insights tests feed their detectors. It lives
// outside any _test.go file so the engine tests and the signal tests shape a series the same way
// instead of each keeping a copy that can drift.
package insightstest

// RampAfter is flat at zero through flatUntil and then moves by slope per sample, so a detector
// under test has an exact onset to find.
func RampAfter(count, flatUntil int, slope float64) []float64 {
	values := make([]float64, count)
	for index := range values {
		if index > flatUntil {
			values[index] = slope * float64(index-flatUntil)
		}
	}

	return values
}

// Noise is a repeatable stand-in for measurement noise: a value in [-1, 1) that depends only on the
// index, so a test over a noisy series fails the same way every time it fails. It is the finalizer
// of SplitMix64, which leaves no pattern from one index to the next for a detector to mistake for a
// signal.
func Noise(index int) float64 {
	const (
		goldenGamma  = 0x9E3779B97F4A7C15
		firstMixer   = 0xBF58476D1CE4E5B9
		secondMixer  = 0x94D049BB133111EB
		mantissaBits = 53
		halfRange    = 1 << (mantissaBits - 1)
	)

	mixed := (uint64(index) + 1) * goldenGamma //nolint:gosec // an index is never negative, and wrapping is the point of a mixer
	mixed = (mixed ^ (mixed >> 30)) * firstMixer
	mixed = (mixed ^ (mixed >> 27)) * secondMixer
	mixed ^= mixed >> 31

	// Centred as an integer before it is scaled, so no product is left for the compiler to fuse
	// with the subtraction.
	centred := int64(mixed>>(64-mantissaBits)) - halfRange

	return float64(centred) / halfRange
}
