// Package infrastructure reads RRD sources, off disk or out of memory. A binary database is handed
// over as it is, because the parser reads the common layout in place; rrdtool is asked only for the
// variants it cannot, so the application works on a machine that does not have rrdtool at all.
package infrastructure

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	rrdDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/domain"
	rrdUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/usecase"
)

const (
	dumpToolName     = "rrdtool"
	dumpToolArgument = "dump"

	// endOfOptions comes before the path so a file whose name starts with a dash is read as the
	// file it is, never as an option of the tool.
	endOfOptions = "--"

	// dumpToolTimeout bounds one dump. The desktop window hands every call the context of the
	// whole application, which never ends while the window is open, so a dump that hangs would
	// otherwise hold its analysis forever.
	dumpToolTimeout = time.Minute

	// dumpToolWaitDelay bounds how long a killed dump may keep its output open, so the timeout
	// ends the call even if the tool left a child process writing to the same pipe.
	dumpToolWaitDelay = time.Second
)

var byteOrderMark = []byte{0xEF, 0xBB, 0xBF}

// DumpReader hands over the dump a source holds. withoutTool is what a layout the parser cannot
// read in place comes to when there is no rrdtool to ask: on disk the tool is merely missing from
// the machine, while sources kept in memory have no file for a tool to read at all.
type DumpReader struct {
	contents    rrdDomain.SourceContents
	toolPath    string
	timeout     time.Duration
	withoutTool error
}

func NewDumpReader() *DumpReader {
	reader := &DumpReader{contents: diskContents{}, timeout: dumpToolTimeout, withoutTool: rrdDomain.ErrDumpToolMissing}

	if toolPath, err := exec.LookPath(dumpToolName); err == nil {
		reader.toolPath = toolPath
	}

	return reader
}

// NewDumpReaderOver reads sources out of contents rather than off disk, which is how the browser
// edition holds the files a person opened. It never runs rrdtool: those sources are not files.
func NewDumpReaderOver(contents rrdDomain.SourceContents) *DumpReader {
	if contents == nil {
		panic("rrd dump reader: SourceContents are required")
	}

	return &DumpReader{contents: contents, timeout: dumpToolTimeout, withoutTool: rrdDomain.ErrUnreadableLayout}
}

func (reader *DumpReader) ReadDump(callerContext context.Context, path string) ([]byte, error) {
	if err := callerContext.Err(); err != nil {
		return nil, fmt.Errorf("read source %q: %w", path, err)
	}

	content, err := reader.contents.Read(callerContext, path)
	if err != nil {
		return nil, fmt.Errorf("%q: %w: %w", path, rrdDomain.ErrUnreadableSource, err)
	}

	if isXMLDump(content) {
		return content, nil
	}

	if !rrdUsecase.IsBinaryDatabase(content) {
		return nil, fmt.Errorf("%q: %w", path, rrdDomain.ErrNotAnRRDDump)
	}

	if rrdUsecase.CanDecodeBinary(content) {
		return content, nil
	}

	return reader.runDumpTool(callerContext, path)
}

func (reader *DumpReader) runDumpTool(callerContext context.Context, path string) ([]byte, error) {
	if reader.toolPath == "" {
		return nil, fmt.Errorf("%q: %w", path, reader.withoutTool)
	}

	dumpContext, cancel := context.WithTimeout(callerContext, reader.timeout)
	defer cancel()

	var stdout, stderr bytes.Buffer

	// The binary is resolved by exec.LookPath, the sub-command is a constant, and path is the
	// file the user picked in a native dialog. No shell is involved, so nothing here expands.
	//nolint:gosec // G204: fixed binary and sub-command; the path is the user's own choice.
	command := exec.CommandContext(dumpContext, reader.toolPath, dumpToolArgument, endOfOptions, path)
	command.Stdout = &stdout
	command.Stderr = &stderr
	command.WaitDelay = dumpToolWaitDelay

	if err := command.Run(); err != nil {
		if stopped := dumpContext.Err(); stopped != nil {
			return nil, fmt.Errorf("rrdtool dump %q: %w", path, stopped)
		}

		var exitError *exec.ExitError
		if errors.As(err, &exitError) {
			return nil, fmt.Errorf("rrdtool dump %q: %w: %s", path, exitError, strings.TrimSpace(stderr.String()))
		}

		return nil, fmt.Errorf("rrdtool dump %q: %w", path, err)
	}

	return stdout.Bytes(), nil
}

func isXMLDump(content []byte) bool {
	trimmed := bytes.TrimLeft(bytes.TrimPrefix(content, byteOrderMark), " \t\r\n")

	return bytes.HasPrefix(trimmed, []byte("<"))
}

// diskContents reads a source off disk, where the desktop window and the development server keep
// the files an analysis names.
type diskContents struct{}

func (diskContents) Read(_ context.Context, path string) ([]byte, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %q: %w", path, err)
	}

	return content, nil
}
