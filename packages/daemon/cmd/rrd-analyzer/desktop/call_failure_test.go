package desktop

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"testing"

	"github.com/wailsapp/wails/v2/pkg/options"

	sharingDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

func TestCallFailureOf_HandsThePageTheStatusTheSameErrorAnswersWithOverHTTP(t *testing.T) {
	tests := []struct {
		name       string
		give       error
		wantStatus int
	}{
		{name: "a share service that cannot be reached", give: fmt.Errorf("start a live session: %w", sharingDomain.ErrServiceFailed), wantStatus: http.StatusBadGateway},
		{name: "a share service refusing new sessions", give: fmt.Errorf("start a live session: %w", sharingDomain.ErrServiceBusy), wantStatus: http.StatusTooManyRequests},
		{name: "a session past the service's size", give: sharingDomain.ErrTooLarge, wantStatus: http.StatusRequestEntityTooLarge},
		{name: "an error no domain names", give: errors.New("disk on fire"), wantStatus: http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			encoded, err := json.Marshal(callFailureOf(tt.give))
			if err != nil {
				t.Fatalf("encode the failure: %v", err)
			}

			var received struct {
				Status  int    `json:"status"`
				Message string `json:"message"`
			}
			if err := json.Unmarshal(encoded, &received); err != nil {
				t.Fatalf("decode %s: %v", encoded, err)
			}

			if received.Status != tt.wantStatus || received.Message != tt.give.Error() {
				t.Errorf("the page receives %s, want status %d and the message %q", encoded, tt.wantStatus, tt.give.Error())
			}
		})
	}
}

func TestRun_TheWindowReportsAFailedCallWithItsStatus(t *testing.T) {
	resolvedAt(t)

	var opened *options.App
	native := &nativeStandIn{openWindow: func(application *options.App) error {
		opened = application

		return nil
	}}

	if err := run(os.DirFS(t.TempDir()), native); err != nil {
		t.Fatalf("run: %v", err)
	}

	unreachable := fmt.Errorf("start a live session: %w", sharingDomain.ErrServiceFailed)
	if got := opened.ErrorFormatter(unreachable); got != callFailureOf(unreachable) {
		t.Errorf("the window formats a failed call as %#v, want %#v", got, callFailureOf(unreachable))
	}
}
