package sampleanalysis

import (
	"math"
	"time"
)

const (
	stepSeconds  = 300
	recordedDays = 14
	rowsPerDay   = 24 * 60 * 60 / stepSeconds
	rowCount     = recordedDays * rowsPerDay

	// quietestHour shapes the day the API serves: traffic bottoms out at three in the morning, UTC, and
	// peaks twelve hours later.
	quietestHour = 3.0
	hoursPerDay  = 24.0

	// weekendShare is how much of a weekday's traffic a Saturday or a Sunday sees.
	weekendShare = 0.72

	// rampMinutes is how long the traffic burst takes to build and to die down.
	rampMinutes = 15.0
)

// recordingEnd is the last moment the sample holds. It is fixed rather than read off the clock of the
// visit, so every visitor and every test sees the same numbers, the same findings and the same log.
var recordingEnd = time.Date(2026, time.September, 30, 18, 0, 0, 0, time.UTC)

// span is a stretch of the recording, from its first moment up to its last, excluded.
type span struct {
	from  time.Time
	until time.Time
}

func (stretch span) holds(at time.Time) bool {
	return !at.Before(stretch.from) && at.Before(stretch.until)
}

// progress is how far into the stretch a moment is, from 0 at its start to 1 at its end.
func (stretch span) progress(at time.Time) float64 {
	return clamped(float64(at.Sub(stretch.from))/float64(stretch.until.Sub(stretch.from)), 0, 1)
}

func onDay(day int, hour int, minute int) time.Time {
	return time.Date(recordingEnd.Year(), recordingEnd.Month(), day, hour, minute, 0, 0, time.UTC)
}

// The incidents the sample is built around, each one a shape an insight rule recognises.
var (
	// trafficBurst triples the requests for two and a half hours and saturates the processor.
	trafficBurst = span{from: onDay(21, 14, 0), until: onDay(21, 16, 30)}

	// deployment restarts the service on a new version.
	deployment = onDay(24, 10, 5)

	// memoryLeak grows the heap and the memory the service holds until the kernel kills it.
	memoryLeak = span{from: onDay(28, 22, 0), until: onDay(29, 6, 40)}

	// outage is the service down after the kill, reporting nothing, until it starts again.
	outage = span{from: onDay(29, 6, 40), until: onDay(29, 7, 55)}
)

func recordingStart() time.Time {
	return recordingEnd.Add(-time.Duration(rowCount-1) * stepSeconds * time.Second)
}

func momentAt(row int) time.Time {
	return recordingStart().Add(time.Duration(row) * stepSeconds * time.Second)
}

// firstStart is when the service last started before the recording begins.
func firstStart() time.Time {
	return recordingStart().Add(-19 * 24 * time.Hour)
}

// lastStartBefore is when the service last started, as of a moment it was up.
func lastStartBefore(at time.Time) time.Time {
	switch {
	case !at.Before(outage.until):
		return outage.until
	case !at.Before(deployment):
		return deployment
	}

	return firstStart()
}

func isDown(at time.Time) bool {
	return outage.holds(at)
}

// dailyActivity is how busy the hour is, from 0 before dawn to 1 in the afternoon.
func dailyActivity(at time.Time) float64 {
	hour := float64(at.Hour()) + float64(at.Minute())/60

	return 0.5 - 0.5*math.Cos(2*math.Pi*(hour-quietestHour)/hoursPerDay)
}

func weekShare(at time.Time) float64 {
	if at.Weekday() == time.Saturday || at.Weekday() == time.Sunday {
		return weekendShare
	}

	return 1
}

// burstShare is how far into the traffic burst a moment is: 0 outside it, rising to 1 over its first
// minutes and falling back over its last.
func burstShare(at time.Time) float64 {
	if !trafficBurst.holds(at) {
		return 0
	}

	sinceStart := at.Sub(trafficBurst.from).Minutes()
	untilEnd := trafficBurst.until.Sub(at).Minutes()

	return clamped(math.Min(sinceStart, untilEnd)/rampMinutes, 0, 1)
}

// leakShare is how far the memory leak has gone, accelerating towards the kill.
func leakShare(at time.Time) float64 {
	if !memoryLeak.holds(at) {
		return 0
	}

	return math.Pow(memoryLeak.progress(at), 2.5)
}

// daysUp is how long the service has run since it last started, in days.
func daysUp(at time.Time) float64 {
	return at.Sub(lastStartBefore(at)).Hours() / hoursPerDay
}

// recordingShare is how far into the recording a moment is, which is what the latency drifts by.
func recordingShare(at time.Time) float64 {
	return span{from: recordingStart(), until: recordingEnd}.progress(at)
}

func clamped(value float64, lowest float64, highest float64) float64 {
	return math.Max(lowest, math.Min(highest, value))
}
