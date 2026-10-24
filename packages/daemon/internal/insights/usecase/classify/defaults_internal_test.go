package classify

import (
	"errors"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

const unparseableClassifier = "[[match]]\ntype = \"Not A Type\"\nname_any = [\"cpu\"]\n"

// TestDefaults_EmbeddedDocumentThatDoesNotParse_FailsInsteadOfWarning stands a broken document in
// for the embedded one, which is the only way to reach the failure: the shipped classifier parses,
// and a test elsewhere holds it to that.
func TestDefaults_EmbeddedDocumentThatDoesNotParse_FailsInsteadOfWarning(t *testing.T) {
	shipped := defaultsDocument
	t.Cleanup(func() { defaultsDocument = shipped })

	defaultsDocument = unparseableClassifier

	entries, err := Defaults()
	if !errors.Is(err, domain.ErrDefaultConfiguration) || entries != nil {
		t.Errorf("Defaults = %+v, %v; want no entries and ErrDefaultConfiguration", entries, err)
	}
}
