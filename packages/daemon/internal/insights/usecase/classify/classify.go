// Package classify gives every series a semantic type, so a rule can say "memory.used" and hold
// for a collectd memory file, a munin plugin and an exporter dump alike, instead of depending on
// whatever a data source happened to be called.
package classify

import (
	"path/filepath"
	"strings"
	"unicode"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

const (
	phraseSeparator = "_"
	prefixMarker    = "*"
)

type Classified struct {
	Series domain.SeriesInfo
	Type   string
}

// Result keeps both lists in catalog order: the order a rule sees bindings in is part of what
// makes a run deterministic.
type Result struct {
	Classified   []Classified
	Unclassified []domain.SeriesInfo
}

// OfType is every series classified as the type, with the type beside it.
func (result Result) OfType(semanticType string) []Classified {
	var bound []Classified

	for _, classified := range result.Classified {
		if classified.Type == semanticType {
			bound = append(bound, classified)
		}
	}

	return bound
}

func (result Result) SeriesOfType(semanticType string) []domain.SeriesInfo {
	bound := result.OfType(semanticType)
	series := make([]domain.SeriesInfo, 0, len(bound))

	for _, classified := range bound {
		series = append(series, classified.Series)
	}

	return series
}

// Classify gives each series the type of the first entry that matches it. First match wins so an
// operator can put a narrow entry above a broad one and know it takes precedence.
func Classify(entries []domain.ClassifierEntry, series []domain.SeriesInfo) Result {
	result := Result{Classified: []Classified{}, Unclassified: []domain.SeriesInfo{}}
	matchers := matchersOf(entries)

	for _, info := range series {
		semanticType, matched := typeOf(matchers, info)
		if !matched {
			result.Unclassified = append(result.Unclassified, info)

			continue
		}

		result.Classified = append(result.Classified, Classified{Series: info, Type: semanticType})
	}

	return result
}

// matcher is a classifier entry with its phrases already split into words, so classifying a catalog
// splits every phrase once instead of once for each series and each token list it is tried on.
type matcher struct {
	semanticType      string
	fileAny           [][]string
	dataSourceAny     [][]string
	nameAny           [][]string
	dataSourceTypeAny []string
	excludeAny        [][]string
}

func matchersOf(entries []domain.ClassifierEntry) []matcher {
	matchers := make([]matcher, 0, len(entries))
	for _, entry := range entries {
		matchers = append(matchers, matcher{
			semanticType:      entry.Type,
			fileAny:           phrasesOf(entry.FileAny),
			dataSourceAny:     phrasesOf(entry.DataSourceAny),
			nameAny:           phrasesOf(entry.NameAny),
			dataSourceTypeAny: entry.DataSourceTypeAny,
			excludeAny:        phrasesOf(entry.ExcludeAny),
		})
	}

	return matchers
}

func phrasesOf(phrases []string) [][]string {
	split := make([][]string, 0, len(phrases))
	for _, phrase := range phrases {
		split = append(split, phraseWords(phrase))
	}

	return split
}

func typeOf(matchers []matcher, info domain.SeriesInfo) (string, bool) {
	fileName := info.File
	if fileName == "" {
		fileName = info.Name
	}

	fileTokens := Tokens(strings.TrimSuffix(fileName, filepath.Ext(fileName)))
	dataSourceTokens := Tokens(info.DataSource)

	for _, entry := range matchers {
		if entry.matches(fileTokens, dataSourceTokens, info.DataSourceType) {
			return entry.semanticType, true
		}
	}

	return "", false
}

func (entry matcher) matches(fileTokens, dataSourceTokens []string, dataSourceType string) bool {
	if len(entry.fileAny) > 0 && !anyPhrase(entry.fileAny, fileTokens) {
		return false
	}

	if len(entry.dataSourceAny) > 0 && !anyPhrase(entry.dataSourceAny, dataSourceTokens) {
		return false
	}

	if len(entry.nameAny) > 0 && !anyPhrase(entry.nameAny, fileTokens) && !anyPhrase(entry.nameAny, dataSourceTokens) {
		return false
	}

	if len(entry.dataSourceTypeAny) > 0 && !anyEqualFold(entry.dataSourceTypeAny, dataSourceType) {
		return false
	}

	return !anyPhrase(entry.excludeAny, fileTokens) && !anyPhrase(entry.excludeAny, dataSourceTokens)
}

// Tokens lower-cases a name and splits it on everything that is not a letter or a digit.
func Tokens(name string) []string {
	return strings.FieldsFunc(strings.ToLower(name), func(character rune) bool {
		return !unicode.IsLetter(character) && !unicode.IsDigit(character)
	})
}

func phraseWords(phrase string) []string {
	return strings.FieldsFunc(strings.ToLower(phrase), func(character rune) bool {
		return !unicode.IsLetter(character) && !unicode.IsDigit(character) && string(character) != prefixMarker
	})
}

func anyPhrase(phrases [][]string, tokens []string) bool {
	for _, words := range phrases {
		if phraseMatches(words, tokens) {
			return true
		}
	}

	return false
}

func phraseMatches(words, tokens []string) bool {
	if len(words) == 0 {
		return false
	}

	for start := 0; start+len(words) <= len(tokens); start++ {
		if wordsMatchAt(words, tokens[start:start+len(words)]) {
			return true
		}
	}

	return false
}

func wordsMatchAt(words, tokens []string) bool {
	for index, word := range words {
		if prefix, isPrefix := strings.CutSuffix(word, prefixMarker); isPrefix && index == len(words)-1 {
			if !strings.HasPrefix(tokens[index], prefix) {
				return false
			}

			continue
		}

		if tokens[index] != word {
			return false
		}
	}

	return true
}

func anyEqualFold(candidates []string, value string) bool {
	for _, candidate := range candidates {
		if strings.EqualFold(candidate, value) {
			return true
		}
	}

	return false
}
