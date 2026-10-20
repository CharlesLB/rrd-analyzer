// Package infrastructure reads the sources an export copies and writes finished exports to disk.
package infrastructure

import (
	"context"
	"fmt"
	"os"
)

const exportFileMode = 0o644

type FileWriter struct{}

func NewFileWriter() *FileWriter {
	return &FileWriter{}
}

func (writer *FileWriter) Write(callerContext context.Context, path string, content []byte) error {
	if err := callerContext.Err(); err != nil {
		return fmt.Errorf("write export %q: %w", path, err)
	}

	if err := os.WriteFile(path, content, exportFileMode); err != nil {
		return fmt.Errorf("write export %q: %w", path, err)
	}

	return nil
}
