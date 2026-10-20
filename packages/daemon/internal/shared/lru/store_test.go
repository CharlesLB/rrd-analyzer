package lru_test

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/lru"
)

func valueOf(t *testing.T, store *lru.Store[int], key string) (int, bool) {
	t.Helper()

	return store.Value(key)
}

func TestStoreValue_KeyNeverRemembered_AnswersNothing(t *testing.T) {
	store := lru.NewStore[int](2)

	if _, held := valueOf(t, store, "a"); held {
		t.Fatal("an empty store answered as if it held a value")
	}
}

func TestStoreRemember_PastCapacity_DropsTheLeastRecentlyUsed(t *testing.T) {
	store := lru.NewStore[int](2)

	store.Remember("a", 1)
	store.Remember("b", 2)
	store.Remember("c", 3)

	if _, held := valueOf(t, store, "a"); held {
		t.Fatal("the least recently used value was kept")
	}

	if value, held := valueOf(t, store, "c"); !held || value != 3 {
		t.Fatalf("the newest value was lost: %v, held %v", value, held)
	}
}

func TestStoreValue_ReadingAValue_KeepsItFromBeingDropped(t *testing.T) {
	store := lru.NewStore[int](2)

	store.Remember("a", 1)
	store.Remember("b", 2)
	valueOf(t, store, "a")
	store.Remember("c", 3)

	if _, held := valueOf(t, store, "a"); !held {
		t.Fatal("a value read a moment ago was dropped")
	}

	if _, held := valueOf(t, store, "b"); held {
		t.Fatal("the value untouched for longest was kept")
	}
}

func TestStoreRemember_SameKeyTwice_HoldsTheNewValueOnce(t *testing.T) {
	store := lru.NewStore[int](2)

	store.Remember("a", 1)
	store.Remember("a", 2)
	store.Remember("b", 3)

	if value, held := valueOf(t, store, "a"); !held || value != 2 {
		t.Fatalf("rewriting a key lost the newer value: %v, held %v", value, held)
	}

	if _, held := valueOf(t, store, "b"); !held {
		t.Fatal("rewriting a key counted against the capacity twice")
	}
}

func TestStoreForget_AKeyItHolds_AnswersNothingForIt(t *testing.T) {
	store := lru.NewStore[int](2)

	store.Remember("a", 1)
	store.Forget("a")

	if _, held := valueOf(t, store, "a"); held {
		t.Fatal("a forgotten value was still answered")
	}
}

func TestNewStore_CapacityBelowOne_StillHoldsTheLatest(t *testing.T) {
	store := lru.NewStore[int](0)

	store.Remember("a", 1)

	if _, held := valueOf(t, store, "a"); !held {
		t.Fatal("a store of no capacity dropped the value it was just given")
	}
}
