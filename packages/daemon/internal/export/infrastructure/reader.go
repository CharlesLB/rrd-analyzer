package infrastructure

import (
	"context"
	"fmt"
	"os"

	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
)

type FileReader struct{}

func NewFileReader() *FileReader {
	return &FileReader{}
}

func (reader *FileReader) Read(callerContext context.Context, path string) ([]byte, error) {
	if err := callerContext.Err(); err != nil {
		return nil, fmt.Errorf("read source %q: %w", path, err)
	}

	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read source %q: %w: %w", path, exportDomain.ErrSourceUnreadable, err)
	}

	return content, nil
}
