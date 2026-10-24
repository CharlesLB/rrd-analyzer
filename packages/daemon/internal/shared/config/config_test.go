//go:build linux

// The tests steer Resolve through the variables Linux reads the home and the configuration root
// from; other systems take them from elsewhere.
package config_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/config"
)

const (
	homeVariable              = "HOME"
	configurationHomeVariable = "XDG_CONFIG_HOME"
	privateDirectoryMode      = 0o700
	ownerOnlyFileMode         = 0o600
)

func TestResolvePlacesTheLibraryUnderTheHomeAndCreatesItsDirectory(t *testing.T) {
	home := t.TempDir()
	configurationRoot := t.TempDir()
	t.Setenv(homeVariable, home)
	t.Setenv(configurationHomeVariable, configurationRoot)

	paths, err := config.Resolve()
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	dataDirectory := filepath.Join(home, ".rrd-analyzer")
	want := config.Paths{
		DataDirectory:          dataDirectory,
		StoreFile:              filepath.Join(dataDirectory, "analyses.db"),
		ConfigurationDirectory: filepath.Join(configurationRoot, "rrd-analyzer"),
		LegacyStoreFile:        filepath.Join(dataDirectory, "analyses.json"),
	}
	if paths != want {
		t.Errorf("paths = %+v, want %+v", paths, want)
	}

	information, err := os.Stat(dataDirectory)
	if err != nil {
		t.Fatalf("stat the data directory: %v", err)
	}

	if !information.IsDir() || information.Mode().Perm() != privateDirectoryMode {
		t.Errorf("data directory mode = %v, want a directory only its owner reaches", information.Mode())
	}
}

func TestResolveWithoutAHomeIsRefused(t *testing.T) {
	t.Setenv(homeVariable, "")

	_, err := config.Resolve()

	if err == nil || !strings.Contains(err.Error(), "resolve home directory") {
		t.Fatalf("err = %v, want the missing home reported", err)
	}
}

func TestResolveWithARelativeConfigurationRootIsRefused(t *testing.T) {
	t.Setenv(homeVariable, t.TempDir())
	t.Setenv(configurationHomeVariable, "relative/configuration")

	_, err := config.Resolve()

	if err == nil || !strings.Contains(err.Error(), "resolve configuration directory") {
		t.Fatalf("err = %v, want the relative configuration root reported", err)
	}
}

func TestResolveWithAHomeThatIsAFileIsRefused(t *testing.T) {
	home := filepath.Join(t.TempDir(), "home")
	if err := os.WriteFile(home, nil, ownerOnlyFileMode); err != nil {
		t.Fatalf("write the file standing in for the home: %v", err)
	}

	t.Setenv(homeVariable, home)
	t.Setenv(configurationHomeVariable, t.TempDir())

	_, err := config.Resolve()

	if err == nil || !strings.Contains(err.Error(), "create data directory") {
		t.Fatalf("err = %v, want the data directory reported as impossible to create", err)
	}
}
