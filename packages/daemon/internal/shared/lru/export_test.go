package lru

// WaitersOf says how many callers wait on the load under way for the key, so a test can tell that a
// caller has joined a load before it acts on it.
func (cache *Cache[TValue]) WaitersOf(key string) int {
	cache.mutex.Lock()
	defer cache.mutex.Unlock()

	if pending, isLoading := cache.loading[key]; isLoading {
		return pending.waiters
	}

	return 0
}
