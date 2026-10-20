package classify

import (
	"fmt"
	"regexp"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/strict"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/digest"
)

const documentArrayKey = "match"

var (
	typePattern   = regexp.MustCompile(`^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)+$`)
	phrasePattern = regexp.MustCompile(`^[A-Za-z0-9]+([_-][A-Za-z0-9]+)*\*?$`)
)

type entryDocument struct {
	Type              string   `toml:"type"`
	FileAny           []string `toml:"file_any"`
	DataSourceAny     []string `toml:"ds_any"`
	NameAny           []string `toml:"name_any"`
	DataSourceTypeAny []string `toml:"ds_type_any"`
	ExcludeAny        []string `toml:"exclude_any"`
}

// Parse reads a classifier document. An entry that does not validate is dropped with a diagnostic
// and the entries around it still load; a document that is not TOML at all yields no entries.
func Parse(content []byte, origin string) ([]domain.ClassifierEntry, []domain.Diagnostic) {
	tables, unknownKeys, err := strict.Tables(content, documentArrayKey)
	if err != nil {
		unreadable := unreadableDocument.Raise(err.Error())
		unreadable.Origin = origin

		return nil, []domain.Diagnostic{unreadable}
	}

	diagnostics := make([]domain.Diagnostic, 0, len(unknownKeys))
	for _, key := range unknownKeys {
		unknown := unknownKey.Raise(fmt.Sprintf("top-level key %q is not part of the classifier format", key))
		unknown.Origin = origin
		diagnostics = append(diagnostics, unknown)
	}

	entries := make([]domain.ClassifierEntry, 0, len(tables))

	for position, table := range tables {
		entry, problems := parseEntry(table)
		if len(problems) == 0 {
			entries = append(entries, entry)

			continue
		}

		for _, problem := range problems {
			problem.Origin = origin
			problem.Detail = fmt.Sprintf("match #%d: %s", position+1, problem.Detail)
			diagnostics = append(diagnostics, problem)
		}
	}

	return entries, diagnostics
}

func parseEntry(table map[string]any) (domain.ClassifierEntry, []domain.Diagnostic) {
	var document entryDocument

	unknownKeys, err := strict.Decode(table, &document)
	if err != nil {
		return domain.ClassifierEntry{}, []domain.Diagnostic{invalidEntry.Raise(err.Error())}
	}

	var problems []domain.Diagnostic

	for _, key := range unknownKeys {
		problems = append(problems, unknownKey.Raise(fmt.Sprintf("key %q is not part of a match entry", key)))
	}

	if !typePattern.MatchString(document.Type) {
		problems = append(problems, invalidEntry.Raise(fmt.Sprintf("type %q must be a dotted lower-case name such as memory.used", document.Type)))
	}

	if len(document.FileAny)+len(document.DataSourceAny)+len(document.NameAny)+len(document.DataSourceTypeAny) == 0 {
		problems = append(problems, invalidEntry.Raise("an entry needs at least one of file_any, ds_any, name_any or ds_type_any"))
	}

	for _, phrase := range joinedPhrases(document) {
		if !phrasePattern.MatchString(phrase) {
			problems = append(problems, invalidEntry.Raise(fmt.Sprintf("phrase %q must be words joined by _ with an optional trailing *", phrase)))
		}
	}

	return domain.ClassifierEntry{
		Type:              document.Type,
		FileAny:           document.FileAny,
		DataSourceAny:     document.DataSourceAny,
		NameAny:           document.NameAny,
		DataSourceTypeAny: document.DataSourceTypeAny,
		ExcludeAny:        document.ExcludeAny,
	}, problems
}

func joinedPhrases(document entryDocument) []string {
	phrases := make([]string, 0, len(document.FileAny)+len(document.DataSourceAny)+len(document.NameAny)+len(document.ExcludeAny))
	phrases = append(phrases, document.FileAny...)
	phrases = append(phrases, document.DataSourceAny...)
	phrases = append(phrases, document.NameAny...)

	return append(phrases, document.ExcludeAny...)
}

// Types lists the distinct types the entries can produce, in first appearance order, which is the
// taxonomy a ruleset is validated against.
func Types(entries []domain.ClassifierEntry) []string {
	seen := make(map[string]bool, len(entries))
	types := make([]string, 0, len(entries))

	for _, entry := range entries {
		if !seen[entry.Type] {
			seen[entry.Type] = true
			types = append(types, entry.Type)
		}
	}

	return types
}

// Hash is a content hash of the entries in order. Order is hashed because it decides which entry
// wins, so reordering two entries is a change that must invalidate cached reports.
func Hash(entries []domain.ClassifierEntry) (string, error) {
	hash, err := digest.OfJSON(entries)
	if err != nil {
		return "", fmt.Errorf("hash the classifier: %w", err)
	}

	return hash, nil
}
