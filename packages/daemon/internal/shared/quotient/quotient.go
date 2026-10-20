// Package quotient divides whole numbers the way a count of rows, buckets or steps needs: a remainder
// is one more of them, never a fraction dropped.
package quotient

// RoundedUp is the quotient rounded up, for a positive divisor: how many groups of divisor it takes
// to hold dividend. Go's division truncates toward zero, which already rounds a negative quotient
// up, so only a positive dividend with a remainder needs the extra one. It is written once because
// the range reader and the export grid both size their rows with it, and the usual spelling,
// (dividend + divisor - 1) / divisor, is wrong for a negative dividend and overflows near the top of
// the type.
func RoundedUp[TInteger ~int | ~int64](dividend, divisor TInteger) TInteger {
	rounded := dividend / divisor
	if dividend%divisor != 0 && dividend > 0 {
		rounded++
	}

	return rounded
}
