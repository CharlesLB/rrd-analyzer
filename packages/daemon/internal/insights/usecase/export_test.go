package usecase

import "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"

// AssembleConfigurationOver is AssembleConfiguration laying the user's files over the given defaults
// instead of the embedded ones, so a test can make the defaults fail.
func AssembleConfigurationOver(classifier func() ([]domain.ClassifierEntry, error), ruleset func(knownTypes []string) ([]domain.Rule, error), files UserFiles) (domain.Configuration, error) {
	return assembleConfiguration(defaults{classifier: classifier, ruleset: ruleset}, files)
}
