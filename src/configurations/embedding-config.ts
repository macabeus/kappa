import * as vscode from 'vscode';

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
 * Handles VS Code settings for both Voyage AI and local embedding models
 */
export class EmbeddingConfigManager {
  private static readonly CONFIG_SECTION = 'kappa';
  private static readonly LOCAL_EMBEDDING_CONFIG_KEY = 'localEmbeddingConfig';
  private static readonly EMBEDDING_PROVIDER_KEY = 'embeddingProvider';
  private static readonly VOYAGE_API_KEY = 'voyageApiKey';

  /**
   * Get the user's preferred embedding provider
   */
  getEmbeddingProvider(): 'voyage' | 'local' {
    return vscode.workspace
      .getConfiguration(EmbeddingConfigManager.CONFIG_SECTION)
      .get(EmbeddingConfigManager.EMBEDDING_PROVIDER_KEY, 'voyage') as 'voyage' | 'local';
  }

  /**
   * Set the user's preferred embedding provider
   */
  async setEmbeddingProvider(provider: 'voyage' | 'local'): Promise<void> {
    await vscode.workspace
      .getConfiguration(EmbeddingConfigManager.CONFIG_SECTION)
      .update(EmbeddingConfigManager.EMBEDDING_PROVIDER_KEY, provider, vscode.ConfigurationTarget.Global);
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
   * Get the local embedding model configuration
   */
  getLocalEmbeddingConfig(): LocalEmbeddingConfig | null {
    const config = vscode.workspace
      .getConfiguration(EmbeddingConfigManager.CONFIG_SECTION)
      .get<LocalEmbeddingConfig>(EmbeddingConfigManager.LOCAL_EMBEDDING_CONFIG_KEY);

    return config || null;
  }

  /**
   * Set the local embedding model configuration
   */
  async setLocalEmbeddingConfig(config: LocalEmbeddingConfig): Promise<void> {
    await vscode.workspace
      .getConfiguration(EmbeddingConfigManager.CONFIG_SECTION)
      .update(EmbeddingConfigManager.LOCAL_EMBEDDING_CONFIG_KEY, config, vscode.ConfigurationTarget.Global);
  }

  /**
   * Update specific fields in the local embedding configuration
   */
  async updateLocalEmbeddingConfig(updates: Partial<LocalEmbeddingConfig>): Promise<void> {
    const currentConfig = this.getLocalEmbeddingConfig() || this.getDefaultLocalEmbeddingConfig();
    const updatedConfig = { ...currentConfig, ...updates };
    await this.setLocalEmbeddingConfig(updatedConfig);
  }

  /**
   * Check if local embedding is enabled in configuration
   */
  isLocalEmbeddingEnabled(): boolean {
    const config = this.getLocalEmbeddingConfig();
    return config?.enabled === true;
  }

  /**
   * Check if local embedding model is initialized
   */
  isLocalEmbeddingInitialized(): boolean {
    const config = this.getLocalEmbeddingConfig();
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
    const preferred = this.getEmbeddingProvider();
    const voyageAvailable = this.isVoyageAvailable();
    const localConfig = this.getLocalEmbeddingConfig();
    const localAvailable = this.isLocalEmbeddingEnabled();

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
    await vscode.workspace
      .getConfiguration(EmbeddingConfigManager.CONFIG_SECTION)
      .update(EmbeddingConfigManager.LOCAL_EMBEDDING_CONFIG_KEY, undefined, vscode.ConfigurationTarget.Global);
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
  getConfigurationSummary(): {
    embeddingProvider: string;
    voyageApiKeySet: boolean;
    localEmbeddingEnabled: boolean;
    localEmbeddingInitialized: boolean;
    localModelName?: string;
    lastUpdated?: string;
  } {
    const localConfig = this.getLocalEmbeddingConfig();

    return {
      embeddingProvider: this.getEmbeddingProvider(),
      voyageApiKeySet: this.isVoyageAvailable(),
      localEmbeddingEnabled: this.isLocalEmbeddingEnabled(),
      localEmbeddingInitialized: this.isLocalEmbeddingInitialized(),
      localModelName: localConfig?.modelName,
      lastUpdated: localConfig?.lastUpdated,
    };
  }
}

/**
 * Global instance of the embedding configuration manager
 */
export const embeddingConfigManager = new EmbeddingConfigManager();
