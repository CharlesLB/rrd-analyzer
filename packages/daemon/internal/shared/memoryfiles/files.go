// Package memoryfiles keeps the files a person opened in the browser edition, which has no disk:
// each one in the memory of the tab it was opened in, under a path of its own, for as long as the
// tab stays open. Nothing here is ever written anywhere else.
package memoryfiles

import (
	"context"
	"fmt"
	"io/fs"
	"strconv"
	"sync"
)

// pathPrefix starts every path this package hands out, so a kept file can never be mistaken for one
// on a disk, and a path of this kind read by anything else fails rather than opening a real file.
const pathPrefix = "memory:/"

// Files is the set of files kept so far. Keep, Read and Exists may be called from any goroutine.
type Files struct {
	mutex      sync.RWMutex
	contents   map[string][]byte
	lastIssued int
}

func New() *Files {
	return &Files{contents: make(map[string][]byte)}
}

// Keep holds a copy of content and answers with the path it is kept under. Every call gets a path
// of its own, so two files that share a name never stand in for each other.
func (files *Files) Keep(name string, content []byte) string {
	kept := make([]byte, len(content))
	copy(kept, content)

	files.mutex.Lock()
	defer files.mutex.Unlock()

	files.lastIssued++
	path := pathPrefix + strconv.Itoa(files.lastIssued) + "/" + name
	files.contents[path] = kept

	return path
}

// Read answers with the content kept under path. It hands over the kept bytes rather than a copy:
// a source can be hundreds of megabytes, every reader only parses it, and copying it on each read
// would hold it twice in a tab that has no memory to spare.
func (files *Files) Read(callerContext context.Context, path string) ([]byte, error) {
	if err := callerContext.Err(); err != nil {
		return nil, fmt.Errorf("read kept file %q: %w", path, err)
	}

	files.mutex.RLock()
	defer files.mutex.RUnlock()

	content, kept := files.contents[path]
	if !kept {
		return nil, fmt.Errorf("read kept file %q: %w", path, fs.ErrNotExist)
	}

	return content, nil
}

// Exists says whether a file is kept under path.
func (files *Files) Exists(callerContext context.Context, path string) (bool, error) {
	if err := callerContext.Err(); err != nil {
		return false, fmt.Errorf("look for kept file %q: %w", path, err)
	}

	files.mutex.RLock()
	defer files.mutex.RUnlock()

	_, kept := files.contents[path]

	return kept, nil
}

// Forget lets go of the file kept under path, so a tab that is done with it gets its memory back. A
// path that holds nothing is already forgotten.
func (files *Files) Forget(path string) {
	files.mutex.Lock()
	defer files.mutex.Unlock()

	delete(files.contents, path)
}
