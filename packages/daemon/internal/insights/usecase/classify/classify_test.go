package classify_test

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/classify"
)

func defaultEntries(t *testing.T) []domain.ClassifierEntry {
	t.Helper()

	entries, err := classify.Defaults()
	if err != nil {
		t.Fatalf("load default classifier: %v", err)
	}

	return entries
}

func gauge(file, dataSource string) domain.SeriesInfo {
	return domain.SeriesInfo{ID: file + "/" + dataSource, File: file, DataSource: dataSource, DataSourceType: "GAUGE"}
}

func TestTypeOf_DefaultClassifier_NamesEverySeriesTheRulesNeed(t *testing.T) {
	entries := defaultEntries(t)

	tests := []struct {
		name     string
		give     domain.SeriesInfo
		want     string
		wantType bool
	}{
		{name: "prototype goroutines", give: gauge("atlas_runtime_goroutines.rrd", "value"), want: "runtime.goroutines", wantType: true},
		{name: "prototype gc pause", give: gauge("atlas_runtime_gc_pause.rrd", "value"), want: "runtime.gc.pause", wantType: true},
		{name: "prototype heap objects", give: gauge("atlas_runtime_heap_objects.rrd", "value"), want: "heap.objects", wantType: true},
		{name: "prototype user cpu", give: gauge("atlas_system_cpu_user.rrd", "value"), want: "cpu.user", wantType: true},
		{name: "prototype system cpu", give: gauge("atlas_system_cpu_system.rrd", "value"), want: "cpu.system", wantType: true},
		{name: "prototype memory used", give: gauge("atlas_system_memory_used.rrd", "value"), want: "memory.used", wantType: true},
		{name: "prototype packets sent", give: gauge("atlas_system_network_packets_sent.rrd", "value"), want: "net.tx.packets", wantType: true},
		{name: "prototype packets received", give: gauge("atlas_system_network_packets_recv.rrd", "value"), want: "net.rx.packets", wantType: true},
		{name: "prototype request rate", give: gauge("atlas_http_requests_rate.rrd", "value"), want: "http.requests", wantType: true},
		{name: "prototype p95 latency", give: gauge("atlas_http_latency_p95.rrd", "value"), want: "http.latency", wantType: true},
		{name: "atlas memory percent", give: gauge("atlas_system_memory_used_percent.rrd", "value"), want: "memory.util", wantType: true},
		{name: "atlas swap used", give: gauge("atlas_system_memory_swap_used.rrd", "value"), want: "swap.used", wantType: true},
		{name: "atlas swap percent", give: gauge("atlas_system_memory_swap_used_percent.rrd", "value"), want: "swap.util", wantType: true},
		{name: "atlas network bytes received", give: gauge("atlas_system_network_bytes_recv.rrd", "value"), want: "net.rx", wantType: true},
		{name: "atlas network errors are not traffic", give: gauge("atlas_system_network_errors_sent.rrd", "value")},
		{name: "atlas disk percent", give: gauge("atlas_system_disk_used_percent.rrd", "value"), want: "disk.space", wantType: true},
		{name: "atlas disk used bytes", give: gauge("atlas_system_disk_used.rrd", "value"), want: "disk.used", wantType: true},
		{name: "atlas application uptime is the process, not the host", give: gauge("atlas_application_uptime_seconds.rrd", "value"), want: "process.up", wantType: true},
		{name: "host uptime", give: gauge("uptime.rrd", "value"), want: "system.up", wantType: true},
		{name: "atlas one-minute load", give: gauge("atlas_system_load_1min.rrd", "value"), want: "load.1m", wantType: true},
		{name: "atlas fifteen-minute load", give: gauge("atlas_system_load_15min.rrd", "value"), want: "load.avg", wantType: true},
		{name: "collectd short-term load", give: domain.SeriesInfo{File: "load.rrd", DataSource: "shortterm"}, want: "load.1m", wantType: true},
		{name: "atlas cpu idle is not usage", give: gauge("atlas_system_cpu_idle.rrd", "value"), want: "cpu.idle", wantType: true},
		{name: "atlas heap allocated is not heap in use", give: gauge("atlas_runtime_memory_heap_alloc.rrd", "value"), want: "runtime.heap.alloc", wantType: true},
		{name: "atlas heap in use", give: gauge("atlas_runtime_memory_heap_inuse.rrd", "value"), want: "runtime.heap.used", wantType: true},
		{name: "atlas heap reserved from the system", give: gauge("atlas_runtime_memory_heap_sys.rrd", "value"), want: "runtime.heap", wantType: true},
		{name: "atlas last gc pause", give: gauge("atlas_runtime_gc_pause_last_ns.rrd", "value"), want: "runtime.gc.pause", wantType: true},
		{name: "atlas cumulative gc pause is not a pause", give: gauge("atlas_runtime_gc_pause_total_ns.rrd", "value"), want: "runtime.gc", wantType: true},
		{name: "atlas gc count", give: gauge("atlas_runtime_gc_num_gc.rrd", "value"), want: "runtime.gc.count", wantType: true},
		{name: "atlas dropped packets are not traffic", give: gauge("atlas_system_network_drops_recv.rrd", "value")},
		{name: "atlas elasticsearch nodes", give: gauge("atlas_application_elasticsearch_node_count.rrd", "value"), want: "search.nodes", wantType: true},
		{name: "atlas elasticsearch queries", give: gauge("atlas_application_elasticsearch_queries_executed.rrd", "value"), want: "search.queries", wantType: true},
		{name: "atlas elasticsearch search rate", give: gauge("atlas_application_elasticsearch_search_rate.rrd", "value"), want: "search.queries", wantType: true},
		{name: "atlas elasticsearch indexing", give: gauge("atlas_application_elasticsearch_indexing_rate.rrd", "value"), want: "search.indexing", wantType: true},
		{name: "atlas elasticsearch failed queries are not traffic", give: gauge("atlas_application_elasticsearch_queries_failed.rrd", "value")},
		{name: "a plain request rate is not search", give: gauge("atlas_http_requests_rate.rrd", "value"), want: "http.requests", wantType: true},
		{name: "collectd interface packets", give: domain.SeriesInfo{File: "if_packets-eth0.rrd", DataSource: "tx"}, want: "net.tx.packets", wantType: true},
		{name: "collectd disk reads in a two data source file", give: domain.SeriesInfo{File: "disk-sda.rrd", DataSource: "read", DataSourceType: "DERIVE"}, want: "disk.read", wantType: true},
		{name: "collectd disk writes in the same file", give: domain.SeriesInfo{File: "disk-sda.rrd", DataSource: "write", DataSourceType: "DERIVE"}, want: "disk.write", wantType: true},
		{name: "nvme device by prefix", give: domain.SeriesInfo{File: "disk-nvme0n1.rrd", DataSource: "read"}, want: "disk.read", wantType: true},
		{name: "collectd memory used in bytes", give: gauge("memory.rrd", "used"), want: "memory.used", wantType: true},
		{name: "collectd memory free in bytes", give: gauge("memory.rrd", "free"), want: "memory.free", wantType: true},
		{name: "collectd memory cached in bytes", give: gauge("memory.rrd", "cached"), want: "memory.cached", wantType: true},
		{name: "collectd memory buffered in bytes", give: gauge("memory.rrd", "buffered"), want: "memory.buffered", wantType: true},
		{name: "collectd interface octets", give: domain.SeriesInfo{File: "interface-eth0.rrd", DataSource: "rx"}, want: "net.rx", wantType: true},
		{name: "name used when there is no file", give: domain.SeriesInfo{Name: "host_cpu_user", DataSource: "value"}, want: "cpu.user", wantType: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, found := classify.TypeOf(entries, tt.give)
			if got != tt.want || found != tt.wantType {
				t.Errorf("TypeOf(%s, %s) = %q, %v; want %q, %v", tt.give.File, tt.give.DataSource, got, found, tt.want, tt.wantType)
			}
		})
	}
}

func TestTypeOf_Clauses_AllMustHoldAndFirstMatchWins(t *testing.T) {
	entries := []domain.ClassifierEntry{
		{Type: "counter.reset", NameAny: []string{"restarts"}, DataSourceTypeAny: []string{"counter"}},
		{Type: "queue.depth", FileAny: []string{"queue_depth*"}, ExcludeAny: []string{"dead"}},
		{Type: "queue.any", NameAny: []string{"queue"}},
	}

	tests := []struct {
		name string
		give domain.SeriesInfo
		want string
	}{
		{name: "data source type matches case-insensitively", give: domain.SeriesInfo{File: "app_restarts.rrd", DataSourceType: "COUNTER"}, want: "counter.reset"},
		{name: "wrong data source type falls through", give: domain.SeriesInfo{File: "app_restarts.rrd", DataSourceType: "GAUGE"}, want: ""},
		{name: "phrase with a prefix word", give: domain.SeriesInfo{File: "mail_queue_depths.rrd"}, want: "queue.depth"},
		{name: "exclusion lets a later entry match", give: domain.SeriesInfo{File: "dead_queue_depth.rrd"}, want: "queue.any"},
		{name: "words out of order are not the phrase", give: domain.SeriesInfo{File: "depth_queue.rrd"}, want: "queue.any"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got, _ := classify.TypeOf(entries, tt.give); got != tt.want {
				t.Errorf("TypeOf(%s) = %q, want %q", tt.give.File, got, tt.want)
			}
		})
	}
}

func TestClassify_Series_SplitIntoClassifiedAndUnclassifiedInCatalogOrder(t *testing.T) {
	entries := []domain.ClassifierEntry{{Type: "cpu.user", NameAny: []string{"cpu_user"}}}
	series := []domain.SeriesInfo{
		{ID: "a", File: "host_cpu_user.rrd"}, {ID: "b", File: "goroutines.rrd", Label: "goroutines", DataSource: "value"}, {ID: "c", File: "other_cpu_user.rrd"},
	}

	result := classify.Classify(entries, series)

	if len(result.Classified) != 2 || result.Classified[0].Series.ID != "a" || result.Classified[1].Series.ID != "c" {
		t.Errorf("classified = %+v, want a then c", result.Classified)
	}

	if len(result.Unclassified) != 1 || result.Unclassified[0].ID != "b" {
		t.Errorf("unclassified = %+v, want goroutines", result.Unclassified)
	}

	if bound := result.SeriesOfType("cpu.user"); len(bound) != 2 {
		t.Errorf("SeriesOfType = %+v, want both cpu series", bound)
	}

	if bound := result.OfType("cpu.user"); len(bound) != 2 || bound[1].Series.ID != "c" || bound[1].Type != "cpu.user" {
		t.Errorf("OfType = %+v, want both cpu series with their type", bound)
	}
}

func TestParse_ClassifierDocuments_RejectInvalidEntriesOneByOne(t *testing.T) {
	tests := []struct {
		name            string
		give            string
		wantTypes       []string
		wantDiagnostics []string
	}{
		{name: "valid entries", give: "[[match]]\ntype = \"cpu.user\"\nname_any = [\"cpu_user\"]\n\n[[match]]\ntype = \"cpu.user\"\nfile_any = [\"cpu\"]\nds_any = [\"user\"]\n",
			wantTypes: []string{"cpu.user", "cpu.user"}},
		{name: "unknown top-level key", give: "version = 2\n[[match]]\ntype = \"cpu.user\"\nname_any = [\"cpu\"]\n",
			wantTypes: []string{"cpu.user"}, wantDiagnostics: []string{classify.DiagnosticUnknownKey}},
		{name: "unknown entry key sinks only that entry", give: "[[match]]\ntype = \"cpu.user\"\nname_any = [\"cpu\"]\nfiles = [\"x\"]\n\n[[match]]\ntype = \"disk.read\"\nname_any = [\"read\"]\n",
			wantTypes: []string{"disk.read"}, wantDiagnostics: []string{classify.DiagnosticUnknownKey}},
		{name: "type without a dot", give: "[[match]]\ntype = \"cpu\"\nname_any = [\"cpu\"]\n", wantDiagnostics: []string{classify.DiagnosticInvalidEntry}},
		{name: "no clause", give: "[[match]]\ntype = \"cpu.user\"\nexclude_any = [\"idle\"]\n", wantDiagnostics: []string{classify.DiagnosticInvalidEntry}},
		{name: "malformed phrase", give: "[[match]]\ntype = \"cpu.user\"\nname_any = [\"cpu user!\"]\n", wantDiagnostics: []string{classify.DiagnosticInvalidEntry}},
		{name: "wrong value type", give: "[[match]]\ntype = \"cpu.user\"\nname_any = 3\n", wantDiagnostics: []string{classify.DiagnosticInvalidEntry}},
		{name: "not TOML", give: "[[match]\n", wantDiagnostics: []string{classify.DiagnosticUnreadableDocument}},
		{name: "match is not an array of tables", give: "match = 3\n", wantDiagnostics: []string{classify.DiagnosticUnreadableDocument}},
		{name: "empty document", give: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entries, diagnostics := classify.Parse([]byte(tt.give), "classifier.toml")

			if len(entries) != len(tt.wantTypes) {
				t.Fatalf("entries = %+v, want types %v", entries, tt.wantTypes)
			}

			for index, entry := range entries {
				if entry.Type != tt.wantTypes[index] {
					t.Errorf("entry %d type = %q, want %q", index, entry.Type, tt.wantTypes[index])
				}
			}

			if len(diagnostics) != len(tt.wantDiagnostics) {
				t.Fatalf("diagnostics = %+v, want %v", diagnostics, tt.wantDiagnostics)
			}

			for index, diagnostic := range diagnostics {
				if diagnostic.Type != tt.wantDiagnostics[index] || diagnostic.Origin != "classifier.toml" || diagnostic.Detail == "" {
					t.Errorf("diagnostic %d = %+v, want type %s from classifier.toml with a detail", index, diagnostic, tt.wantDiagnostics[index])
				}
			}
		})
	}
}

func hashOf(t *testing.T, entries []domain.ClassifierEntry) string {
	t.Helper()

	hash, err := classify.Hash(entries)
	if err != nil {
		t.Fatalf("hash: %v", err)
	}

	return hash
}

func TestTypesAndHash_FollowEntryOrder(t *testing.T) {
	forwards := []domain.ClassifierEntry{{Type: "cpu.user", NameAny: []string{"cpu"}}, {Type: "disk.read", NameAny: []string{"read"}}, {Type: "cpu.user", NameAny: []string{"user"}}}
	backwards := []domain.ClassifierEntry{forwards[2], forwards[1], forwards[0]}

	if types := classify.Types(forwards); len(types) != 2 || types[0] != "cpu.user" || types[1] != "disk.read" {
		t.Errorf("Types = %v, want cpu.user then disk.read once each", types)
	}

	if hashOf(t, forwards) == hashOf(t, backwards) {
		t.Error("reordering entries did not change the hash")
	}

	rebuilt := []domain.ClassifierEntry{backwards[2], backwards[1], backwards[0]}
	if hashOf(t, forwards) != hashOf(t, rebuilt) {
		t.Error("the same entries in the same order hashed differently")
	}
}
