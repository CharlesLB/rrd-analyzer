// Package strict decodes one TOML table into a struct and reports the keys the struct did not
// know. The configuration files hold many rules, and an unknown key has to be pinned on the rule
// that carries it, which the whole-document metadata cannot do: its keys carry no array index.
package strict

import (
	"bytes"
	"fmt"
	"slices"

	"github.com/BurntSushi/toml"
)

// Decode re-encodes the table as a document of its own, decodes that into target and returns the
// dotted keys target has no field for, sorted.
func Decode(table map[string]any, target any) ([]string, error) {
	var buffer bytes.Buffer
	if err := toml.NewEncoder(&buffer).Encode(table); err != nil {
		return nil, fmt.Errorf("re-encode table: %w", err)
	}

	metadata, err := toml.Decode(buffer.String(), target)
	if err != nil {
		return nil, fmt.Errorf("decode table: %w", err)
	}

	undecoded := metadata.Undecoded()
	keys := make([]string, 0, len(undecoded))

	for _, key := range undecoded {
		keys = append(keys, key.String())
	}

	slices.Sort(keys)

	return keys, nil
}

// Tables decodes a configuration document whose only top-level key is an array of tables, and
// reports any other top-level key.
func Tables(content []byte, arrayKey string) ([]map[string]any, []string, error) {
	var document map[string]any

	metadata, err := toml.Decode(string(content), &document)
	if err != nil {
		return nil, nil, fmt.Errorf("parse document: %w", err)
	}

	var unknown []string

	for _, key := range metadata.Keys() {
		if len(key) == 1 && key[0] != arrayKey {
			unknown = append(unknown, key.String())
		}
	}

	raw, present := document[arrayKey]
	if !present {
		return nil, unknown, nil
	}

	tables, isArrayOfTables := raw.([]map[string]any)
	if !isArrayOfTables {
		return nil, unknown, fmt.Errorf("%q must be an array of tables", arrayKey)
	}

	return tables, unknown, nil
}
