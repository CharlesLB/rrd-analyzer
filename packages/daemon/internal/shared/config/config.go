// Package config resolves where the application keeps its data on disk.
package config

import (
	"fmt"
	"os"
	"path/filepath"
)

const (
	dataDirectoryName          = ".rrd-analyzer"
	configurationDirectoryName = "rrd-analyzer"
	storeFileName              = "analyses.db"
	legacyStoreName            = "analyses.json"
	directoryMode              = 0o700
)

type Paths struct {
	DataDirectory string
	StoreFile     string

	// ConfigurationDirectory is where the insights rules and classifier can be overridden. It sits
	// under the platform's configuration root rather than beside the library because it holds
	// files a person edits by hand, and that root is where people look for them.
	ConfigurationDirectory string

	// LegacyStoreFile is where the library lived before it was a database. It is read once, so
	// that upgrading does not look to the person using the application like losing their work.
	LegacyStoreFile string
}

func Resolve() (Paths, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return Paths{}, fmt.Errorf("resolve home directory: %w", err)
	}

	configurationRoot, err := os.UserConfigDir()
	if err != nil {
		return Paths{}, fmt.Errorf("resolve configuration directory: %w", err)
	}

	dataDirectory := filepath.Join(home, dataDirectoryName)
	if err := os.MkdirAll(dataDirectory, directoryMode); err != nil {
		return Paths{}, fmt.Errorf("create data directory %q: %w", dataDirectory, err)
	}

	return Paths{
		DataDirectory:          dataDirectory,
		StoreFile:              filepath.Join(dataDirectory, storeFileName),
		ConfigurationDirectory: filepath.Join(configurationRoot, configurationDirectoryName),
		LegacyStoreFile:        filepath.Join(dataDirectory, legacyStoreName),
	}, nil
}
