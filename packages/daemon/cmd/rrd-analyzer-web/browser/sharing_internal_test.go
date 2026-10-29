//go:build !js

package browser

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/rrd-analyzer-web/browser/sampleanalysis"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/sharetest"
)

const (
	sharedDump = `<rrd><version>0003</version><step>300</step><lastupdate>900</lastupdate>` +
		`<ds><name>value</name><type>GAUGE</type></ds>` +
		`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database>` +
		`<row><v>1.0e+00</v></row><row><v>2.0e+00</v></row><row><v>3.0e+00</v></row>` +
		`</database></rra></rrd>`
)

func sharingEdition(t *testing.T, serviceURL string) *Edition {
	t.Helper()

	edition, err := newEdition(context.Background(), time.Now(), editionSettings{generateSample: sampleanalysis.Generate, shareService: serviceURL})
	if err != nil {
		t.Fatalf("build the edition: %v", err)
	}

	return edition
}

// served runs a call through an edition and reads its JSON answer into answer.
func served(t *testing.T, edition *Edition, method string, path string, body any, answer any) int {
	t.Helper()

	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encode the call: %v", err)
	}

	answered := edition.Serve(context.Background(), Call{RequestID: path, Method: method, Path: path, Body: encoded})
	if answer != nil && len(answered.Body) > 0 {
		if err := json.Unmarshal(answered.Body, answer); err != nil {
			t.Fatalf("decode %s %s (%d): %v: %s", method, path, answered.Status, err, answered.Body)
		}
	}

	return answered.Status
}

func TestEdition_ATabFollowingAnotherTabsSession_ChartsTheSameFile(t *testing.T) {
	service := sharetest.Started(t)

	owner := sharingEdition(t, service.URL())
	viewer := sharingEdition(t, service.URL())
	kept := owner.Keep("cpu.xml", []byte(sharedDump))

	var created struct {
		ID string `json:"id"`
	}

	served(t, owner, http.MethodPost, "/api/analyses", map[string]any{"name": "Shared", "files": []map[string]any{{"name": "cpu.xml", "path": kept}}}, &created)

	var started struct {
		Link string `json:"link"`
	}

	if status := served(t, owner, http.MethodPost, "/api/analyses/"+created.ID+"/session", map[string]any{"log": nil}, &started); status != http.StatusCreated {
		t.Fatalf("start = %d, want %d", status, http.StatusCreated)
	}

	sessionID, key := sharetest.HalvesOf(started.Link)

	var joined struct {
		AnalysisID string `json:"analysisId"`
	}

	if status := served(t, viewer, http.MethodPost, "/api/shared-sessions", map[string]string{"sessionId": sessionID, "key": key}, &joined); status != http.StatusCreated {
		t.Fatalf("join = %d, want %d", status, http.StatusCreated)
	}

	var bundle struct {
		AnalysisName string            `json:"analysisName"`
		Series       []json.RawMessage `json:"series"`
	}

	if status := served(t, viewer, http.MethodGet, "/api/analyses/"+joined.AnalysisID+"/bundle", nil, &bundle); status != http.StatusOK || bundle.AnalysisName != "Shared" || len(bundle.Series) != 1 {
		t.Errorf("the viewer's bundle = %d with %+v, want the owner's analysis and its one series", status, bundle)
	}

	if status := served(t, viewer, http.MethodDelete, "/api/shared-sessions/"+sessionID, nil, nil); status != http.StatusNoContent {
		t.Errorf("forget = %d, want %d", status, http.StatusNoContent)
	}
}
