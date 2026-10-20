package rules_test

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/rules"
)

func TestParseDuration_Grammar(t *testing.T) {
	tests := []struct {
		give    string
		want    int64
		wantErr bool
	}{
		{give: "15m", want: 900000},
		{give: "7h55m", want: 28500000},
		{give: "30d", want: 2592000000},
		{give: "90s", want: 90000},
		{give: " 1h ", want: 3600000},
		{give: "", wantErr: true},
		{give: "15", wantErr: true},
		{give: "m", wantErr: true},
		{give: "1.5h", wantErr: true},
		{give: "-5m", wantErr: true},
		{give: "0m", wantErr: true},
		{give: "3651d", wantErr: true},
		{give: "9999999999d", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.give, func(t *testing.T) {
			got, err := rules.ParseDuration(tt.give)
			if (err != nil) != tt.wantErr || got != tt.want {
				t.Errorf("ParseDuration(%q) = %d, %v; want %d, error %v", tt.give, got, err, tt.want, tt.wantErr)
			}
		})
	}
}

func TestParseWhen_Grammar(t *testing.T) {
	tests := []struct {
		give    string
		want    domain.When
		wantErr bool
	}{
		{give: "rising", want: domain.When{Detector: domain.DetectorRising}},
		{give: "change_point", want: domain.When{Detector: domain.DetectorChangePoint}},
		{give: "flat", want: domain.When{Detector: domain.DetectorFlat}},
		{give: "> 90", want: domain.When{Detector: domain.DetectorThreshold, Comparison: domain.ComparisonAbove, Level: 90}},
		{give: "<5%", want: domain.When{Detector: domain.DetectorThreshold, Comparison: domain.ComparisonBelow, Level: 5, Percent: true}},
		{give: "> -3.5", want: domain.When{Detector: domain.DetectorThreshold, Comparison: domain.ComparisonAbove, Level: -3.5}},
		{give: "sideways", wantErr: true},
		{give: ">= 3", wantErr: true},
		{give: "> 1e3", wantErr: true},
		{give: "", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.give, func(t *testing.T) {
			got, err := rules.ParseWhen(tt.give)
			if (err != nil) != tt.wantErr || got != tt.want {
				t.Errorf("ParseWhen(%q) = %+v, %v; want %+v, error %v", tt.give, got, err, tt.want, tt.wantErr)
			}
		})
	}
}

func TestParseToken_Grammar(t *testing.T) {
	tests := []struct {
		give    string
		want    domain.Token
		wantErr bool
	}{
		{give: "memory.peak", want: domain.Token{Alias: "memory", Field: domain.FieldPeak}},
		{give: "memory.used.peak", want: domain.Token{Alias: "memory.used", Field: domain.FieldPeak}},
		{give: "disk.read→memory.used.lag", want: domain.Token{Alias: "memory.used", LagFrom: "disk.read", Field: domain.FieldLag}},
		{give: "finding->outage.lag", want: domain.Token{Alias: "outage", LagFrom: "finding", Field: domain.FieldLag}},
		{give: "loop.count", want: domain.Token{Alias: "loop", Field: domain.FieldCount}},
		{give: "disk.eta", want: domain.Token{Alias: "disk", Field: domain.FieldEta}},
		{give: "memory", wantErr: true},
		{give: "memory.lag", wantErr: true},
		{give: "a→b.peak", wantErr: true},
		{give: "Memory.peak", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.give, func(t *testing.T) {
			got, err := rules.ParseToken(tt.give)
			if (err != nil) != tt.wantErr || got != tt.want {
				t.Errorf("ParseToken(%q) = %+v, %v; want %+v, error %v", tt.give, got, err, tt.want, tt.wantErr)
			}
		})
	}
}

func TestParseTemplate_DoubledBracesAreLiteral(t *testing.T) {
	template, err := rules.ParseTemplate("{{literal}} {cpu.peak} end")
	if err != nil {
		t.Fatalf("ParseTemplate: %v", err)
	}

	if len(template) != 3 || template[0].Text != "{literal} " || template[1].Token == nil || template[1].Token.Alias != "cpu" || template[2].Text != " end" {
		t.Errorf("template = %+v, want literal braces, a token and trailing prose", template)
	}

	for _, malformed := range []string{"{cpu.peak", "a } b", "{cpu}"} {
		if _, err := rules.ParseTemplate(malformed); err == nil {
			t.Errorf("ParseTemplate(%q) accepted a malformed template", malformed)
		}
	}
}

func TestParseInstant_Grammar(t *testing.T) {
	tests := []struct {
		give    string
		want    domain.InstantExpression
		wantErr bool
	}{
		{give: "outage.onset - 3h", want: domain.InstantExpression{Alias: "outage", Field: domain.FieldOnset, OffsetMilliseconds: -10800000}},
		{give: "memory.used.end + 5m", want: domain.InstantExpression{Alias: "memory.used", Field: domain.FieldEnd, OffsetMilliseconds: 300000}},
		{give: "window.end", want: domain.InstantExpression{Alias: "window", Field: domain.FieldEnd}},
		{give: "outage.start", wantErr: true},
		{give: "outage.onset - 3x", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.give, func(t *testing.T) {
			got, err := rules.ParseInstant(tt.give)
			if (err != nil) != tt.wantErr || got != tt.want {
				t.Errorf("ParseInstant(%q) = %+v, %v; want %+v, error %v", tt.give, got, err, tt.want, tt.wantErr)
			}
		})
	}
}
