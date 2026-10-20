package usecase

import "testing"

func TestInferredUnit_ReadsTheUnitFromTheWordsOfTheName(t *testing.T) {
	tests := []struct {
		name               string
		giveName           string
		giveDataSource     string
		giveDataSourceType string
		wantUnit           string
	}{
		{name: "a percentage", giveName: "atlas_system_memory_used_percent", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: "%"},
		{name: "a utilisation", giveName: "atlas_system_cpu_utilization", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: "%"},
		{name: "memory", giveName: "atlas_system_memory_used", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: "B"},
		{name: "the heap", giveName: "atlas_runtime_memory_heap_alloc", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: "B"},
		{name: "objects on the heap are counted, not weighed", giveName: "api_runtime_heap_objects", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: ""},
		{name: "a count of memory pages", giveName: "memory_page_count", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: ""},
		{name: "a collectd memory file", giveName: "memory_used", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: "B"},
		{name: "disk space", giveName: "atlas_system_disk_available", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: "B"},
		{name: "disk operations", giveName: "disk_sda_disk_ops", giveDataSource: "read", giveDataSourceType: "DERIVE", wantUnit: "/s"},
		{name: "bytes counted", giveName: "interface_eth0_if_octets", giveDataSource: "rx", giveDataSourceType: "DERIVE", wantUnit: "B/s"},
		{name: "a gauge of bytes", giveName: "atlas_system_network_bytes_recv", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: "B"},
		{name: "nanoseconds", giveName: "atlas_runtime_gc_pause_total_ns", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: "ns"},
		{name: "milliseconds", giveName: "http_latency_ms", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: "ms"},
		{name: "seconds", giveName: "atlas_application_uptime_seconds", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: "s"},
		{name: "the data source names the unit", giveName: "nginx", giveDataSource: "bytes", giveDataSourceType: "COUNTER", wantUnit: "B/s"},
		{name: "a percentage kept by a counter", giveName: "cpu_percent", giveDataSource: "value", giveDataSourceType: "DERIVE", wantUnit: "%"},
		{name: "a word inside another", giveName: "queue_items", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: ""},
		{name: "nothing said", giveName: "atlas_runtime_goroutines", giveDataSource: "value", giveDataSourceType: "GAUGE", wantUnit: ""},
		{name: "a rate saying nothing else", giveName: "requests", giveDataSource: "value", giveDataSourceType: "COUNTER", wantUnit: "/s"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := inferredUnit(tt.giveName, tt.giveDataSource, tt.giveDataSourceType); got != tt.wantUnit {
				t.Errorf("inferredUnit(%q, %q, %q) = %q, want %q", tt.giveName, tt.giveDataSource, tt.giveDataSourceType, got, tt.wantUnit)
			}
		})
	}
}
