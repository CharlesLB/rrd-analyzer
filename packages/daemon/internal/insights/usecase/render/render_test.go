package render_test

import (
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/render"
)

func TestToFixed_MatchesJavaScript_IncludingExactBinaryTies(t *testing.T) {
	tests := []struct {
		name   string
		give   float64
		digits int
		want   string
	}{
		{name: "tie picks the larger candidate", give: 0.125, digits: 2, want: "0.13"},
		{name: "another tie", give: 0.375, digits: 2, want: "0.38"},
		{name: "tie at one digit", give: 1.25, digits: 1, want: "1.3"},
		{name: "half to zero digits", give: 2.5, digits: 0, want: "3"},
		{name: "half below one", give: 0.5, digits: 0, want: "1"},
		{name: "negative tie keeps the sign and the larger magnitude", give: -2.5, digits: 0, want: "-3"},
		{name: "not a tie in binary", give: 1.005, digits: 2, want: "1.00"},
		{name: "negative rounding to zero keeps the sign", give: -0.04, digits: 1, want: "-0.0"},
		{name: "negative zero has no sign", give: math.Copysign(0, -1), digits: 1, want: "0.0"},
		{name: "padding zeros", give: 123.456, digits: 5, want: "123.45600"},
		{name: "leading zeros", give: 0.001, digits: 2, want: "0.00"},
		{name: "zero digits", give: 97, digits: 0, want: "97"},
		{name: "negative digits behave as zero", give: 12.7, digits: -1, want: "13"},
		{name: "exponential from 1e21", give: 1e21, digits: 2, want: "1e+21"},
		{name: "not a number", give: math.NaN(), digits: 2, want: "NaN"},
		{name: "infinity", give: math.Inf(1), digits: 2, want: "Infinity"},
		{name: "negative infinity", give: math.Inf(-1), digits: 2, want: "-Infinity"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := render.ToFixed(tt.give, tt.digits); got != tt.want {
				t.Errorf("ToFixed(%v, %d) = %q, want %q", tt.give, tt.digits, got, tt.want)
			}
		})
	}
}

func TestNumber_PortsThePrototypeFormat(t *testing.T) {
	tests := []struct {
		name string
		give float64
		unit string
		want string
	}{
		{name: "gibibytes", give: 6632664690.340441, unit: "B", want: "6.18 GiB"},
		{name: "bytes below a kibibyte", give: 512, unit: "B", want: "512.0 B"},
		{name: "exactly a kibibyte", give: 1024, unit: "B", want: "1.00 KiB"},
		{name: "beyond the largest prefix", give: math.Pow(1024, 5), unit: "B", want: "1024.0 TiB"},
		{name: "percent", give: 97, unit: "%", want: "97.0%"},
		{name: "hundreds with a unit", give: 1315.0754008968338, unit: "req/s", want: "1315 req/s"},
		{name: "milliseconds", give: 155.09393639152603, unit: "ms", want: "155 ms"},
		{name: "billions", give: 2.5e9, unit: "", want: "2.50G"},
		{name: "negative millions", give: -3.2e6, unit: "x", want: "-3.20M x"},
		{name: "ten thousands", give: 12345, unit: "", want: "12.3k"},
		{name: "units", give: 5.25, unit: "", want: "5.25"},
		{name: "below one", give: 0.5, unit: "", want: "0.500"},
		{name: "missing", give: math.NaN(), unit: "B", want: render.NotAvailable},
		{name: "infinite", give: math.Inf(1), unit: "", want: render.NotAvailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := render.Number(tt.give, tt.unit); got != tt.want {
				t.Errorf("Number(%v, %q) = %q, want %q", tt.give, tt.unit, got, tt.want)
			}
		})
	}
}

func TestDuration_PortsThePrototypeFormat(t *testing.T) {
	const minute = 60000.0

	const hour = 60 * minute

	const day = 24 * hour

	tests := []struct {
		name string
		give float64
		want string
	}{
		{name: "minutes", give: 89 * minute, want: "89 min"},
		{name: "zero", give: 0, want: "0 min"},
		{name: "negative rounds to zero without a sign", give: -0.2 * minute, want: "0 min"},
		{name: "half a minute rounds up into hours", give: 89.5 * minute, want: "1.5 h"},
		{name: "hours with a decimal", give: 185 * minute, want: "3.1 h"},
		{name: "whole hours from ten", give: 610 * minute, want: "10 h"},
		{name: "just under two days", give: 47.9 * hour, want: "48 h"},
		{name: "days with a decimal", give: 3 * day, want: "3.0 d"},
		{name: "whole days from ten", give: 30 * day, want: "30 d"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := render.Duration(tt.give); got != tt.want {
				t.Errorf("Duration(%v) = %q, want %q", tt.give, got, tt.want)
			}
		})
	}
}

func TestCause_ProseAndTokens_AlternateWithMergedProse(t *testing.T) {
	first := domain.Token{Alias: "cpu", Field: domain.FieldPeak}
	second := domain.Token{Alias: "cpu", Field: domain.FieldBase}
	template := domain.Template{
		{Text: "from "}, {Token: &second}, {Text: ""}, {Token: &first}, {Text: " over"}, {Text: " time."},
	}

	parts := render.Cause(template, func(token domain.Token) domain.CausePart {
		return domain.CausePart{Text: string(token.Field)}
	})

	want := []domain.CausePart{{Text: "from "}, {Text: "base", Emphasis: true}, {Text: "peak", Emphasis: true}, {Text: " over time."}}
	if len(parts) != len(want) {
		t.Fatalf("Cause = %+v, want %+v", parts, want)
	}

	for index := range want {
		if parts[index].Text != want[index].Text || parts[index].Emphasis != want[index].Emphasis {
			t.Errorf("part %d = %+v, want %+v", index, parts[index], want[index])
		}
	}
}

func TestInstantAndValue_AreEmphasisedParts(t *testing.T) {
	instant := render.Instant(0)
	if instant.Text != "1970-01-01 00:00 UTC" || !instant.Emphasis || instant.InstantMilliseconds == nil || *instant.InstantMilliseconds != 0 {
		t.Errorf("Instant(0) = %+v, want the epoch as an emphasised instant", instant)
	}

	if value := render.Value("3 h"); value.Text != "3 h" || !value.Emphasis || value.InstantMilliseconds != nil {
		t.Errorf("Value = %+v, want emphasised text without an instant", value)
	}
}
