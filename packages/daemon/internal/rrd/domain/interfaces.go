package domain

import "context"

type DumpReader interface {
	ReadDump(callerContext context.Context, path string) ([]byte, error)
}

// SourceContents is where the bytes of a source come from: the disk, for the desktop window and the
// development server, or the memory of the browser tab the browser edition runs in.
type SourceContents interface {
	Read(callerContext context.Context, path string) ([]byte, error)
}
