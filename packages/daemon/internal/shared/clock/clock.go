// Package clock is the system time, injected rather than reached for.
package clock

import "time"

type System struct{}

func New() System {
	return System{}
}

func (System) Now() time.Time {
	return time.Now()
}
