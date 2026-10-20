package infrastructure

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
)

// SourcePresence looks for a source on disk without reading it.
type SourcePresence struct{}

func NewSourcePresence() *SourcePresence {
	return &SourcePresence{}
}

// Exists reports a path nothing is at as absent, and every other failure to look as an error: a
// folder that cannot be searched says nothing about whether the file inside it is gone.
func (presence *SourcePresence) Exists(callerContext context.Context, path string) (bool, error) {
	if err := callerContext.Err(); err != nil {
		return false, fmt.Errorf("look for source %q: %w", path, err)
	}

	_, err := os.Stat(path)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}

	if err != nil {
		return false, fmt.Errorf("look for source %q: %w", path, err)
	}

	return true, nil
}
