package usecase

import (
	"crypto/aes"
	"crypto/cipher"
	"fmt"
	"strconv"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

const (
	_nonceBytes = 12

	// _additionalDataPrefix starts the additional data of every blob, naming the protocol and its
	// version, so a blob sealed for another purpose with the same key can never pass for one of these.
	_additionalDataPrefix = "rrd-analyzer/1/"
	_stateSuffix          = "/state"
	_filesSegment         = "/files/"
	_pathSeparator        = "/"
)

// sealer seals and opens a session's blobs with AES-256-GCM. A sealed blob is the nonce, then the
// ciphertext and its tag; the additional data binds it to the place it is stored at, so a service
// that swapped two chunks, or served one session's state as another's, is caught when it is opened.
type sealer struct {
	aead    cipher.AEAD
	entropy domain.Entropy
}

// newSealer refuses a key that is not KeyBytes long, which is a key a corrupt registry handed back:
// every key this package draws or decodes has that length.
//
// cipher.NewGCM fails only for a block whose size is not sixteen bytes, and AES blocks always are.
func newSealer(key []byte, entropy domain.Entropy) (sealer, error) {
	if len(key) != domain.KeyBytes {
		return sealer{}, fmt.Errorf("%w: a session key is %d bytes, this one is %d", domain.ErrKeyRefused, domain.KeyBytes, len(key))
	}

	block, _ := aes.NewCipher(key)
	aead, _ := cipher.NewGCM(block)

	return sealer{aead: aead, entropy: entropy}, nil
}

func (sealing sealer) seal(additionalData []byte, plaintext []byte) []byte {
	nonce := make([]byte, _nonceBytes, _nonceBytes+len(plaintext)+sealing.aead.Overhead())
	sealing.entropy.Fill(nonce)

	return sealing.aead.Seal(nonce, nonce, plaintext, additionalData)
}

// open answers with the plaintext, and with false for a blob this key did not seal at this place.
// Which error that is depends on what was being opened, so the caller names it.
func (sealing sealer) open(additionalData []byte, sealed []byte) ([]byte, bool) {
	if len(sealed) < _nonceBytes+sealing.aead.Overhead() {
		return nil, false
	}

	plaintext, err := sealing.aead.Open(nil, sealed[:_nonceBytes], sealed[_nonceBytes:], additionalData)

	return plaintext, err == nil
}

func stateAdditionalData(sessionID string) []byte {
	return []byte(_additionalDataPrefix + sessionID + _stateSuffix)
}

func chunkAdditionalData(sessionID string, fileID string, index int) []byte {
	return []byte(_additionalDataPrefix + sessionID + _filesSegment + fileID + _pathSeparator + strconv.Itoa(index))
}

// chunkCountOf is how many chunks a file of size bytes is cut into. An empty file is one empty
// chunk, so every file the state names has at least one blob to download.
func chunkCountOf(size int) int {
	return max(1, (size+domain.ChunkBytes-1)/domain.ChunkBytes)
}

// chunkAt is the index-th chunk of content.
func chunkAt(content []byte, index int) []byte {
	start := index * domain.ChunkBytes

	return content[start:min(start+domain.ChunkBytes, len(content))]
}
