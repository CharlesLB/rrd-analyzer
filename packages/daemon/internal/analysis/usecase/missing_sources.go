package usecase

import (
	"context"
	"fmt"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
)

type sourcePresenceOption struct {
	presence analysisDomain.SourcePresence
}

func (option sourcePresenceOption) apply(service *Service) { service.presence = option.presence }

// WithSourcePresence lets an analysis name the sources that are no longer on disk. Without it no
// source is ever reported missing.
func WithSourcePresence(presence analysisDomain.SourcePresence) Option {
	return sourcePresenceOption{presence: presence}
}

type everySourcePresent struct{}

func (everySourcePresent) Exists(context.Context, string) (bool, error) { return true, nil }

// MissingSources names the files of an analysis that are no longer where it read them from, in the
// order the analysis lists them. It is what a failed opening is explained with: one absent file
// fails the whole analysis, and only its name tells a person which file to put back. A source with
// no path was never on disk, so it is not one that went missing.
func (service *Service) MissingSources(callerContext context.Context, analysisID string) ([]analysisDomain.SourceFile, error) {
	analysis, err := service.find(callerContext, analysisID)
	if err != nil {
		return nil, err
	}

	missing := make([]analysisDomain.SourceFile, 0, len(analysis.Files))
	for _, file := range analysis.Files {
		if file.Path == "" {
			continue
		}

		exists, err := service.presence.Exists(callerContext, file.Path)
		if err != nil {
			return nil, fmt.Errorf("look for the sources of %q: %w", analysis.Name, err)
		}

		if !exists {
			missing = append(missing, file)
		}
	}

	return missing, nil
}
