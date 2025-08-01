import * as vscode from 'vscode';
import { loadDecompYaml, DecompYaml } from './decomp-yaml';
import { checkFileExists } from '../utils/vscode-utils';
import YAML from 'yaml';

/**
 * Configuration interface for local embedding model
 */
export interface LocalEmbeddingConfig {
  enabled: boolean;
  modelName: string;
  modelPath: string;
  lastUpdated: string;
  version: string;
  downloadProgress?: number;
  isInitialized?: boolean;
  lastError?: string;
}

/**
 * Status information for embedding providers
 */
export interface EmbeddingProviderStatus {
  preferred: 'voyage' | 'local';
  voyageAvailable: boolean;
  localAvailable: boolean;
  activeProvider: 'voyage' | 'local' | 'none';
  localConfig?: LocalEmbeddingConfig;
}

/**
 * Configuration manager for embedding providers
 * Reads configuration from decomp.yaml for project-level consistency
 * Falls back to VS Code settings for API keys and personal preferences
 */
export class EmbeddingConfigManager {
  private static readonly CONFIG_SECTION = 'kappa';
  private static readonly VOYAGE_API_KEY = 'voyageApiKey';

  /**
   * Get the user's preferred embedding provider from decomp.yaml
   */
  async getEmbeddingProvider(): Promise<'voyage' | 'local'> {
    const decompYaml = await loadDecompYaml();
    return decompYaml?.tools?.kappa?.embeddingProvider || 'voyage';
  }

  /**
   * Set the user's preferred embedding provider in decomp.yaml
   */
  async setEmbeddingProvider(provider: 'voyage' | 'local'): Promise<void> {
    await this.updateDecompYamlEmbeddingConfig({ embeddingProvider: provider });
  }

  /**
   * Get the Voyage AI API key
   */
  getVoyageApiKey(): string {
    return vscode.workspace
      .getConfiguration(EmbeddingConfigManager.CONFIG_SECTION)
      .get(EmbeddingConfigManager.VOYAGE_API_KEY, '');
  }

  /**
   * Set the Voyage AI API key
   */
  async setVoyageApiKey(apiKey: string): Promise<void> {
    await vscode.workspace
      .getConfiguration(EmbeddingConfigManager.CONFIG_SECTION)
      .update(EmbeddingConfigManager.VOYAGE_API_KEY, apiKey, vscode.ConfigurationTarget.Global);
  }

  /**
   * Get the local embedding model configuration from decomp.yaml
   */
  async getLocalEmbeddingConfig(): Promise<LocalEmbeddingConfig | null> {
    const decompYaml = await loadDecompYaml();
    const localEmbedding = decompYaml?.tools?.kappa?.localEmbedding;
    
    if (!localEmbedding) {
      return null;
    }

    // Convert decomp.yaml format to LocalEmbeddingConfig format
    return {
      enabled: localEmbedding.enabled,
      modelName: localEmbedding.modelName,
      modelPath: '', // This is runtime information, not stored in decomp.yaml
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  /**
   * Set the local embedding model configuration in decomp.yaml
   */
  async setLocalEmbeddingConfig(config: LocalEmbeddingConfig): Promise<void> {
    await this.updateDecompYamlEmbeddingConfig({
      localEmbedding: {
        enabled: config.enabled,
        modelName: config.modelName,
      },
    });
  }

  /**
   * Update specific fields in the local embedding configuration
   */
  async updateLocalEmbeddingConfig(updates: Partial<LocalEmbeddingConfig>): Promise<void> {
    const currentConfig = (await this.getLocalEmbeddingConfig()) || this.getDefaultLocalEmbeddingConfig();
    const updatedConfig = { ...currentConfig, ...updates };
    await this.setLocalEmbeddingConfig(updatedConfig);
  }

  /**
   * Check if local embedding is enabled in configuration
   */
  async isLocalEmbeddingEnabled(): Promise<boolean> {
    const config = await this.getLocalEmbeddingConfig();
    return config?.enabled === true;
  }

  /**
   * Check if local embedding model is initialized
   */
  async isLocalEmbeddingInitialized(): Promise<boolean> {
    const config = await this.getLocalEmbeddingConfig();
    return config?.enabled === true && config?.isInitialized === true;
  }

  /**
   * Check if Voyage AI is available (has API key)
   */
  isVoyageAvailable(): boolean {
    return this.getVoyageApiKey().trim().length > 0;
  }

  /**
   * Get comprehensive status of all embedding providers
   */
  async getEmbeddingProviderStatus(): Promise<EmbeddingProviderStatus> {
    const preferred = await this.getEmbeddingProvider();
    const voyageAvailable = this.isVoyageAvailable();
    const localConfig = await this.getLocalEmbeddingConfig();
    const localAvailable = await this.isLocalEmbeddingEnabled();

    let activeProvider: 'voyage' | 'local' | 'none' = 'none';

    // Determine active provider based on preference and availability
    if (preferred === 'local' && localAvailable) {
      activeProvider = 'local';
    } else if (preferred === 'voyage' && voyageAvailable) {
      activeProvider = 'voyage';
    } else if (localAvailable) {
      // Fallback to local if available
      activeProvider = 'local';
    } else if (voyageAvailable) {
      // Fallback to voyage if available
      activeProvider = 'voyage';
    }

    return {
      preferred,
      voyageAvailable,
      localAvailable,
      activeProvider,
      localConfig: localConfig || undefined,
    };
  }

  /**
   * Reset local embedding configuration to default state
   */
  async resetLocalEmbeddingConfig(): Promise<void> {
    const defaultConfig = this.getDefaultLocalEmbeddingConfig();
    await this.setLocalEmbeddingConfig(defaultConfig);
  }

  /**
   * Clear local embedding configuration completely
   */
  async clearLocalEmbeddingConfig(): Promise<void> {
    await this.updateDecompYamlEmbeddingConfig({
      localEmbedding: {
        enabled: false,
        modelName: 'all-MiniLM-L6-v2',
      },
    });
  }

  /**
   * Mark local embedding model as successfully downloaded and initialized
   */
  async markLocalEmbeddingAsReady(modelPath: string, modelName: string = 'all-MiniLM-L6-v2'): Promise<void> {
    await this.updateLocalEmbeddingConfig({
      enabled: true,
      isInitialized: true,
      modelPath,
      modelName,
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
      downloadProgress: 100,
      lastError: undefined,
    });
  }

  /**
   * Mark local embedding model as failed with error information
   */
  async markLocalEmbeddingAsFailed(error: string): Promise<void> {
    await this.updateLocalEmbeddingConfig({
      enabled: false,
      isInitialized: false,
      lastError: error,
      lastUpdated: new Date().toISOString(),
    });
  }

  /**
   * Update download progress for local embedding model
   */
  async updateLocalEmbeddingDownloadProgress(progress: number): Promise<void> {
    await this.updateLocalEmbeddingConfig({
      downloadProgress: Math.max(0, Math.min(100, progress)),
      lastUpdated: new Date().toISOString(),
    });
  }

  /**
   * Get default local embedding configuration
   */
  private getDefaultLocalEmbeddingConfig(): LocalEmbeddingConfig {
    return {
      enabled: false,
      modelName: 'all-MiniLM-L6-v2',
      modelPath: '',
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
      downloadProgress: 0,
      isInitialized: false,
    };
  }

  /**
   * Validate local embedding configuration
   */
  validateLocalEmbeddingConfig(config: LocalEmbeddingConfig): boolean {
    return (
      typeof config.enabled === 'boolean' &&
      typeof config.modelName === 'string' &&
      typeof config.modelPath === 'string' &&
      typeof config.lastUpdated === 'string' &&
      typeof config.version === 'string'
    );
  }

  /**
   * Get configuration summary for debugging
   */
  async getConfigurationSummary(): Promise<{
    embeddingProvider: string;
    voyageApiKeySet: boolean;
    localEmbeddingEnabled: boolean;
    localEmbeddingInitialized: boolean;
    localModelName?: string;
    lastUpdated?: string;
  }> {
    const localConfig = await this.getLocalEmbeddingConfig();

    return {
      embeddingProvider: await this.getEmbeddingProvider(),
      voyageApiKeySet: this.isVoyageAvailable(),
      localEmbeddingEnabled: await this.isLocalEmbeddingEnabled(),
      localEmbeddingInitialized: await this.isLocalEmbeddingInitialized(),
      localModelName: localConfig?.modelName,
      lastUpdated: localConfig?.lastUpdated,
    };
  }

  /**
   * Update embedding configuration in decomp.yaml
   */
  private async updateDecompYamlEmbeddingConfig(updates: {
    embeddingProvider?: 'voyage' | 'local';
    localEmbedding?: {
      enabled: boolean;
      modelName: string;
    };
  }): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceRoot) {
      throw new Error('No workspace found. Please open a folder.');
    }

    const ymlExtension = vscode.Uri.joinPath(workspaceRoot, 'decomp.yml');
    const yamlExtension = vscode.Uri.joinPath(workspaceRoot, 'decomp.yaml');
    
    let decompYamlPath: vscode.Uri;
    if (await checkFileExists(ymlExtension.fsPath)) {
      decompYamlPath = ymlExtension;
    } else if (await checkFileExists(yamlExtension.fsPath)) {
      decompYamlPath = yamlExtension;
    } else {
      throw new Error('decomp.yaml not found. Please create one first.');
    }

    // Read current configuration
    const bufferContent = await vscode.workspace.fs.readFile(decompYamlPath);
    const rawContent = bufferContent.toString();
    const currentConfig = YAML.parse(rawContent);

    // Update the configuration
    if (!currentConfig.tools) {
      currentConfig.tools = {};
    }
    if (!currentConfig.tools.kappa) {
      currentConfig.tools.kappa = {};
    }

    if (updates.embeddingProvider) {
      currentConfig.tools.kappa.embeddingProvider = updates.embeddingProvider;
    }

    if (updates.localEmbedding) {
      currentConfig.tools.kappa.localEmbedding = updates.localEmbedding;
    }

    // Write back to file
    await vscode.workspace.fs.writeFile(decompYamlPath, Buffer.from(YAML.stringify(currentConfig)));
  }
}

/**
 * Global instance of the embedding configuration manager
 */
export const embeddingConfigManager = new EmbeddingConfigManager();
