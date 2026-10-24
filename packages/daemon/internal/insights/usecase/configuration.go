package usecase

import (
	"slices"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/classify"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/rules"
)

// UserFile is one of the files a person may keep beside the embedded defaults, as it was read.
type UserFile struct {
	// Origin is where the file lives, which every diagnostic about it names.
	Origin string

	// Content is nil when there is no such file, or when it could not be read.
	Content []byte

	// Unreadable is the diagnostic a failed read raised, reported where the file's own would be.
	Unreadable *domain.Diagnostic
}

// UserFiles is the pair a person may keep beside the embedded defaults. They are one value because
// they are always read together and are the same type: passed apart, swapping them would compile
// and parse the rules as a classifier.
type UserFiles struct {
	Classifier UserFile
	Rules      UserFile
}

// defaults is where assembling a configuration finds the classifier and the ruleset the user's files
// are laid over. The rules are parsed against the merged taxonomy, so they are asked for with it.
//
// They are reached through functions rather than called directly because the embedded documents
// always parse: standing in defaults that do not is the only way to exercise what assembling does
// when a build ships broken ones.
type defaults struct {
	classifier func() ([]domain.ClassifierEntry, error)
	ruleset    func(knownTypes []string) ([]domain.Rule, error)
}

// AssembleConfiguration lays the user's classifier over the default one, takes the types rules may
// name from the result, parses the user's rules against those types and lays them over the default
// rules, then hashes both, so a cached report notices an edit. A missing user file changes nothing;
// one that cannot be read or holds mistakes is reported, and every default still loads.
func AssembleConfiguration(files UserFiles) (domain.Configuration, error) {
	return assembleConfiguration(defaults{classifier: classify.Defaults, ruleset: rules.Defaults}, files)
}

func assembleConfiguration(shipped defaults, files UserFiles) (domain.Configuration, error) {
	defaultEntries, err := shipped.classifier()
	if err != nil {
		return domain.Configuration{}, err
	}

	var diagnostics []domain.Diagnostic

	diagnostics = appendProblem(diagnostics, files.Classifier.Unreadable)

	userEntries, classifierDiagnostics := parseOptional(files.Classifier, classify.Parse)
	diagnostics = append(diagnostics, classifierDiagnostics...)

	entries := slices.Concat(userEntries, defaultEntries)
	types := classify.Types(entries)

	defaultRules, err := shipped.ruleset(types)
	if err != nil {
		return domain.Configuration{}, err
	}

	diagnostics = appendProblem(diagnostics, files.Rules.Unreadable)

	parsedRules, ruleDiagnostics := parseOptional(files.Rules, func(content []byte, origin string) ([]domain.Rule, []domain.Diagnostic) {
		return rules.Parse(content, origin, types)
	})
	diagnostics = append(diagnostics, ruleDiagnostics...)

	merged := rules.Merge(defaultRules, parsedRules)

	rulesetHash, err := rules.Hash(merged)
	if err != nil {
		return domain.Configuration{}, err
	}

	return domain.Configuration{
		Rules:          merged,
		Classifier:     entries,
		RulesetHash:    rulesetHash,
		ClassifierHash: classify.Hash(entries),
		Diagnostics:    diagnostics,
	}, nil
}

func parseOptional[Parsed any](file UserFile, parse func([]byte, string) ([]Parsed, []domain.Diagnostic)) ([]Parsed, []domain.Diagnostic) {
	if file.Content == nil {
		return nil, nil
	}

	return parse(file.Content, file.Origin)
}

func appendProblem(diagnostics []domain.Diagnostic, problem *domain.Diagnostic) []domain.Diagnostic {
	if problem == nil {
		return diagnostics
	}

	return append(diagnostics, *problem)
}
