package synthetic

import seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"

// The two series the design reference was drawn around: their incident is placed by hand so the
// screenshots land on the same rows every run, while every other series draws its own.
const (
	cpuUserSeries     = "atlas_system_cpu_user"
	requestRateSeries = "atlas_http_requests_rate"
)

// syntheticTrend is the long shape laid over a series' daily and weekly swing. It is declared per
// series rather than read from its name or unit, so what an example series does is stated in the
// table and not guessed from the word "heap".
type syntheticTrend int

const (
	steadyTrend syntheticTrend = iota + 1
	memoryGrowthTrend
	heapRampTrend
	latencyDriftTrend
)

type syntheticDefinition struct {
	name      string
	unit      string
	base      float64
	amplitude float64
	noise     float64
	hasGap    bool
	trend     syntheticTrend

	// seed is data rather than the row's position, so reordering the table cannot
	// silently reshape every example series.
	seed uint32
}

var syntheticDefinitions = []syntheticDefinition{
	{name: "atlas_runtime_goroutines", base: 1400, amplitude: 260, noise: 0.35, hasGap: false, trend: steadyTrend, seed: 1},
	{name: "atlas_runtime_gc_pause", unit: "ms", base: 3.2, amplitude: 1.4, noise: 0.6, hasGap: false, trend: steadyTrend, seed: 2},
	{name: "atlas_runtime_heap_objects", base: 820000, amplitude: 90000, noise: 0.3, hasGap: false, trend: heapRampTrend, seed: 3},
	{name: "atlas_system_cpu_user", unit: seriesDomain.UnitPercent, base: 38, amplitude: 14, noise: 0.5, hasGap: false, trend: steadyTrend, seed: 4},
	{name: "atlas_system_cpu_system", unit: seriesDomain.UnitPercent, base: 11, amplitude: 4, noise: 0.5, hasGap: false, trend: steadyTrend, seed: 5},
	{name: "atlas_system_memory_used", unit: seriesDomain.UnitBytes, base: 5.4e9, amplitude: 6e8, noise: 0.25, hasGap: true, trend: memoryGrowthTrend, seed: 6},
	{name: "atlas_system_network_packets_sent", unit: "pkt/s", base: 9200, amplitude: 3400, noise: 0.55, hasGap: false, trend: steadyTrend, seed: 7},
	{name: "atlas_system_network_packets_recv", unit: "pkt/s", base: 11800, amplitude: 4200, noise: 0.55, hasGap: false, trend: steadyTrend, seed: 8},
	{name: "atlas_http_requests_rate", unit: "req/s", base: 640, amplitude: 240, noise: 0.6, hasGap: false, trend: steadyTrend, seed: 9},
	{name: "atlas_http_latency_p95", unit: "ms", base: 180, amplitude: 70, noise: 0.7, hasGap: true, trend: latencyDriftTrend, seed: 10},
}
