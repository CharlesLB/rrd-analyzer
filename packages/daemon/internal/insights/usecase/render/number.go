// Package render turns detected numbers into the words a finding shows. The formatting is a port
// of the reference prototype's fmt and dur, down to JavaScript's rounding, because the design was
// signed off on the exact strings those functions produce.
package render

import (
	"math"
	"math/big"
	"strconv"
	"strings"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const (
	NotAvailable = "n/a"

	bytesPerKibibyte = 1024
	largestByteScale = 4
	fewDigitsBelow   = 10

	billion     = 1e9
	million     = 1e6
	thousand    = 1e3
	tenThousand = 1e4
	hundred     = 100
	one         = 1

	// javaScriptExponentialFrom is where Number.prototype.toFixed gives up on fixed notation and
	// returns the plain number conversion instead.
	javaScriptExponentialFrom = 1e21
)

var byteScales = []string{"B", "K", "M", "G", "T"}

// ToFixed is JavaScript's Number.prototype.toFixed. It picks the decimal closest to the exact
// binary value and, on an exact tie, the larger one; strconv rounds that tie to even, which would
// print 0.125 as "0.12" where the prototype prints "0.13".
func ToFixed(value float64, digits int) string {
	switch {
	case math.IsNaN(value):
		return "NaN"
	case math.IsInf(value, 1):
		return "Infinity"
	case math.IsInf(value, -1):
		return "-Infinity"
	}

	sign := ""
	if value < 0 {
		sign = "-"
		value = -value
	}

	if value >= javaScriptExponentialFrom {
		return sign + strconv.FormatFloat(value, 'g', -1, 64)
	}

	digits = max(0, digits)
	scaled := new(big.Rat).SetFloat64(value)
	scaled.Mul(scaled, new(big.Rat).SetInt(new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(digits)), nil)))
	scaled.Add(scaled, big.NewRat(1, 2))

	text := new(big.Int).Quo(scaled.Num(), scaled.Denom()).String()
	if digits == 0 {
		return sign + text
	}

	if len(text) <= digits {
		text = strings.Repeat("0", digits-len(text)+1) + text
	}

	return sign + text[:len(text)-digits] + "." + text[len(text)-digits:]
}

// integerText is how JavaScript prints a whole number, which never shows a negative zero.
func integerText(value float64) string {
	if value == 0 {
		return "0"
	}

	return strconv.FormatFloat(value, 'f', -1, 64)
}

// Number is the prototype's fmt: bytes in binary prefixes, percentages with one decimal, and
// everything else with a precision that shrinks as the magnitude grows.
func Number(value float64, unit string) string {
	if !signal.Present(value) {
		return NotAvailable
	}

	if unit == seriesDomain.UnitBytes {
		scale := 0
		for value >= bytesPerKibibyte && scale < largestByteScale {
			value /= bytesPerKibibyte
			scale++
		}

		digits := 1
		if value < fewDigitsBelow {
			digits = 2
		}

		suffix := ""
		if scale > 0 {
			suffix = "iB"
		}

		return ToFixed(value, digits) + " " + byteScales[scale] + suffix
	}

	if unit == seriesDomain.UnitPercent {
		return ToFixed(value, 1) + seriesDomain.UnitPercent
	}

	text := compactNumber(value)
	if unit == "" {
		return text
	}

	return text + " " + unit
}

func compactNumber(value float64) string {
	magnitude := math.Abs(value)

	switch {
	case magnitude >= billion:
		return ToFixed(value/billion, 2) + "G"
	case magnitude >= million:
		return ToFixed(value/million, 2) + "M"
	case magnitude >= tenThousand:
		return ToFixed(value/thousand, 1) + "k"
	case magnitude >= hundred:
		return ToFixed(value, 0)
	case magnitude >= one:
		return ToFixed(value, 2)
	default:
		return ToFixed(value, 3)
	}
}
