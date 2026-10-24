package infrastructure

import (
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase"
)

// NewConfigurationLoaderAssembledBy is NewConfigurationLoader laying the files over the defaults with
// assemble instead of the use case, so a test can make the assembly fail.
func NewConfigurationLoaderAssembledBy(userConfigDirectory string, assemble func(files usecase.UserFiles) (domain.Configuration, error)) *ConfigurationLoader {
	loader := NewConfigurationLoader(userConfigDirectory)
	loader.assemble = assemble

	return loader
}
