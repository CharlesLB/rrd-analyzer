package usecase

import (
	"encoding/base64"
	"strings"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

const (
	// _identifierBytes is the randomness of a session's and a file's identifier: a hundred and
	// twenty-eight bits, which nobody guesses, written in twenty-two base64url characters.
	_identifierBytes = 16

	// _linkRoute is where the web app, served by the share service itself, opens a session from its
	// link. The app routes by hash, so the session and its key both stay after the '#', which a
	// browser never sends to a server.
	_linkRoute     = "/app/#/shared/"
	_linkSeparator = "/"

	// _liveRoute is the share service's WebSocket for a session, and _webSocketScheme what turns the
	// service's http or https address into the ws or wss one a socket opens.
	_sessionsRoute   = "/api/sessions/"
	_liveSuffix      = "/live"
	_httpScheme      = "http"
	_webSocketScheme = "ws"
)

var _encoding = base64.RawURLEncoding

func (service *Service) newIdentifier() string {
	raw := make([]byte, _identifierBytes)
	service.entropy.Fill(raw)

	return _encoding.EncodeToString(raw)
}

func (service *Service) newKey() []byte {
	key := make([]byte, domain.KeyBytes)
	service.entropy.Fill(key)

	return key
}

func (service *Service) linkOf(sessionID string, key []byte) string {
	return service.serviceURL + _linkRoute + sessionID + _linkSeparator + _encoding.EncodeToString(key)
}

func (service *Service) liveURLOf(sessionID string) string {
	return _webSocketScheme + strings.TrimPrefix(service.serviceURL, _httpScheme) + _sessionsRoute + sessionID + _liveSuffix
}

// keyOfLink checks the two halves of a link the frontend split, and answers with the key. Anything
// but a session identifier of the length this side draws, and a key of KeyBytes, is not a link this
// application wrote.
func keyOfLink(sessionID string, encodedKey string) ([]byte, error) {
	identifier, err := _encoding.DecodeString(sessionID)
	if err != nil || len(identifier) != _identifierBytes {
		return nil, domain.ErrLinkInvalid
	}

	key, err := _encoding.DecodeString(encodedKey)
	if err != nil || len(key) != domain.KeyBytes {
		return nil, domain.ErrLinkInvalid
	}

	return key, nil
}
