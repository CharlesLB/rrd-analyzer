// Package failure is the error type every domain declares its own failures with.
package failure

// Error is an error that is its own message. Being a string type it is comparable, so errors.Is
// matches it, and declarable as a const, so a domain's list of failures cannot be reassigned at
// runtime the way a package-level var of errors.New can.
type Error string

func (sentinel Error) Error() string {
	return string(sentinel)
}
