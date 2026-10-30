package infrastructure

import "crypto/rand"

// SystemEntropy is the operating system's randomness, which is what keys and nonces must come from.
type SystemEntropy struct{}

// Fill cannot fail: since Go 1.24 crypto/rand.Read never returns an error, and stops the program
// itself when the system cannot supply entropy.
func (SystemEntropy) Fill(buffer []byte) {
	_, _ = rand.Read(buffer)
}
