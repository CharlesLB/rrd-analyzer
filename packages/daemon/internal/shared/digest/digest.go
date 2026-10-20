// Package digest names content by a hash of its JSON encoding. Cached reports are keyed by these
// digests, so the encoding and the hex spelling are a contract: changing either invalidates every
// stored key.
package digest

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// OfJSON returns the encoding error unwrapped so each caller can say, in its own words, why its
// value cannot fail to encode.
func OfJSON(value any) (string, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", err
	}

	sum := sha256.Sum256(encoded)

	return hex.EncodeToString(sum[:]), nil
}
