package rules_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/rules"
)

func FuzzParse(f *testing.F) {
	defaults, err := os.ReadFile(filepath.Join("defaults", "rules.toml"))
	if err != nil {
		f.Fatalf("read default rules: %v", err)
	}

	for _, seed := range []string{string(defaults), oomFromDiskIO, validRule, validRule + validRule, "[[rule]\n", "rule = 3", "[[rule]]\ntrigger = 3\n[[rule.condition]]\n"} {
		f.Add([]byte(seed))
	}

	f.Fuzz(func(t *testing.T, content []byte) {
		parsed, diagnostics := rules.Parse(content, origin, knownTypes)
		for _, rule := range parsed {
			if rule.ID == "" {
				t.Errorf("a rule without an id loaded alongside %d diagnostics", len(diagnostics))
			}
		}

		if _, err := rules.Hash(parsed); err != nil {
			t.Errorf("a ruleset that parsed did not hash: %v", err)
		}
	})
}

func FuzzParseWhen(f *testing.F) {
	for _, seed := range []string{"rising", "> 90%", "< -3.5", "spike", ">", "> 1e9999", "%"} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, text string) {
		when, err := rules.ParseWhen(text)
		if err == nil && when.Detector == "" {
			t.Errorf("ParseWhen(%q) accepted a condition without a detector", text)
		}
	})
}

func FuzzParseDuration(f *testing.F) {
	for _, seed := range []string{"15m", "7h55m", "0s", "999999999d999999999d", "1h-", ""} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, text string) {
		milliseconds, err := rules.ParseDuration(text)
		if err == nil && milliseconds <= 0 {
			t.Errorf("ParseDuration(%q) = %d without an error", text, milliseconds)
		}
	})
}

func FuzzParseTemplate(f *testing.F) {
	for _, seed := range []string{"Peak {cpu.peak}.", "{{x}}", "{a→b.lag}", "{", "}", "{a.b.c.d.peak}{window.duration}", "outage.onset - 3h"} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, text string) {
		template, err := rules.ParseTemplate(text)
		if err != nil {
			return
		}

		for _, segment := range template {
			if segment.Token != nil && segment.Token.Alias == "" {
				t.Errorf("ParseTemplate(%q) produced a token without an alias", text)
			}
		}

		_, _ = rules.ParseToken(text)
		_, _ = rules.ParseInstant(text)
	})
}
