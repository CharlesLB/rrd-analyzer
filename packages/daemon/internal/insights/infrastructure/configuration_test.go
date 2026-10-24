package infrastructure_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/rules"
)

var errAssemblyRefused = errors.New("configuration test: assembly refused")

const overridingRules = `
[[rule]]
id = "cpu-saturation"
severity = "critical"
title = "Operator CPU rule"
cause = "CPU peaked at {cpu.peak}."

[[rule.condition]]
as = "cpu"
type = "cpu.user"
when = "> 90"

[[rule]]
id = "operator-extra"
severity = "info"
title = "Operator extra rule"
cause = "Load at {load.avg.peak}."

[[rule.condition]]
type = "load.avg"
when = "rising"

[[rule]]
id = "broken"
severity = "urgent"
title = "Broken rule"
cause = "never loads"

[[rule.condition]]
type = "cpu.user"
when = "rising"
`

const operatorClassifier = `
[[match]]
type = "queue.depth"
name_any = ["queue_depth"]
`

func writeFile(t *testing.T, directory, name, content string) {
	t.Helper()

	if err := os.WriteFile(filepath.Join(directory, name), []byte(content), 0o600); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
}

func ruleIDs(configuration domain.Configuration) []string {
	ids := make([]string, 0, len(configuration.Rules))
	for _, rule := range configuration.Rules {
		ids = append(ids, rule.ID)
	}

	return ids
}

const defaultRuleIDs = "oom-after-memory-climb,cpu-saturation,latency-drift,process-restart,restart-loop,restarts-recurring," +
	"heap-growth-before-restart,load-surge,memory-pressure,swap-exhausted,disk-filling,disk-full-forecast,goroutine-collapse," +
	"goroutine-collapse-recurring,cpu-reading-frozen,search-cluster-unreachable"

func TestConfigurationLoader_Defaults_LoadEveryDefaultRuleWithoutDiagnostics(t *testing.T) {
	loader := infrastructure.NewConfigurationLoader("")

	configuration, err := loader.Load(context.Background())
	if err != nil {
		t.Fatalf("load defaults: %v", err)
	}

	if len(configuration.Diagnostics) != 0 {
		t.Fatalf("defaults produced diagnostics: %+v", configuration.Diagnostics)
	}

	if got, want := strings.Join(ruleIDs(configuration), ","), defaultRuleIDs; got != want {
		t.Errorf("rule ids = %s, want %s", got, want)
	}

	rulesetHash, err := rules.Hash(configuration.Rules)
	if err != nil {
		t.Fatalf("hash the loaded rules: %v", err)
	}

	if configuration.RulesetHash != rulesetHash || len(configuration.RulesetHash) != 64 {
		t.Errorf("ruleset hash %q does not hash the loaded rules", configuration.RulesetHash)
	}

	if len(configuration.ClassifierHash) != 64 {
		t.Errorf("classifier hash %q is not a sha256 digest", configuration.ClassifierHash)
	}
}

func TestConfigurationLoader_UserOverrides_ReplaceSameIDInPlaceAppendNewAndRejectInvalid(t *testing.T) {
	directory := t.TempDir()
	writeFile(t, directory, infrastructure.RulesFileName, overridingRules)
	writeFile(t, directory, infrastructure.ClassifierFileName, operatorClassifier)

	defaults, err := infrastructure.NewConfigurationLoader("").Load(context.Background())
	if err != nil {
		t.Fatalf("load defaults: %v", err)
	}

	configuration, err := infrastructure.NewConfigurationLoader(directory).Load(context.Background())
	if err != nil {
		t.Fatalf("load with overrides: %v", err)
	}

	if got, want := strings.Join(ruleIDs(configuration), ","), defaultRuleIDs+",operator-extra"; got != want {
		t.Errorf("rule ids = %s, want %s", got, want)
	}

	if configuration.Rules[1].Title != "Operator CPU rule" {
		t.Errorf("cpu-saturation title = %q, want the operator's", configuration.Rules[1].Title)
	}

	if configuration.Classifier[0].Type != "queue.depth" {
		t.Errorf("first classifier entry = %q, want the operator's entry first", configuration.Classifier[0].Type)
	}

	if configuration.RulesetHash == defaults.RulesetHash || configuration.ClassifierHash == defaults.ClassifierHash {
		t.Error("overrides did not change the hashes")
	}

	if len(configuration.Diagnostics) != 1 || configuration.Diagnostics[0].RuleID != "broken" ||
		configuration.Diagnostics[0].Type != rules.DiagnosticUnknownSeverity {
		t.Fatalf("diagnostics = %+v, want one unknown-severity for broken", configuration.Diagnostics)
	}

	if !strings.HasSuffix(configuration.Diagnostics[0].Origin, infrastructure.RulesFileName) {
		t.Errorf("origin = %q, want the user's rules file", configuration.Diagnostics[0].Origin)
	}
}

func TestConfigurationLoader_ChangedUserFile_IsReadAgainOnTheNextLoad(t *testing.T) {
	directory := t.TempDir()
	loader := infrastructure.NewConfigurationLoader(directory)

	first, err := loader.Load(context.Background())
	if err != nil {
		t.Fatalf("first load: %v", err)
	}

	again, err := loader.Load(context.Background())
	if err != nil || again.RulesetHash != first.RulesetHash {
		t.Fatalf("unchanged load = %q, %v; want the same hash", again.RulesetHash, err)
	}

	writeFile(t, directory, infrastructure.RulesFileName, overridingRules)

	changed, err := loader.Load(context.Background())
	if err != nil {
		t.Fatalf("load after edit: %v", err)
	}

	if changed.RulesetHash == first.RulesetHash {
		t.Error("an edited rules file did not change the ruleset hash")
	}
}

func TestConfigurationLoader_UnreadableUserFile_IsReportedAndDefaultsStillLoad(t *testing.T) {
	directory := t.TempDir()
	if err := os.Mkdir(filepath.Join(directory, infrastructure.RulesFileName), 0o700); err != nil {
		t.Fatalf("make directory in place of the rules file: %v", err)
	}

	configuration, err := infrastructure.NewConfigurationLoader(directory).Load(context.Background())
	if err != nil {
		t.Fatalf("load: %v", err)
	}

	if strings.Join(ruleIDs(configuration), ",") != defaultRuleIDs || len(configuration.Diagnostics) != 1 {
		t.Fatalf("rules = %d, diagnostics = %+v; want the defaults and one diagnostic", len(configuration.Rules), configuration.Diagnostics)
	}
}

func TestConfigurationLoader_MalformedUserDocument_IsOneDiagnostic(t *testing.T) {
	directory := t.TempDir()
	writeFile(t, directory, infrastructure.RulesFileName, "[[rule]\nid = ")
	writeFile(t, directory, infrastructure.ClassifierFileName, "match = 3")

	configuration, err := infrastructure.NewConfigurationLoader(directory).Load(context.Background())
	if err != nil {
		t.Fatalf("load: %v", err)
	}

	if len(configuration.Diagnostics) != 2 {
		t.Fatalf("diagnostics = %+v, want one per malformed document", configuration.Diagnostics)
	}
}

func TestConfigurationLoader_CancelledContext_ReturnsTheCancellation(t *testing.T) {
	callerContext, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := infrastructure.NewConfigurationLoader("").Load(callerContext)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
}

func TestConfigurationLoader_AssemblyThatFails_IsReturnedAndTriedAgainOnTheNextLoad(t *testing.T) {
	const failingAttempts = 1

	assembled := domain.Configuration{RulesetHash: "assembled-ruleset"}
	attempts := 0
	assemble := func(usecase.UserFiles) (domain.Configuration, error) {
		attempts++
		if attempts <= failingAttempts {
			return domain.Configuration{}, errAssemblyRefused
		}

		return assembled, nil
	}

	loader := infrastructure.NewConfigurationLoaderAssembledBy(t.TempDir(), assemble)

	if _, err := loader.Load(context.Background()); !errors.Is(err, errAssemblyRefused) {
		t.Fatalf("first load error = %v, want the assembly failure", err)
	}

	configuration, err := loader.Load(context.Background())
	if err != nil || configuration.RulesetHash != assembled.RulesetHash {
		t.Errorf("second load = %+v, %v; want the configuration assembled again, the failure not remembered", configuration, err)
	}
}
