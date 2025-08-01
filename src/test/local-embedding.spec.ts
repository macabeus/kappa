import { expect } from '@wdio/globals';
import { runOnVSCode } from './utils';

describe('Local Embedding Service', () => {
  it('should initialize LocalEmbeddingService correctly', async () => {
    const result = await runOnVSCode(async function ({ vscode }) {
      // Mock extension context
      const mockExtensionContext = {
        globalStorageUri: vscode.Uri.file('/tmp/test-storage'),
        subscriptions: [],
        workspaceState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
        globalState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
      };

      // Import LocalEmbeddingService
      const { LocalEmbeddingService } = await import('../db/local-embedding');

      // Create service instance
      const service = new LocalEmbeddingService(mockExtensionContext as any);

      // Test basic properties
      expect(service.name).toBe('LocalEmbedding');
      
      return { success: true };
    });

    expect(result.success).toBe(true);
  });

  it('should handle embedding generation with valid input', async () => {
    const result = await runOnVSCode(async function ({ vscode }) {
      // Mock extension context
      const mockExtensionContext = {
        globalStorageUri: vscode.Uri.file('/tmp/test-storage'),
        subscriptions: [],
        workspaceState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
        globalState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
      };

      const { LocalEmbeddingService, EmbeddingException, EmbeddingError } = await import('../db/local-embedding');

      const service = new LocalEmbeddingService(mockExtensionContext as any);

      // Test input validation
      try {
        await service.getEmbedding([]);
        return { result: 'empty_array_handled', success: true };
      } catch (error) {
        return { error: error.message, success: false };
      }
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe('empty_array_handled');
  });

  it('should validate input parameters correctly', async () => {
    const result = await runOnVSCode(async function ({ vscode }) {
      const mockExtensionContext = {
        globalStorageUri: vscode.Uri.file('/tmp/test-storage'),
        subscriptions: [],
        workspaceState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
        globalState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
      };

      const { LocalEmbeddingService, EmbeddingException, EmbeddingError } = await import('../db/local-embedding');

      const service = new LocalEmbeddingService(mockExtensionContext as any);

      // Test invalid input types
      const testCases = [
        { input: null, expectedError: 'Input must be an array' },
        { input: 'not an array', expectedError: 'Input must be an array' },
        { input: [123, 'string'], expectedError: 'Input at index 0 is not a string' },
        { input: ['valid', null], expectedError: 'Input at index 1 is not a string' },
      ];

      const results = [];

      for (const testCase of testCases) {
        try {
          await service.getEmbedding(testCase.input as any);
          results.push({ input: testCase.input, error: null, success: false });
        } catch (error) {
          const isExpectedError = error instanceof EmbeddingException && 
            error.type === EmbeddingError.EMBEDDING_FAILED &&
            error.message.includes(testCase.expectedError.split(' ')[0]);
          
          results.push({ 
            input: testCase.input, 
            error: error.message, 
            success: isExpectedError 
          });
        }
      }

      return { results, success: results.every(r => r.success) };
    });

    expect(result.success).toBe(true);
  });

  it('should handle memory monitoring correctly', async () => {
    const result = await runOnVSCode(async function ({ vscode }) {
      const mockExtensionContext = {
        globalStorageUri: vscode.Uri.file('/tmp/test-storage'),
        subscriptions: [],
        workspaceState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
        globalState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
      };

      const { LocalEmbeddingService } = await import('../db/local-embedding');

      const service = new LocalEmbeddingService(mockExtensionContext as any);

      // Access private memory monitor for testing
      const memoryMonitor = (service as any).memoryMonitor;

      // Test memory statistics
      const stats = memoryMonitor.getMemoryStats();
      
      expect(typeof stats.used).toBe('number');
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.available).toBe('number');
      expect(typeof stats.percentage).toBe('number');
      expect(stats.used).toBeGreaterThan(0);
      expect(stats.total).toBeGreaterThan(stats.used);
      expect(stats.percentage).toBeGreaterThanOrEqual(0);
      expect(stats.percentage).toBeLessThanOrEqual(100);

      // Test optimal batch size calculation
      const batchSize = memoryMonitor.getOptimalBatchSize(25);
      expect(typeof batchSize).toBe('number');
      expect(batchSize).toBeGreaterThan(0);
      expect(batchSize).toBeLessThanOrEqual(25);

      // Test memory safety check
      const isSafe = memoryMonitor.isMemoryUsageSafe();
      expect(typeof isSafe).toBe('boolean');

      return { success: true };
    });

    expect(result.success).toBe(true);
  });

  it('should handle batch processing with various input sizes', async () => {
    const result = await runOnVSCode(async function ({ vscode }) {
      const mockExtensionContext = {
        globalStorageUri: vscode.Uri.file('/tmp/test-storage'),
        subscriptions: [],
        workspaceState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
        globalState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
      };

      const { LocalEmbeddingService } = await import('../db/local-embedding');

      const service = new LocalEmbeddingService(mockExtensionContext as any);

      // Test adaptive chunking
      const testSizes = [1, 5, 10, 25, 50, 100];
      const results = [];

      for (const size of testSizes) {
        const texts = Array(size).fill(0).map((_, i) => `test assembly function ${i}`);
        
        try {
          // Test createAdaptiveChunks method
          const chunks = (service as any).createAdaptiveChunks(texts);
          
          expect(Array.isArray(chunks)).toBe(true);
          expect(chunks.length).toBeGreaterThan(0);
          
          // Verify all texts are included
          const totalTexts = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          expect(totalTexts).toBe(size);
          
          results.push({ size, chunks: chunks.length, success: true });
        } catch (error) {
          results.push({ size, error: error.message, success: false });
        }
      }

      return { results, success: results.every(r => r.success) };
    });

    expect(result.success).toBe(true);
  });

  it('should handle error scenarios gracefully', async () => {
    const result = await runOnVSCode(async function ({ vscode }) {
      const mockExtensionContext = {
        globalStorageUri: vscode.Uri.file('/tmp/test-storage'),
        subscriptions: [],
        workspaceState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
        globalState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
      };

      const { LocalEmbeddingService, EmbeddingException, EmbeddingError } = await import('../db/local-embedding');

      const service = new LocalEmbeddingService(mockExtensionContext as any);

      // Test error handling for uninitialized service
      try {
        await service.embed(['test']);
        return { success: false, error: 'Should have thrown error for uninitialized service' };
      } catch (error) {
        const isExpectedError = error instanceof EmbeddingException && 
          (error.type === EmbeddingError.MODEL_LOAD_FAILED || 
           error.type === EmbeddingError.EMBEDDING_FAILED);
        
        if (!isExpectedError) {
          return { success: false, error: `Unexpected error type: ${error.message}` };
        }
      }

      // Test cleanup method
      try {
        await service.cleanup();
        return { success: true };
      } catch (error) {
        return { success: false, error: `Cleanup failed: ${error.message}` };
      }
    });

    expect(result.success).toBe(true);
  });

  it('should provide Voyage AI compatible response format', async () => {
    const result = await runOnVSCode(async function ({ vscode }) {
      const mockExtensionContext = {
        globalStorageUri: vscode.Uri.file('/tmp/test-storage'),
        subscriptions: [],
        workspaceState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
        globalState: {
          get: () => undefined,
          update: () => Promise.resolve(),
        },
      };

      const { LocalEmbeddingService } = await import('../db/local-embedding');

      const service = new LocalEmbeddingService(mockExtensionContext as any);

      // Mock the embed method to return test data
      const originalEmbed = service.embed;
      service.embed = async (texts: string[]) => {
        return texts.map(() => Array(384).fill(0).map(() => Math.random()));
      };

      try {
        const response = await service.getVoyageCompatibleResponse(['test assembly code']);
        
        // Verify response structure matches Voyage AI format
        expect(response).toHaveProperty('data');
        expect(response).toHaveProperty('model');
        expect(response).toHaveProperty('usage');
        
        expect(Array.isArray(response.data)).toBe(true);
        expect(response.data.length).toBe(1);
        expect(response.data[0]).toHaveProperty('embedding');
        expect(response.data[0]).toHaveProperty('index');
        expect(response.data[0].index).toBe(0);
        expect(Array.isArray(response.data[0].embedding)).toBe(true);
        expect(response.data[0].embedding.length).toBe(384);
        
        expect(typeof response.model).toBe('string');
        expect(response.usage).toHaveProperty('total_tokens');
        expect(typeof response.usage.total_tokens).toBe('number');

        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      } finally {
        // Restore original method
        service.embed = originalEmbed;
      }
    });

    expect(result.success).toBe(true);
  });
});