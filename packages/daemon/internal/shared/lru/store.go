// Package lru holds a bounded number of values and forgets the ones least recently used.
package lru

import (
	"slices"
	"sync"
)

const smallestCapacity = 1

// Store keeps values under string keys, at most capacity of them, dropping the least recently used
// to make room. Reading a value counts as using it, so what a caller keeps asking for is what the
// store keeps. It is safe for concurrent use; a caller that needs more than one operation to happen
// together holds a lock of its own around them.
type Store[TValue any] struct {
	mutex    sync.Mutex
	values   map[string]TValue
	recency  []string
	capacity int
}

func NewStore[TValue any](capacity int) *Store[TValue] {
	bounded := max(smallestCapacity, capacity)

	return &Store[TValue]{values: make(map[string]TValue, bounded), capacity: bounded}
}

// Value answers what is held under the key, and counts it as the most recently used.
func (store *Store[TValue]) Value(key string) (TValue, bool) {
	store.mutex.Lock()
	defer store.mutex.Unlock()

	value, held := store.values[key]
	if !held {
		var missing TValue

		return missing, false
	}

	store.markUsed(key)

	return value, true
}

// Remember holds the value under the key as the most recently used, dropping the least recent while
// the store is over its capacity.
func (store *Store[TValue]) Remember(key string, value TValue) {
	store.mutex.Lock()
	defer store.mutex.Unlock()

	store.values[key] = value
	store.markUsed(key)

	for len(store.recency) > store.capacity {
		delete(store.values, store.recency[0])
		store.recency = store.recency[1:]
	}
}

func (store *Store[TValue]) Forget(key string) {
	store.mutex.Lock()
	defer store.mutex.Unlock()

	delete(store.values, key)
	store.recency = slices.DeleteFunc(store.recency, func(held string) bool { return held == key })
}

// markUsed moves a key to the most recent end. The caller holds the mutex.
func (store *Store[TValue]) markUsed(key string) {
	store.recency = slices.DeleteFunc(store.recency, func(held string) bool { return held == key })
	store.recency = append(store.recency, key)
}
