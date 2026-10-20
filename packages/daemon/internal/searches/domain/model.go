// Package domain is what the application remembers of the searches a person typed: which field
// they typed in, the terms, and the order they last typed them in.
package domain

const (
	// RememberedTerms is how many terms a field keeps. A history is read as a short list of what
	// was typed lately, under the field, and a list longer than a glance is one nobody reads.
	RememberedTerms = 8

	// MaximumTermRunes bounds a term. A filter of metric names or analysis titles is a word or
	// two; anything past this is a paste that was never meant to be searched for again.
	MaximumTermRunes = 200

	// MaximumFieldRunes bounds the name a field is remembered under. Names are the web app's own
	// constants, such as "chart-library", so this only refuses a caller that is not the app.
	MaximumFieldRunes = 64
)
