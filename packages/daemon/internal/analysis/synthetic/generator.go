package synthetic

// A linear congruential generator, seeded from the row rather than from the clock, is what makes
// the example analyses render the same numbers on every machine and on every run.
const (
	generatorMultiplier = 1664525
	generatorIncrement  = 1013904223
	generatorModulus    = 4294967296
	seedSpread          = 7919
	seedOffset          = 13
)

func newLinearCongruentialGenerator(seed uint32) func() float64 {
	state := seed

	return func() float64 {
		state = state*generatorMultiplier + generatorIncrement

		return float64(state) / generatorModulus
	}
}
