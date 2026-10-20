package infrastructure

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/messages"
)

const (
	filterPatternSeparator = ";"
	filterPatternWildcard  = "*"
)

var errNotARegularFile = errors.New("not a regular file")

// _sourceExtensions are the files a dropped folder contributes: exactly the ones the source dialog
// filters on, read from its pattern so the two can never disagree.
var _sourceExtensions = extensionsOf(messages.SourceFilterPattern)

func extensionsOf(pattern string) []string {
	globs := strings.Split(pattern, filterPatternSeparator)

	extensions := make([]string, 0, len(globs))
	for _, glob := range globs {
		extensions = append(extensions, strings.ToLower(strings.TrimPrefix(glob, filterPatternWildcard)))
	}

	return extensions
}

// SourceDescriber reads back the identity of the paths a person chose. The frontend can name a file
// it picked but never learns its size, and a path dropped onto the window arrives with neither.
type SourceDescriber struct{}

func NewSourceDescriber() *SourceDescriber {
	return &SourceDescriber{}
}

func (describer *SourceDescriber) Describe(callerContext context.Context, paths []string) ([]analysisDomain.SourceFile, error) {
	described := make([]analysisDomain.SourceFile, 0, len(paths))
	for _, path := range paths {
		if err := callerContext.Err(); err != nil {
			return nil, fmt.Errorf("describe sources: %w", err)
		}

		sources, err := describePath(path)
		if err != nil {
			return nil, err
		}

		described = append(described, sources...)
	}

	return described, nil
}

// describePath reads one chosen path. A dropped folder stands for the sources directly inside it:
// that is how a host's RRD files are usually kept, one flat folder per host, and handing the folder
// itself on would create an analysis whose only source cannot be read. Its subfolders are left
// alone so a drop never walks an unbounded tree. Anything else that is not a regular file is
// refused before it reaches an analysis.
func describePath(path string) ([]analysisDomain.SourceFile, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("describe source %q: %w", path, err)
	}

	if info.IsDir() {
		return describeFolder(path)
	}

	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("describe source %q: %w", path, errNotARegularFile)
	}

	return []analysisDomain.SourceFile{{Name: filepath.Base(path), Path: path, Size: info.Size()}}, nil
}

func describeFolder(folder string) ([]analysisDomain.SourceFile, error) {
	entries, err := os.ReadDir(folder)
	if err != nil {
		return nil, fmt.Errorf("describe source folder %q: %w", folder, err)
	}

	var described []analysisDomain.SourceFile
	for _, entry := range entries {
		if !entry.Type().IsRegular() || !isSourceName(entry.Name()) {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			return nil, fmt.Errorf("describe source %q: %w", entry.Name(), err)
		}

		described = append(described, analysisDomain.SourceFile{Name: entry.Name(), Path: filepath.Join(folder, entry.Name()), Size: info.Size()})
	}

	return described, nil
}

func isSourceName(name string) bool {
	return slices.Contains(_sourceExtensions, strings.ToLower(filepath.Ext(name)))
}
