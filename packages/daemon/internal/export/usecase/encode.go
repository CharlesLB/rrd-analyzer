// Package usecase encodes exports and names the files they are written to.
package usecase

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strings"
	"time"

	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
)

const (
	csvFileExtension   = ".csv"
	exportFilePrefix   = "rrd"
	fileNameSeparator  = "_"
	slugSeparator      = '-'
	compactTimeLayout  = "200601021504"
	singleSeriesExport = 1
)

// EncodeTable writes a table as CSV. A table without rows is refused: there is nothing to export.
func EncodeTable(table exportDomain.Table) ([]byte, error) {
	if len(table.Rows) == 0 {
		return nil, exportDomain.ErrNothingToExport
	}

	var buffer bytes.Buffer

	writer := csv.NewWriter(&buffer)
	if err := writer.Write(table.Header); err != nil {
		return nil, fmt.Errorf("write csv header: %w", err)
	}

	if err := writer.WriteAll(table.Rows); err != nil {
		return nil, fmt.Errorf("write csv rows: %w", err)
	}

	return buffer.Bytes(), nil
}

// CSVFileName names an export after the window it covers, to the minute, in the local time the
// window was shown in. An export of a single series also carries the series, the way the image
// exports the frontend names do, so a chart's PNG and its CSV sort side by side.
func CSVFileName(seriesNames []string, fromMilliseconds, untilMilliseconds int64) string {
	parts := make([]string, 0, len(seriesNames)+3)
	parts = append(parts, exportFilePrefix)
	if len(seriesNames) == singleSeriesExport {
		parts = append(parts, slugOf(seriesNames[0]))
	}

	parts = append(parts,
		time.UnixMilli(fromMilliseconds).Format(compactTimeLayout),
		time.UnixMilli(untilMilliseconds).Format(compactTimeLayout),
	)

	return strings.Join(parts, fileNameSeparator) + csvFileExtension
}

// slugOf lowercases a series name and turns every run of anything but ASCII letters and digits into
// one hyphen, never leading or trailing.
func slugOf(name string) string {
	var slug strings.Builder

	pendingSeparator := false
	for _, character := range strings.ToLower(name) {
		if !isSlugCharacter(character) {
			pendingSeparator = true

			continue
		}

		if pendingSeparator && slug.Len() > 0 {
			slug.WriteRune(slugSeparator)
		}

		pendingSeparator = false
		slug.WriteRune(character)
	}

	return slug.String()
}

func isSlugCharacter(character rune) bool {
	return (character >= 'a' && character <= 'z') || (character >= '0' && character <= '9')
}
