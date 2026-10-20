package lru_test

import (
	"context"
	"errors"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/lru"
)

var errUnreadable = errors.New("unreadable")

func waitForWaiters(cache *lru.Cache[string], key string, waiters int) {
	for cache.WaitersOf(key) < waiters {
		runtime.Gosched()
	}
}

func valueNamed(name string) func(context.Context) (string, error) {
	return func(context.Context) (string, error) {
		return name, nil
	}
}

func TestCacheLoad_CallersArrivingDuringALoad_ShareItInsteadOfLoadingAgain(t *testing.T) {
	cache := lru.NewCache[string](8)
	release := make(chan struct{})
	started := make(chan struct{})
	loads := atomic.Int32{}
	ran := atomic.Int32{}

	slowLoad := func(context.Context) (string, error) {
		loads.Add(1)
		close(started)
		<-release

		return "Capacity", nil
	}

	var waiting sync.WaitGroup

	names := make([]string, 4)
	for index := range names {
		waiting.Go(func() {
			if index > 0 {
				<-started
			}

			name, loaded, err := cache.Load(context.Background(), "a1", slowLoad)
			if err != nil {
				t.Errorf("load %d: %v", index, err)
			}

			if loaded {
				ran.Add(1)
			}

			names[index] = name
		})
	}

	<-started
	close(release)
	waiting.Wait()

	if loads.Load() != 1 || ran.Load() != 1 {
		t.Fatalf("loaded %d times, %d callers say they ran it; want once and one", loads.Load(), ran.Load())
	}

	for index, name := range names {
		if name != "Capacity" {
			t.Errorf("caller %d got %q, want the shared value", index, name)
		}
	}
}

func TestCacheLoad_AFailedLoad_IsNotRemembered(t *testing.T) {
	cache := lru.NewCache[string](8)

	_, _, err := cache.Load(context.Background(), "a1", func(context.Context) (string, error) { return "", errUnreadable })
	if !errors.Is(err, errUnreadable) {
		t.Fatalf("err = %v, want %v", err, errUnreadable)
	}

	name, loaded, err := cache.Load(context.Background(), "a1", valueNamed("Capacity"))
	if err != nil || name != "Capacity" || !loaded {
		t.Fatalf("second load = %q (ran %v), %v; want a fresh load", name, loaded, err)
	}
}

func TestCacheLoad_PastItsCapacity_ForgetsTheLeastRecentlyUsed(t *testing.T) {
	cache := lru.NewCache[string](2)
	for _, key := range []string{"a1", "a2"} {
		_, _, _ = cache.Load(context.Background(), key, valueNamed(key))
	}

	_, _, _ = cache.Load(context.Background(), "a1", valueNamed("reloaded"))
	_, _, _ = cache.Load(context.Background(), "a3", valueNamed("a3"))

	if name, loaded, _ := cache.Load(context.Background(), "a1", valueNamed("reloaded")); name != "a1" || loaded {
		t.Errorf("a1 = %q (ran %v), want the value loaded first, served from memory", name, loaded)
	}

	if _, loaded, _ := cache.Load(context.Background(), "a2", valueNamed("a2")); !loaded {
		t.Errorf("a2 was used least recently and should have been forgotten")
	}
}

func TestCacheLoad_ACallerWhoseContextEnds_StopsWaiting(t *testing.T) {
	cache := lru.NewCache[string](8)
	release := make(chan struct{})
	started := make(chan struct{})

	go func() {
		_, _, _ = cache.Load(context.Background(), "a1", func(context.Context) (string, error) {
			close(started)
			<-release

			return "", nil
		})
	}()

	<-started
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	_, _, err := cache.Load(cancelled, "a1", valueNamed("never"))
	close(release)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want %v", err, context.Canceled)
	}
}

func TestCacheLoad_TheCallerWhoStartedItCancelling_StillServesTheOthersWaiting(t *testing.T) {
	cache := lru.NewCache[string](8)
	release := make(chan struct{})
	started := make(chan struct{})
	starter, cancelStarter := context.WithCancel(context.Background())

	var waiting sync.WaitGroup

	waiting.Go(func() {
		_, _, _ = cache.Load(starter, "a1", func(loadContext context.Context) (string, error) {
			close(started)
			<-release

			if loadContext.Err() != nil {
				return "", loadContext.Err()
			}

			return "Capacity", nil
		})
	})

	<-started

	var name string

	var err error

	waiting.Go(func() {
		name, _, err = cache.Load(context.Background(), "a1", valueNamed("never"))
	})

	waitForWaiters(cache, "a1", 2)
	cancelStarter()
	close(release)
	waiting.Wait()

	if err != nil || name != "Capacity" {
		t.Fatalf("second caller got %q, %v; want the shared load's value", name, err)
	}
}

func TestCacheForget_WhileTheKeyLoads_KeepsTheLoadOutOfTheCache(t *testing.T) {
	cache := lru.NewCache[string](8)
	release := make(chan struct{})
	started := make(chan struct{})

	var waiting sync.WaitGroup

	waiting.Go(func() {
		_, _, _ = cache.Load(context.Background(), "a1", func(context.Context) (string, error) {
			close(started)
			<-release

			return "deleted meanwhile", nil
		})
	})

	<-started
	cache.Forget("a1")

	fresh, _, err := cache.Load(context.Background(), "a1", valueNamed("read after forgetting"))
	if err != nil || fresh != "read after forgetting" {
		t.Fatalf("while the forgotten load runs, load = %q, %v; want a load of its own", fresh, err)
	}

	cache.Forget("a1")
	close(release)
	waiting.Wait()

	name, _, err := cache.Load(context.Background(), "a1", valueNamed("read again"))
	if err != nil || name != "read again" {
		t.Fatalf("after forgetting, load = %q, %v; want the key loaded again", name, err)
	}
}

func TestCacheLoad_EveryCallerLeaving_CancelsTheLoad(t *testing.T) {
	cache := lru.NewCache[string](8)
	cancelled := make(chan struct{})
	first, cancelFirst := context.WithCancel(context.Background())
	second, cancelSecond := context.WithCancel(context.Background())

	blockedLoad := func(loadContext context.Context) (string, error) {
		<-loadContext.Done()
		close(cancelled)

		return "", loadContext.Err()
	}

	var waiting sync.WaitGroup

	errs := make([]error, 2)
	waiting.Go(func() { _, _, errs[0] = cache.Load(first, "a1", blockedLoad) })
	waitForWaiters(cache, "a1", 1)
	waiting.Go(func() { _, _, errs[1] = cache.Load(second, "a1", blockedLoad) })
	waitForWaiters(cache, "a1", 2)

	cancelFirst()
	cancelSecond()
	waiting.Wait()
	<-cancelled

	for index, err := range errs {
		if !errors.Is(err, context.Canceled) {
			t.Errorf("caller %d err = %v, want %v", index, err, context.Canceled)
		}
	}
}

func TestCacheLoad_AfterALoadEveryoneLeft_StartsAfreshInsteadOfJoiningIt(t *testing.T) {
	cache := lru.NewCache[string](8)
	abandoned, abandon := context.WithCancel(context.Background())
	release := make(chan struct{})

	var waiting sync.WaitGroup

	waiting.Go(func() {
		_, _, _ = cache.Load(abandoned, "a1", func(context.Context) (string, error) {
			<-release

			return "abandoned", nil
		})
	})
	waitForWaiters(cache, "a1", 1)
	abandon()
	waiting.Wait()

	name, loaded, err := cache.Load(context.Background(), "a1", valueNamed("fresh"))
	close(release)

	if err != nil || name != "fresh" || !loaded {
		t.Fatalf("load after abandoning = %q (ran %v), %v; want a fresh load", name, loaded, err)
	}
}

func TestCacheAmend_AValueHeld_IsReplacedWithoutLoadingAgain(t *testing.T) {
	cache := lru.NewCache[string](2)
	_, _, _ = cache.Load(context.Background(), "k", valueNamed("held"))

	amended := cache.Amend("k", func(held string) (string, bool) { return held + "+more", true })

	got, started, err := cache.Load(context.Background(), "k", valueNamed("loaded again"))
	if !amended || got != "held+more" || started || err != nil {
		t.Errorf("amended = %t, then load = %q (started %t, err %v); want the amended value served from the cache", amended, got, started, err)
	}
}

func TestCacheAmend_DecliningWhatIsHeldOrHoldingNothing_ForgetsTheKey(t *testing.T) {
	tests := []struct {
		name     string
		giveHeld bool
	}{
		{name: "a value amend declines", giveHeld: true},
		{name: "nothing held"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cache := lru.NewCache[string](2)
			if tt.giveHeld {
				_, _, _ = cache.Load(context.Background(), "k", valueNamed("held"))
			}

			amended := cache.Amend("k", func(string) (string, bool) { return "never kept", false })

			got, started, _ := cache.Load(context.Background(), "k", valueNamed("loaded again"))
			if amended || got != "loaded again" || !started {
				t.Errorf("amended = %t, then load = %q (started %t); want the key forgotten and loaded afresh", amended, got, started)
			}
		})
	}
}

func TestCacheAmend_WhileTheKeyLoads_KeepsThatLoadOutOfTheCache(t *testing.T) {
	cache := lru.NewCache[string](2)
	release := make(chan struct{})
	finished := make(chan struct{})

	go func() {
		defer close(finished)

		_, _, _ = cache.Load(context.Background(), "k", func(context.Context) (string, error) {
			<-release

			return "read before the change", nil
		})
	}()

	waitForWaiters(cache, "k", 1)

	if cache.Amend("k", func(held string) (string, bool) { return held, true }) {
		t.Fatal("amend reported a value held while the key was still loading")
	}

	close(release)
	<-finished

	if got, started, _ := cache.Load(context.Background(), "k", valueNamed("read after the change")); got != "read after the change" || !started {
		t.Errorf("load = %q (started %t), want a load begun before the change kept out of the cache", got, started)
	}
}
