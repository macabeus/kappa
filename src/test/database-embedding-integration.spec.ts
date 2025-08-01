import { expect } from '@wdio/globals';
import { runOnVSCode } from './utils';

describe('Database Embedding Integration', () => {
  it('should integrate local embeddings with database correctly', async () => {
    const result = await runOnVSCode(async function ({ vscode, workspaceUri }) {
      // Create a test decomp.yaml with local embedding configuration
      const decompYamlContent = `
platform: n64
tools:
  kappa:
    buildFolder: build
    embeddingProvider: local
    localEmbedding:
      enabled: true
      modelName: all-MiniLM-L6-v2
`;

      const decompYamlUri = vscode.Uri.joinPath(workspaceUri, 'decomp.yaml');
      await vscode.workspace.fs.writeFile(decompYamlUri, Buffer.from(decompYamlContent));

      // Import database and configuration
      const { database } = await import('../db/db');
      const { embeddingConfigManager } = await import('../configurations/embedding-config');

      try {
        // Test configuration loading
        const provider = await embeddingConfigManager.getEmbeddingProvider();
        expect(provider).toBe('local');

        const localConfig = await embeddingConfigManager.getLocalEmbeddingConfig();
        expect(localConfig).not.toBeNull();
        expect(localConfig?.enabled).toBe(true);
        expect(localConfig?.modelName).toBe('all-MiniLM-L6-v2');

        // Test database provider status
        const status = await database.getEmbeddingProviderStatus();
        expect(status.preferred).toBe('local');

        return { success: true, provider, localConfig, status };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('local');
  });

  it('should handle embedding provider fallback correctly', async () => {
    const result = await runOnVSCode(async function ({ vscode, workspaceUri }) {
      // Create a test decomp.yaml with local embedding disabled
      const decompYamlContent = `
platform: n64
tools:
  kappa:
    buildFolder: build
    embeddingProvider: local
    localEmbedding:
      enabled: false
      modelName: all-MiniLM-L6-v2
`;

      const decompYamlUri = vscode.Uri.joinPath(workspaceUri, 'decomp.yaml');
      await vscode.workspace.fs.writeFile(decompYamlUri, Buffer.from(decompYamlContent));

      const { database } = await import('../db/db');
      const { embeddingConfigManager } = await import('../configurations/embedding-config');

      try {
        // Test that local embedding is not available
        const isLocalEnabled = await database.isLocalEmbeddingEnabled();
        expect(isLocalEnabled).toBe(false);

        // Test provider status shows fallback behavior
        const status = await database.getEmbeddingProviderStatus();
        expect(status.preferred).toBe('local');
        expect(status.localAvailable).toBe(false);
        
        // Active provider should fallback to voyage if available, or none
        expect(['voyage', 'none']).toContain(status.activeProvider);

        return { success: true, status };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    expect(result.success).toBe(true);
  });

  it('should handle configuration updates correctly', async () => {
    const result = await runOnVSCode(async function ({ vscode, workspaceUri }) {
      // Create initial decomp.yaml
      const initialContent = `
platform: n64
tools:
  kappa:
    buildFolder: build
    embeddingProvider: voyage
    localEmbedding:
      enabled: false
      modelName: all-MiniLM-L6-v2
`;

      const decompYamlUri = vscode.Uri.joinPath(workspaceUri, 'decomp.yaml');
      await vscode.workspace.fs.writeFile(decompYamlUri, Buffer.from(initialContent));

      const { embeddingConfigManager } = await import('../configurations/embedding-config');

      try {
        // Test initial configuration
        let provider = await embeddingConfigManager.getEmbeddingProvider();
        expect(provider).toBe('voyage');

        let localConfig = await embeddingConfigManager.getLocalEmbeddingConfig();
        expect(localConfig?.enabled).toBe(false);

        // Update configuration
        await embeddingConfigManager.setEmbeddingProvider('local');
        await embeddingConfigManager.updateLocalEmbeddingConfig({ enabled: true });

        // Verify updates
        provider = await embeddingConfigManager.getEmbeddingProvider();
        expect(provider).toBe('local');

        localConfig = await embeddingConfigManager.getLocalEmbeddingConfig();
        expect(localConfig?.enabled).toBe(true);

        // Verify the file was updated
        const updatedContent = await vscode.workspace.fs.readFile(decompYamlUri);
        const updatedYaml = updatedContent.toString();
        expect(updatedYaml).toContain('embeddingProvider: local');
        expect(updatedYaml).toContain('enabled: true');

        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    expect(result.success).toBe(true);
  });

  it('should validate embedding configuration schema', async () => {
    const result = await runOnVSCode(async function ({ vscode, workspaceUri }) {
      const { loadDecompYaml } = await import('../configurations/decomp-yaml');

      // Test valid configuration
      const validContent = `
platform: n64
tools:
  kappa:
    buildFolder: build
    embeddingProvider: local
    localEmbedding:
      enabled: true
      modelName: all-MiniLM-L6-v2
`;

      const decompYamlUri = vscode.Uri.joinPath(workspaceUri, 'decomp.yaml');
      await vscode.workspace.fs.writeFile(decompYamlUri, Buffer.from(validContent));

      try {
        const config = await loadDecompYaml();
        expect(config).not.toBeNull();
        expect(config?.tools?.kappa?.embeddingProvider).toBe('local');
        expect(config?.tools?.kappa?.localEmbedding?.enabled).toBe(true);
        expect(config?.tools?.kappa?.localEmbedding?.modelName).toBe('all-MiniLM-L6-v2');

        return { success: true, config };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    expect(result.success).toBe(true);
  });

  it('should handle missing decomp.yaml gracefully', async () => {
    const result = await runOnVSCode(async function ({ vscode, workspaceUri }) {
      // Ensure no decomp.yaml exists
      const decompYamlUri = vscode.Uri.joinPath(workspaceUri, 'decomp.yaml');
      const decompYmlUri = vscode.Uri.joinPath(workspaceUri, 'decomp.yml');
      
      try {
        await vscode.workspace.fs.delete(decompYamlUri);
      } catch {}
      try {
        await vscode.workspace.fs.delete(decompYmlUri);
      } catch {}

      const { embeddingConfigManager } = await import('../configurations/embedding-config');

      try {
        // Should handle missing file gracefully
        const provider = await embeddingConfigManager.getEmbeddingProvider();
        expect(provider).toBe('voyage'); // Default value

        const localConfig = await embeddingConfigManager.getLocalEmbeddingConfig();
        expect(localConfig).toBeNull();

        return { success: true };
      } catch (error) {
        // Should not throw error for missing file, should return defaults
        return { success: false, error: error.message };
      }
    });

    expect(result.success).toBe(true);
  });

  it('should maintain compatibility with existing database operations', async () => {
    const result = await runOnVSCode(async function ({ vscode, workspaceUri }) {
      // Create test decomp.yaml
      const decompYamlContent = `
platform: n64
tools:
  kappa:
    buildFolder: build
    embeddingProvider: local
    localEmbedding:
      enabled: true
      modelName: all-MiniLM-L6-v2
`;

      const decompYamlUri = vscode.Uri.joinPath(workspaceUri, 'decomp.yaml');
      await vscode.workspace.fs.writeFile(decompYamlUri, Buffer.from(decompYamlContent));

      const { database } = await import('../db/db');

      try {
        // Test database initialization
        const db = await database.getDatabase();
        expect(db).toBeDefined();

        // Test adding a function
        const functionId = await database.addFunction({
          name: 'test_function',
          asmCode: 'mov r0, #0\nbx lr',
          asmModulePath: '/test/test.s',
          cCode: 'int test_function() { return 0; }',
          cModulePath: '/test/test.c'
        });

        expect(typeof functionId).toBe('string');
        expect(functionId).toContain('test_function');

        // Test retrieving the function
        const retrievedFunction = await database.getFunctionById(functionId);
        expect(retrievedFunction).not.toBeNull();
        expect(retrievedFunction?.name).toBe('test_function');
        expect(retrievedFunction?.asmCode).toBe('mov r0, #0\nbx lr');

        // Test database stats
        const stats = await database.getStats();
        expect(stats).toHaveProperty('totalFunctions');
        expect(stats).toHaveProperty('totalDecompiledFunctions');
        expect(stats).toHaveProperty('totalNotDecompiledFunctions');
        expect(stats).toHaveProperty('totalVectors');
        expect(stats.totalFunctions).toBeGreaterThan(0);

        return { success: true, functionId, stats };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    expect(result.success).toBe(true);
  });

  it('should handle embedding provider status correctly', async () => {
    const result = await runOnVSCode(async function ({ vscode, workspaceUri }) {
      const decompYamlContent = `
platform: n64
tools:
  kappa:
    buildFolder: build
    embeddingProvider: local
    localEmbedding:
      enabled: true
      modelName: all-MiniLM-L6-v2
`;

      const decompYamlUri = vscode.Uri.joinPath(workspaceUri, 'decomp.yaml');
      await vscode.workspace.fs.writeFile(decompYamlUri, Buffer.from(decompYamlContent));

      const { embeddingConfigManager } = await import('../configurations/embedding-config');

      try {
        const status = await embeddingConfigManager.getEmbeddingProviderStatus();
        
        expect(status).toHaveProperty('preferred');
        expect(status).toHaveProperty('voyageAvailable');
        expect(status).toHaveProperty('localAvailable');
        expect(status).toHaveProperty('activeProvider');
        expect(status).toHaveProperty('localConfig');

        expect(status.preferred).toBe('local');
        expect(typeof status.voyageAvailable).toBe('boolean');
        expect(typeof status.localAvailable).toBe('boolean');
        expect(['voyage', 'local', 'none']).toContain(status.activeProvider);

        if (status.localConfig) {
          expect(status.localConfig).toHaveProperty('enabled');
          expect(status.localConfig).toHaveProperty('modelName');
          expect(status.localConfig.enabled).toBe(true);
          expect(status.localConfig.modelName).toBe('all-MiniLM-L6-v2');
        }

        const summary = await embeddingConfigManager.getConfigurationSummary();
        expect(summary).toHaveProperty('embeddingProvider');
        expect(summary).toHaveProperty('voyageApiKeySet');
        expect(summary).toHaveProperty('localEmbeddingEnabled');
        expect(summary).toHaveProperty('localEmbeddingInitialized');

        return { success: true, status, summary };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    expect(result.success).toBe(true);
  });
});