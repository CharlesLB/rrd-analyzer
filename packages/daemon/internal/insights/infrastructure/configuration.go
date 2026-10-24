// Package infrastructure supplies the insights engine's configuration: it reads the user's rules
// and classifier from the configuration directory, again only when they change, and has the use
// case lay them over the defaults.
package infrastructure

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase"
)

const (
	RulesFileName      = "rules.toml"
	ClassifierFileName = "classifier.toml"

	diagnosticPrefix = domain.DiagnosticPrefix + "configuration:"

	DiagnosticUnreadableFile = diagnosticPrefix + "unreadable-file"
)

var unreadableFile = domain.DiagnosticKind{URN: DiagnosticUnreadableFile, Title: "Configuration file is not readable"}

type fileStamp struct {
	exists   bool
	size     int64
	modified time.Time
}

type stamps struct {
	rules      fileStamp
	classifier fileStamp
}

// ConfigurationLoader re-reads the user's files only when their size or modification time moved,
// so a run costs two stat calls while an edit is still picked up by the next run without a restart.
type ConfigurationLoader struct {
	userConfigDirectory string

	// assemble lays the files over the defaults. It is the use case's AssembleConfiguration, held as
	// a field because over the embedded defaults it cannot fail, and a loader built on one that does
	// is how the failure is shown not to be remembered.
	assemble func(files usecase.UserFiles) (domain.Configuration, error)

	mutex         sync.Mutex
	loaded        bool
	loadedStamps  stamps
	configuration domain.Configuration
}

var _ domain.ConfigurationSource = (*ConfigurationLoader)(nil)

func NewConfigurationLoader(userConfigDirectory string) *ConfigurationLoader {
	return &ConfigurationLoader{userConfigDirectory: userConfigDirectory, assemble: usecase.AssembleConfiguration}
}

func (loader *ConfigurationLoader) Load(callerContext context.Context) (domain.Configuration, error) {
	if err := callerContext.Err(); err != nil {
		return domain.Configuration{}, fmt.Errorf("load insights configuration: %w", err)
	}

	current := loader.stat()

	loader.mutex.Lock()
	defer loader.mutex.Unlock()

	if loader.loaded && current == loader.loadedStamps {
		return loader.configuration, nil
	}

	configuration, err := loader.build()
	if err != nil {
		return domain.Configuration{}, err
	}

	loader.configuration = configuration
	loader.loadedStamps = current
	loader.loaded = true

	return configuration, nil
}

func (loader *ConfigurationLoader) build() (domain.Configuration, error) {
	return loader.assemble(usecase.UserFiles{
		Classifier: loader.readUserFile(ClassifierFileName),
		Rules:      loader.readUserFile(RulesFileName),
	})
}

func (loader *ConfigurationLoader) userPath(fileName string) string {
	return filepath.Join(loader.userConfigDirectory, fileName)
}

// readUserFile reads through an fs.FS rooted at the configuration directory, so a file name can
// never walk out of it. A missing file is the ordinary case and is not a problem.
func (loader *ConfigurationLoader) readUserFile(fileName string) usecase.UserFile {
	file := usecase.UserFile{Origin: loader.userPath(fileName)}
	if loader.userConfigDirectory == "" {
		return file
	}

	content, err := fs.ReadFile(os.DirFS(loader.userConfigDirectory), fileName)
	if errors.Is(err, fs.ErrNotExist) {
		return file
	}

	if err != nil {
		unreadable := unreadableFile.Raise(err.Error())
		unreadable.Origin = file.Origin
		file.Unreadable = &unreadable

		return file
	}

	file.Content = content

	return file
}

func (loader *ConfigurationLoader) stat() stamps {
	return stamps{rules: loader.stampOf(RulesFileName), classifier: loader.stampOf(ClassifierFileName)}
}

func (loader *ConfigurationLoader) stampOf(fileName string) fileStamp {
	if loader.userConfigDirectory == "" {
		return fileStamp{}
	}

	info, err := fs.Stat(os.DirFS(loader.userConfigDirectory), fileName)
	if err != nil {
		return fileStamp{}
	}

	return fileStamp{exists: true, size: info.Size(), modified: info.ModTime()}
}
