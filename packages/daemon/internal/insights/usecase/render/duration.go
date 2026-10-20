package render

import (
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/timeunit"
)

const (
	minutesShownUpTo      = 90
	hoursShownUpTo        = 48
	hoursWithDecimalBelow = 10
	daysWithDecimalBelow  = 10
)

// Duration is the prototype's dur: whole minutes below an hour and a half, hours below two days,
// days beyond.
func Duration(milliseconds float64) string {
	minutes := signal.RoundHalfUp(milliseconds / float64(timeunit.MillisecondsPerMinute))
	if minutes < minutesShownUpTo {
		return integerText(minutes) + " min"
	}

	hours := milliseconds / float64(timeunit.MillisecondsPerHour)
	if hours < hoursShownUpTo {
		if hours < hoursWithDecimalBelow {
			return ToFixed(hours, 1) + " h"
		}

		return integerText(signal.RoundHalfUp(hours)) + " h"
	}

	days := milliseconds / float64(timeunit.MillisecondsPerDay)
	digits := 0
	if days < daysWithDecimalBelow {
		digits = 1
	}

	return ToFixed(days, digits) + " d"
}
