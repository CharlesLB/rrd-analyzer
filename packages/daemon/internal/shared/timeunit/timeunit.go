// Package timeunit is how many milliseconds each unit of time holds, and where an instant falls on
// a grid of steps. Every instant and span this module keeps is a count of milliseconds, so these
// are the conversions it needs.
//
// They are integer constants rather than time.Duration arithmetic: a Duration counts nanoseconds
// and runs out in 2262, while an instant read from an RRD header is only bounded far beyond that.
package timeunit

import "time"

const (
	MillisecondsPerSecond = int64(time.Second / time.Millisecond)
	MillisecondsPerMinute = int64(time.Minute / time.Millisecond)
	MillisecondsPerHour   = int64(time.Hour / time.Millisecond)
	MillisecondsPerDay    = 24 * MillisecondsPerHour
)

// StartOfStep is the start of the step of a grid anchored at zero that holds the instant, before it
// for an instant before zero too, where Go's division would round toward zero instead. A step that
// is not positive has no grid, and the instant is its own start.
func StartOfStep(instant, step int64) int64 {
	if step <= 0 {
		return instant
	}

	offset := instant % step
	if offset < 0 {
		offset += step
	}

	return instant - offset
}
