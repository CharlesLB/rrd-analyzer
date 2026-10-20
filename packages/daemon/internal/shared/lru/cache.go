package lru

import (
	"context"
	"sync"
)

// Cache is a Store that also loads what it does not hold, once however many callers ask at the same
// time: a caller asking for a key still loading waits for that load instead of starting another.
type Cache[TValue any] struct {
	mutex   sync.Mutex
	values  *Store[TValue]
	loading map[string]*pendingLoad[TValue]
}

type pendingLoad[TValue any] struct {
	done  chan struct{}
	value TValue
	err   error

	// waiters counts the callers still waiting on the load, the one that started it included. When
	// the last of them leaves, nobody wants the answer any more and the load is cancelled.
	waiters int
	cancel  context.CancelFunc

	// isForgotten marks a load whose key was forgotten while it ran: its callers still get what
	// they asked for, but the cache must not keep serving it afterwards.
	isForgotten bool
}

func NewCache[TValue any](capacity int) *Cache[TValue] {
	return &Cache[TValue]{values: NewStore[TValue](capacity), loading: map[string]*pendingLoad[TValue]{}}
}

// Load returns the value held under the key, or waits for a load already under way, or starts load
// itself and shares its outcome with everyone who asked in the meantime. It says whether this caller
// started the load. The shared load does not end with the context of the caller that happened to
// start it, since the others waiting on it may still want it; it is cancelled only once every caller
// waiting on it has left. A failed load is not remembered.
func (cache *Cache[TValue]) Load(callerContext context.Context, key string, load func(context.Context) (TValue, error)) (TValue, bool, error) {
	cache.mutex.Lock()

	if value, held := cache.values.Value(key); held {
		cache.mutex.Unlock()

		return value, false, nil
	}

	pending, isJoining := cache.loading[key]
	if !isJoining {
		pending = cache.start(callerContext, key, load)
	}

	pending.waiters++
	cache.mutex.Unlock()

	select {
	case <-pending.done:
		return pending.value, !isJoining, pending.err
	case <-callerContext.Done():
		cache.leave(key, pending)

		var abandoned TValue

		return abandoned, false, callerContext.Err()
	}
}

// start runs a load of its own goroutine, which ends when the load returns. The caller holds the
// mutex.
func (cache *Cache[TValue]) start(callerContext context.Context, key string, load func(context.Context) (TValue, error)) *pendingLoad[TValue] {
	loadContext, cancel := context.WithCancel(context.WithoutCancel(callerContext))
	pending := &pendingLoad[TValue]{done: make(chan struct{}), cancel: cancel}
	cache.loading[key] = pending

	go func() {
		value, err := load(loadContext)

		cache.mutex.Lock()
		pending.value, pending.err = value, err
		if cache.loading[key] == pending {
			delete(cache.loading, key)
		}

		if err == nil && !pending.isForgotten {
			cache.values.Remember(key, value)
		}
		cache.mutex.Unlock()
		cancel()
		close(pending.done)
	}()

	return pending
}

// leave lets go of a load a caller stopped waiting for. The last one out cancels it, and takes it off
// the loads under way so that whoever asks next starts afresh instead of joining a load that is
// stopping.
func (cache *Cache[TValue]) leave(key string, pending *pendingLoad[TValue]) {
	cache.mutex.Lock()
	defer cache.mutex.Unlock()

	pending.waiters--
	if pending.waiters > 0 {
		return
	}

	pending.isForgotten = true
	if cache.loading[key] == pending {
		delete(cache.loading, key)
	}

	pending.cancel()
}

// Forget drops the value held under the key, and keeps a load of it under way out of the cache. That
// load still answers the callers already waiting on it, but whoever asks next starts afresh: what
// they would join was read before the key was forgotten.
func (cache *Cache[TValue]) Forget(key string) {
	cache.mutex.Lock()
	defer cache.mutex.Unlock()

	cache.forget(key)
}

// Amend replaces the value held under the key with what amend makes of it, and says whether it did.
// It is for a change the caller can apply to what is held more cheaply than loading it again. When
// nothing is held, or amend declines what is, the key is forgotten exactly as Forget forgets it, so
// in every case the next Load answers with the change in it. amend runs with the cache locked: it
// must not call back into the cache.
func (cache *Cache[TValue]) Amend(key string, amend func(held TValue) (TValue, bool)) bool {
	cache.mutex.Lock()
	defer cache.mutex.Unlock()

	if held, isHeld := cache.values.Value(key); isHeld {
		if amended, isAmended := amend(held); isAmended {
			cache.values.Remember(key, amended)

			return true
		}
	}

	cache.forget(key)

	return false
}

// forget is Forget for a caller that holds the mutex.
func (cache *Cache[TValue]) forget(key string) {
	cache.values.Forget(key)

	if pending, isLoading := cache.loading[key]; isLoading {
		pending.isForgotten = true
		delete(cache.loading, key)
	}
}
