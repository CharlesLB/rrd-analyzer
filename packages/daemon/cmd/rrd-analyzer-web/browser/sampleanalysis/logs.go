package sampleanalysis

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"math/rand/v2"
	"net/http"
	"slices"
	"strconv"
	"time"
)

const (
	serviceName     = "sample-api"
	previousVersion = "2.3.1"
	currentVersion  = "2.4.0"
	timestampLayout = "2006-01-02T15:04:05.000Z07:00"
	logSeed         = 11

	levelDebug = "debug"
	levelInfo  = "info"
	levelWarn  = "warn"
	levelError = "error"
	levelFatal = "fatal"

	ordersRoute    = "GET /v1/orders"
	batchRoute     = "POST /v1/orders/batch"
	inventoryRoute = "GET /v1/inventory"
	paymentsRoute  = "POST /v1/payments"
	healthRoute    = "GET /healthz"

	requestTimeoutMilliseconds    = 5000
	inventoryDeadlineMilliseconds = 2000

	connectionPoolSize = 50

	// latencyObjectiveMilliseconds is the p95 the service is meant to answer within. The log warns
	// whenever it is crossed, and the slow drift of the latency crosses it on the last afternoons.
	latencyObjectiveMilliseconds = 180

	// memoryLimitBytes is what the host gives the service, which the log quotes the heap against.
	memoryLimitBytes = 8 * gibibyte

	// heapWarningPercent and gcPauseWarningMilliseconds are where the service starts to warn about its
	// memory: half the host's memory in use, and a pause long enough for a request to notice.
	heapWarningPercent         = 50
	gcPauseWarningMilliseconds = 10

	// busyActivity is how busy the hour has to be for a routine entry to be a slow request.
	busyActivity = 0.7

	// latencyCheckInterval is how often the service compares its p95 with the objective.
	latencyCheckInterval = 30 * time.Minute
)

// logRecord is one line of the log, in the shape a JSON logger writes it: when, how severe, what,
// and the request it was about when it was about one.
type logRecord struct {
	Timestamp            string `json:"timestamp"`
	Level                string `json:"level"`
	Message              string `json:"message"`
	Service              string `json:"service"`
	Route                string `json:"route,omitempty"`
	Status               int    `json:"status,omitempty"`
	DurationMilliseconds int    `json:"duration_ms,omitempty"`
	TraceID              string `json:"trace_id,omitempty"`
}

type logEntry struct {
	at     time.Time
	record logRecord
}

// request is what an entry about one request says of it.
type request struct {
	route                string
	status               int
	durationMilliseconds int
}

func entryAt(at time.Time, level string, message string) logEntry {
	return logEntry{at: at, record: logRecord{Level: level, Message: message, Service: serviceName}}
}

func (entry logEntry) about(served request, noise *rand.Rand) logEntry {
	entry.record.Route = served.route
	entry.record.Status = served.status
	entry.record.DurationMilliseconds = served.durationMilliseconds
	entry.record.TraceID = fmt.Sprintf("%016x", noise.Uint64())

	return entry
}

// logOf is the log the service wrote over the recording, one JSON object per line, oldest first.
//
// A record is strings and integers, which JSON always encodes, written into a buffer that grows
// rather than fails, so the error each encoding hands back is nil for every entry and is not passed
// on.
func logOf(readings recording) []byte {
	//nolint:gosec // G404: the sample's log is meant to be reproducible, not unpredictable.
	noise := rand.New(rand.NewPCG(logSeed, noiseStream))

	entries := slices.Concat(
		routineEntries(noise),
		burstEntries(noise),
		deploymentEntries(),
		leakEntries(readings, noise),
		latencyEntries(readings),
	)

	slices.SortStableFunc(entries, func(first logEntry, second logEntry) int { return first.at.Compare(second.at) })

	var lines bytes.Buffer

	encoder := json.NewEncoder(&lines)
	encoder.SetEscapeHTML(false)

	for _, entry := range entries {
		entry.record.Timestamp = entry.at.UTC().Format(timestampLayout)
		_ = encoder.Encode(entry.record)
	}

	return lines.Bytes()
}

// routineEntries are what the service says on an ordinary day, every twenty to fifty minutes, except
// while it is down and during the burst, whose entries say what happened instead.
func routineEntries(noise *rand.Rand) []logEntry {
	var entries []logEntry

	for at := recordingStart().Add(minutesBetween(noise, 5, 30)); at.Before(recordingEnd); at = at.Add(minutesBetween(noise, 20, 50)) {
		if isDown(at) || trafficBurst.holds(at) {
			continue
		}

		entries = append(entries, routineEntry(at, noise))
	}

	return entries
}

func routineEntry(at time.Time, noise *rand.Rand) logEntry {
	draw := noise.Float64()

	switch {
	case draw < 0.3:
		return entryAt(at, levelInfo, "health check passed").about(request{route: healthRoute, status: http.StatusOK, durationMilliseconds: 2 + noise.IntN(5)}, noise)
	case draw < 0.5:
		inUse := 6 + int(math.Round(30*dailyActivity(at)*weekShare(at))) + noise.IntN(4)

		return entryAt(at, levelDebug, "connection pool: "+strconv.Itoa(inUse)+" of "+strconv.Itoa(connectionPoolSize)+" connections in use")
	case draw < 0.65:
		return entryAt(at, levelInfo, "scheduled job finished: "+scheduledJobs[noise.IntN(len(scheduledJobs))])
	case draw < 0.8:
		return entryAt(at, levelInfo, "catalog cache refreshed: "+strconv.Itoa(12_000+noise.IntN(900))+" entries")
	case draw < 0.92 && dailyActivity(at) > busyActivity:
		duration := 900 + noise.IntN(900)

		return entryAt(at, levelWarn, "slow request: "+ordersRoute+" took "+secondsText(duration)).about(request{route: ordersRoute, status: http.StatusOK, durationMilliseconds: duration}, noise)
	case draw < 0.92:
		return entryAt(at, levelDebug, "metrics flushed: "+strconv.Itoa(200+noise.IntN(30))+" series")
	case draw < 0.94:
		return entryAt(at, levelError, "payment provider answered 502, retrying").about(request{route: paymentsRoute, status: http.StatusBadGateway, durationMilliseconds: 300 + noise.IntN(400)}, noise)
	}

	return entryAt(at, levelInfo, "user session expired")
}

var scheduledJobs = []string{"invoice-reminders", "cache-warmup", "session-cleanup"}

// burstEntries tell the burst: a partner importing its orders in bulk, slow requests while it lasts,
// and the inventory service, called for every order, falling behind.
func burstEntries(noise *rand.Rand) []logEntry {
	start := trafficBurst.from
	entries := []logEntry{
		entryAt(start.Add(72*time.Second), levelInfo, "bulk import started by client partner-sync").about(request{route: batchRoute, status: http.StatusAccepted, durationMilliseconds: 41}, noise),
		entryAt(start.Add(4*time.Minute+40*time.Second), levelWarn, "rate limiter: client partner-sync is over its quota of 300 requests per second"),
		entryAt(trafficBurst.until.Add(65*time.Second), levelInfo, "bulk import by partner-sync finished: 1.92 million orders"),
	}

	for _, minutesIn := range []int{52, 78, 107} {
		entries = append(entries, entryAt(start.Add(time.Duration(minutesIn)*time.Minute), levelError, "inventory-service did not answer within 2 s").
			about(request{route: inventoryRoute, status: http.StatusGatewayTimeout, durationMilliseconds: inventoryDeadlineMilliseconds}, noise))
	}

	for at := start.Add(9 * time.Minute); at.Before(trafficBurst.until); at = at.Add(minutesBetween(noise, 7, 12)) {
		duration := 1800 + noise.IntN(1400)

		entries = append(entries, entryAt(at, levelWarn, "slow request: "+batchRoute+" took "+secondsText(duration)).
			about(request{route: batchRoute, status: http.StatusOK, durationMilliseconds: duration}, noise))
	}

	return entries
}

// deploymentEntries are the service stopping on the old version and starting on the new one.
func deploymentEntries() []logEntry {
	return slices.Concat(
		[]logEntry{
			entryAt(deployment.Add(-9*time.Second), levelInfo, "received SIGTERM, draining connections"),
			entryAt(deployment.Add(-2*time.Second), levelInfo, "shutdown complete: version "+previousVersion),
		},
		startupEntries(deployment.Add(4*time.Second)),
	)
}

func startupEntries(at time.Time) []logEntry {
	return []logEntry{
		entryAt(at, levelInfo, "service started: version "+currentVersion),
		entryAt(at.Add(time.Second), levelInfo, "listening on :8080"),
		entryAt(at.Add(2*time.Second), levelInfo, "connected to database orders-db"),
	}
}

// leakEntries tell the leak: a monthly report that loads every order of the month into memory, the
// heap warnings that follow it through the night, the pauses and timeouts as memory runs out, the
// kill, and the start that comes after it.
func leakEntries(readings recording, noise *rand.Rand) []logEntry {
	start := memoryLeak.from
	entries := slices.Concat(
		[]logEntry{
			entryAt(start.Add(3*time.Second), levelInfo, "scheduled job started: monthly-report"),
			entryAt(start.Add(4*time.Second), levelDebug, "monthly-report: loading 4.2 million orders into memory"),
			entryAt(outage.from.Add(2*time.Second), levelFatal, "process killed by the kernel: out of memory"),
		},
		startupEntries(outage.until.Add(6*time.Second)),
		[]logEntry{entryAt(outage.until.Add(90*time.Second), levelWarn, "monthly-report did not finish its last run; it runs again tonight")},
	)

	for at := start.Add(40 * time.Minute); at.Before(outage.from); at = at.Add(minutesBetween(noise, 35, 50)) {
		if heapShare := math.Round(100 * readings.at(memoryUsedFile, at) / memoryLimitBytes); heapShare >= heapWarningPercent {
			entries = append(entries, entryAt(at, levelWarn, "heap at "+strconv.Itoa(int(heapShare))+"% of the memory limit"))
		}
	}

	for at := start.Add(3 * time.Hour); at.Before(outage.from); at = at.Add(minutesBetween(noise, 25, 40)) {
		if pause := math.Round(readings.at(gcPauseFile, at)); pause >= gcPauseWarningMilliseconds {
			entries = append(entries, entryAt(at, levelWarn, "garbage collection paused the process for "+strconv.Itoa(int(pause))+" ms"))
		}
	}

	for at := start.Add(5 * time.Hour); at.Before(outage.from); at = at.Add(minutesBetween(noise, 12, 20)) {
		if leakShare(at) > 0.7 {
			entries = append(entries, entryAt(at, levelError, "request timed out after 5 s").
				about(request{route: ordersRoute, status: http.StatusGatewayTimeout, durationMilliseconds: requestTimeoutMilliseconds}, noise))
		}
	}

	return entries
}

// latencyEntries are the service's own check of its p95 against the objective, which it logs only
// when the objective is missed: under the burst, as the leak runs out of memory, and as the slow
// drift crosses it on the last afternoons.
func latencyEntries(readings recording) []logEntry {
	var entries []logEntry

	for at := recordingStart().Truncate(latencyCheckInterval).Add(latencyCheckInterval); at.Before(recordingEnd); at = at.Add(latencyCheckInterval) {
		latency := math.Round(readings.at(latencyFile, at))
		if math.IsNaN(latency) || latency <= latencyObjectiveMilliseconds {
			continue
		}

		entries = append(entries, entryAt(at, levelWarn, "p95 latency "+strconv.Itoa(int(math.Round(latency)))+" ms is above the "+
			strconv.Itoa(latencyObjectiveMilliseconds)+" ms objective"))
	}

	return entries
}

// minutesBetween is a whole number of minutes from shortest up to longest, with the seconds drawn
// too, so no two entries land on the same round minute.
func minutesBetween(noise *rand.Rand, shortest int, longest int) time.Duration {
	return time.Duration(shortest+noise.IntN(longest-shortest+1))*time.Minute + time.Duration(noise.IntN(60))*time.Second
}

func secondsText(milliseconds int) string {
	return strconv.FormatFloat(float64(milliseconds)/1000, 'f', 1, 64) + " s"
}
