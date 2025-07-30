import * as vscode from 'vscode';
import { pipeline, env, FeatureExtractionPipeline } from '@xenova/transformers';
import { VoyageApiResponse } from './voyage';
import { embeddingConfigManager } from '../configurations/embedding-config';

// Configure Transformers.js for VS Code extension environment
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = false;
env.useCustomCache = true;

export interface EmbeddingProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  initialize(): Promise<void>;
  embed(texts: string[]): Promise<number[][]>;
  cleanup(): Promise<void>;
}

export interface LocalEmbeddingConfig {
  enabled: boolean;
  modelName: string;
  modelPath: string;
  lastUpdated: string;
  version: string;
}

export enum EmbeddingError {
  MODEL_DOWNLOAD_FAILED = 'MODEL_DOWNLOAD_FAILED',
  MODEL_LOAD_FAILED = 'MODEL_LOAD_FAILED',
  EMBEDDING_FAILED = 'EMBEDDING_FAILED',
  INSUFFICIENT_MEMORY = 'INSUFFICIENT_MEMORY',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

export class EmbeddingException extends Error {
  constructor(
    public type: EmbeddingError,
    message: string,
    public recoverable: boolean = true,
  ) {
    super(message);
  }
}

interface ModelConfig {
  name: string;
  huggingFaceId: string;
  dimensions: number;
  maxTokens: number;
  batchSize: number;
}

const DEFAULT_MODEL: ModelConfig = {
  name: 'all-MiniLM-L6-v2',
  huggingFaceId: 'Xenova/all-MiniLM-L6-v2',
  dimensions: 384,
  maxTokens: 512,
  batchSize: 25,
};

interface MemoryStats {
  used: number;
  total: number;
  available: number;
  percentage: number;
}

interface BatchProcessingOptions {
  maxBatchSize: number;
  memoryThreshold: number; // Percentage of memory usage to trigger batch size reduction
  minBatchSize: number;
  adaptiveBatching: boolean;
}

class MemoryMonitor {
  private static readonly DEFAULT_OPTIONS: BatchProcessingOptions = {
    maxBatchSize: 25,
    memoryThreshold: 80, // 80% memory usage threshold
    minBatchSize: 1,
    adaptiveBatching: true,
  };

  constructor(private options: BatchProcessingOptions = MemoryMonitor.DEFAULT_OPTIONS) {}

  /**
   * Get current memory statistics
   * Note: In Node.js/VS Code extension context, we use process.memoryUsage()
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();

    // Get system memory info (approximation)
    // In a real implementation, you might want to use a native module for accurate system memory
    const totalMemory = memUsage.heapTotal + memUsage.external + 1024 * 1024 * 1024; // Rough estimate
    const usedMemory = memUsage.heapUsed + memUsage.external;
    const availableMemory = totalMemory - usedMemory;
    const percentage = (usedMemory / totalMemory) * 100;

    return {
      used: usedMemory,
      total: totalMemory,
      available: availableMemory,
      percentage,
    };
  }

  /**
   * Determine optimal batch size based on current memory usage
   */
  getOptimalBatchSize(requestedBatchSize: number): number {
    if (!this.options.adaptiveBatching) {
      return Math.min(requestedBatchSize, this.options.maxBatchSize);
    }

    const memStats = this.getMemoryStats();

    // If memory usage is below threshold, use requested batch size
    if (memStats.percentage < this.options.memoryThreshold) {
      return Math.min(requestedBatchSize, this.options.maxBatchSize);
    }

    // If memory usage is high, reduce batch size
    const reductionFactor = Math.max(0.1, (100 - memStats.percentage) / 100);
    const reducedBatchSize = Math.floor(this.options.maxBatchSize * reductionFactor);

    return Math.max(this.options.minBatchSize, reducedBatchSize);
  }

  /**
   * Check if memory usage is within safe limits
   */
  isMemoryUsageSafe(): boolean {
    const memStats = this.getMemoryStats();
    return memStats.percentage < this.options.memoryThreshold;
  }

  /**
   * Force garbage collection if available (for memory cleanup)
   */
  forceGarbageCollection(): void {
    if (global.gc) {
      try {
        global.gc();
        console.log('Forced garbage collection completed');
      } catch (error) {
        console.warn('Failed to force garbage collection:', error);
      }
    }
  }

  /**
   * Log current memory statistics
   */
  logMemoryStats(context: string = ''): void {
    const stats = this.getMemoryStats();
    const usedMB = Math.round(stats.used / (1024 * 1024));
    const totalMB = Math.round(stats.total / (1024 * 1024));
    const availableMB = Math.round(stats.available / (1024 * 1024));

    console.log(
      `Memory Stats${context ? ` (${context})` : ''}: ` +
        `Used: ${usedMB}MB, Available: ${availableMB}MB, Total: ${totalMB}MB, ` +
        `Usage: ${stats.percentage.toFixed(1)}%`,
    );
  }
}

export class LocalEmbeddingService implements EmbeddingProvider {
  public readonly name = 'LocalEmbedding';
  private model: FeatureExtractionPipeline | null = null;
  private isInitialized: boolean = false;
  private extensionContext: vscode.ExtensionContext;
  private config: ModelConfig;
  private memoryMonitor: MemoryMonitor;

  constructor(extensionContext: vscode.ExtensionContext, config: ModelConfig = DEFAULT_MODEL) {
    this.extensionContext = extensionContext;
    this.config = config;
    this.memoryMonitor = new MemoryMonitor({
      maxBatchSize: config.batchSize,
      memoryThreshold: 80,
      minBatchSize: 1,
      adaptiveBatching: true,
    });

    // Set custom cache directory to VS Code extension global storage
    env.customCache = this.extensionContext.globalStorageUri.fsPath;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check configuration first
      if (!embeddingConfigManager.isLocalEmbeddingEnabled()) {
        return false;
      }

      // Check if model is already initialized
      if (this.isInitialized && this.model) {
        return true;
      }

      // Check if model files exist in cache and configuration is valid
      return await this.isModelCached();
    } catch (error) {
      console.error('Error checking local embedding availability:', error);
      return false;
    }
  }

  /**
   * Initialize the local embedding service by loading the model
   * This method ensures the model is ready for embedding generation
   */
  async initialize(): Promise<void> {
    // Return early if already initialized
    if (this.isInitialized && this.model) {
      console.log('Local embedding service already initialized');
      return;
    }

    console.log('Initializing local embedding service...');

    try {
      // Load the model with proper configuration
      await this.loadModel();

      // Verify model is loaded successfully
      if (!this.model) {
        throw new Error('Model loading completed but model is null');
      }

      // Mark as initialized only after successful model loading
      this.isInitialized = true;
      console.log('Local embedding service initialized successfully');
    } catch (error) {
      // Ensure clean state on initialization failure
      this.isInitialized = false;
      this.model = null;

      console.error('Failed to initialize local embedding service:', error);

      // Re-throw EmbeddingException as-is
      if (error instanceof EmbeddingException) {
        throw error;
      }

      // Wrap other errors in EmbeddingException
      if (error instanceof Error) {
        throw new EmbeddingException(
          EmbeddingError.MODEL_LOAD_FAILED,
          `Failed to initialize local embedding model: ${error.message}`,
          true,
        );
      }

      // Handle non-Error objects
      throw new EmbeddingException(
        EmbeddingError.MODEL_LOAD_FAILED,
        `Unknown error during initialization: ${String(error)}`,
        true,
      );
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.isInitialized || !this.model) {
      await this.initialize();
    }

    if (!this.model) {
      throw new EmbeddingException(EmbeddingError.EMBEDDING_FAILED, 'Model not initialized', true);
    }

    // Log initial memory state
    this.memoryMonitor.logMemoryStats('before embedding');

    try {
      // Process texts with adaptive batch processing and memory management
      const results: number[][] = [];
      let processedCount = 0;

      // Split large batches into smaller chunks based on memory constraints
      const chunks = this.createAdaptiveChunks(texts);

      console.log(`Processing ${texts.length} texts in ${chunks.length} adaptive chunks`);

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];

        // Check memory before processing each chunk
        if (!this.memoryMonitor.isMemoryUsageSafe()) {
          console.warn(`High memory usage detected before chunk ${chunkIndex + 1}, forcing cleanup`);
          this.memoryMonitor.forceGarbageCollection();

          // Wait a bit for GC to complete
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        try {
          console.log(`Processing chunk ${chunkIndex + 1}/${chunks.length} with ${chunk.length} texts`);
          this.memoryMonitor.logMemoryStats(`chunk ${chunkIndex + 1} start`);

          const chunkEmbeddings = await this.processBatchWithRetry(chunk, chunkIndex);
          results.push(...chunkEmbeddings);
          processedCount += chunk.length;

          // Log progress
          const progress = Math.round((processedCount / texts.length) * 100);
          console.log(`Embedding progress: ${processedCount}/${texts.length} (${progress}%)`);

          // Memory cleanup after each chunk
          this.memoryMonitor.logMemoryStats(`chunk ${chunkIndex + 1} end`);

          // Force cleanup if memory usage is getting high
          if (!this.memoryMonitor.isMemoryUsageSafe()) {
            this.memoryMonitor.forceGarbageCollection();
          }
        } catch (error) {
          console.error(`Failed to process chunk ${chunkIndex + 1}:`, error);

          // If it's a memory error, try with smaller chunks
          if (error instanceof EmbeddingException && error.type === EmbeddingError.INSUFFICIENT_MEMORY) {
            console.log(`Retrying chunk ${chunkIndex + 1} with smaller sub-chunks due to memory constraints`);
            const subChunkEmbeddings = await this.processChunkWithMemoryRecovery(chunk);
            results.push(...subChunkEmbeddings);
            processedCount += chunk.length;
          } else {
            throw error;
          }
        }
      }

      // Final memory cleanup
      this.memoryMonitor.forceGarbageCollection();
      this.memoryMonitor.logMemoryStats('after embedding complete');

      console.log(`Successfully generated ${results.length} embeddings for ${texts.length} texts`);
      return results;
    } catch (error) {
      // Log memory state on error for debugging
      this.memoryMonitor.logMemoryStats('on error');

      if (error instanceof Error) {
        throw new EmbeddingException(
          EmbeddingError.EMBEDDING_FAILED,
          `Failed to generate embeddings: ${error.message}`,
          true,
        );
      }
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    console.log('Starting LocalEmbeddingService cleanup...');
    this.memoryMonitor.logMemoryStats('before cleanup');

    if (this.model) {
      try {
        // Note: Transformers.js doesn't have explicit cleanup methods,
        // but we can null the reference to help with garbage collection
        this.model = null;
        this.isInitialized = false;

        // Force garbage collection to free up model memory
        this.memoryMonitor.forceGarbageCollection();

        // Wait a bit for cleanup to complete
        await new Promise((resolve) => setTimeout(resolve, 200));

        console.log('LocalEmbeddingService cleanup completed');
        this.memoryMonitor.logMemoryStats('after cleanup');
      } catch (error) {
        console.warn('Error during model cleanup:', error);
      }
    }
  }

  /**
   * Drop-in replacement for the existing #getEmbedding method in Database class
   * Returns embeddings in the same format as Voyage AI (number[][] arrays)
   *
   * This method provides full compatibility with the existing Voyage AI implementation:
   * - Processes assembly code strings exactly like Voyage AI
   * - Returns embeddings as number[][] arrays (same format)
   * - Handles batch processing of 25 functions like existing implementation
   * - Integrates seamlessly with existing database schema
   *
   * @param asmCodes Array of assembly code strings to embed
   * @returns Promise<number[][]> Array of embedding vectors, one per input string
   * @throws EmbeddingException if embedding generation fails
   */
  async getEmbedding(asmCodes: string[]): Promise<number[][]> {
    // Validate input
    if (!Array.isArray(asmCodes)) {
      throw new EmbeddingException(
        EmbeddingError.EMBEDDING_FAILED,
        'Input must be an array of assembly code strings',
        false,
      );
    }

    if (asmCodes.length === 0) {
      return [];
    }

    // Validate that all inputs are strings
    for (let i = 0; i < asmCodes.length; i++) {
      if (typeof asmCodes[i] !== 'string') {
        throw new EmbeddingException(
          EmbeddingError.EMBEDDING_FAILED,
          `Input at index ${i} is not a string: ${typeof asmCodes[i]}`,
          false,
        );
      }
    }

    try {
      // Use the embed method which handles batch processing and all the complex logic
      const embeddings = await this.embed(asmCodes);

      // Validate output format matches Voyage AI expectations
      if (!Array.isArray(embeddings)) {
        throw new EmbeddingException(EmbeddingError.EMBEDDING_FAILED, 'Embedding output is not an array', true);
      }

      if (embeddings.length !== asmCodes.length) {
        throw new EmbeddingException(
          EmbeddingError.EMBEDDING_FAILED,
          `Embedding count mismatch: expected ${asmCodes.length}, got ${embeddings.length}`,
          true,
        );
      }

      // Validate each embedding is a number array
      for (let i = 0; i < embeddings.length; i++) {
        if (!Array.isArray(embeddings[i])) {
          throw new EmbeddingException(
            EmbeddingError.EMBEDDING_FAILED,
            `Embedding at index ${i} is not an array`,
            true,
          );
        }

        if (embeddings[i].some((val) => typeof val !== 'number' || !isFinite(val))) {
          throw new EmbeddingException(
            EmbeddingError.EMBEDDING_FAILED,
            `Embedding at index ${i} contains invalid values (non-numeric or infinite)`,
            true,
          );
        }
      }

      console.log(
        `Successfully generated ${embeddings.length} embeddings with dimensions ${embeddings[0]?.length || 0}`,
      );
      return embeddings;
    } catch (error) {
      // Re-throw EmbeddingException as-is
      if (error instanceof EmbeddingException) {
        throw error;
      }

      // Wrap other errors
      if (error instanceof Error) {
        throw new EmbeddingException(
          EmbeddingError.EMBEDDING_FAILED,
          `Failed to generate embeddings: ${error.message}`,
          true,
        );
      }

      throw new EmbeddingException(
        EmbeddingError.EMBEDDING_FAILED,
        `Unknown error during embedding generation: ${String(error)}`,
        true,
      );
    }
  }

  /**
   * Mimics Voyage AI response format exactly for compatibility
   */
  async getVoyageCompatibleResponse(asmCodes: string[]): Promise<VoyageApiResponse> {
    const embeddings = await this.embed(asmCodes);

    return {
      data: embeddings.map((embedding, index) => ({
        embedding,
        index,
      })),
      model: this.config.name,
      usage: {
        total_tokens: asmCodes.reduce((sum, code) => sum + this.estimateTokens(code), 0),
      },
    };
  }

  /**
   * Download the model with progress tracking
   * This method fetches the Xenova/all-MiniLM-L6-v2 model from Hugging Face
   * and stores it in VS Code extension global storage directory
   */
  async downloadModel(): Promise<void> {
    try {
      // Ensure the models directory exists in global storage
      const modelsDir = vscode.Uri.joinPath(this.extensionContext.globalStorageUri, 'models');
      try {
        await vscode.workspace.fs.createDirectory(modelsDir);
      } catch (error) {
        // Directory might already exist, ignore error
      }

      // Show progress notification
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Downloading Local Embedding Model',
          cancellable: false,
        },
        async (progress) => {
          let lastReportedPercent = 0;

          // Create the embedding pipeline with progress tracking
          this.model = await pipeline('feature-extraction', this.config.huggingFaceId, {
            progress_callback: (progressInfo: any) => {
              if (progressInfo.status === 'downloading') {
                const percent = Math.round((progressInfo.loaded / progressInfo.total) * 100);

                // Only update progress if there's a meaningful change
                if (percent > lastReportedPercent) {
                  const increment = percent - lastReportedPercent;
                  progress.report({
                    increment,
                    message: `${percent}% - ${progressInfo.file || 'model files'}`,
                  });
                  lastReportedPercent = percent;
                }
              } else if (progressInfo.status === 'ready') {
                progress.report({
                  increment: 100 - lastReportedPercent,
                  message: 'Model ready!',
                });
              } else if (progressInfo.status === 'initiate') {
                progress.report({
                  increment: 0,
                  message: 'Initializing download...',
                });
              }
            },
          });

          // Final progress update
          progress.report({
            increment: 100 - lastReportedPercent,
            message: 'Download complete!',
          });
        },
      );

      // Update configuration to mark model as downloaded
      await this.updateModelConfig({
        enabled: true,
        modelName: this.config.name,
        modelPath: this.getModelCachePath(),
        lastUpdated: new Date().toISOString(),
        version: '1.0.0',
      });

      vscode.window.showInformationMessage(
        `Local embedding model "${this.config.name}" downloaded successfully! You can now use Kappa offline.`,
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('network') || error.message.includes('fetch')) {
          throw new EmbeddingException(
            EmbeddingError.NETWORK_ERROR,
            `Network error while downloading model: ${error.message}`,
            true,
          );
        } else {
          throw new EmbeddingException(
            EmbeddingError.MODEL_DOWNLOAD_FAILED,
            `Failed to download model: ${error.message}`,
            true,
          );
        }
      }
      throw error;
    }
  }

  /**
   * Load and initialize the Transformers.js pipeline for embedding generation
   * Configures the model with proper tokenization and error handling
   */
  private async loadModel(): Promise<void> {
    try {
      // If model is already loaded, return early
      if (this.model) {
        console.log('Local embedding model already loaded');
        return;
      }

      console.log(`Loading local embedding model: ${this.config.huggingFaceId}`);

      // Check if model needs to be downloaded first
      if (!(await this.isModelCached())) {
        console.log('Model not cached, downloading first...');
        await this.downloadModel();
        return; // downloadModel already sets this.model
      }

      // Load existing cached model with proper configuration
      console.log('Loading model from cache...');
      this.model = await pipeline('feature-extraction', this.config.huggingFaceId, {
        // Configure for embedding generation
        quantized: true, // Use quantized model for better performance

        // Progress callback for loading feedback
        progress_callback: (progress: any) => {
          if (progress.status === 'loading') {
            console.log(`Loading model component: ${progress.file || 'model files'}`);
          } else if (progress.status === 'ready') {
            console.log('Local embedding model loaded successfully from cache');
          } else if (progress.status === 'error') {
            console.error('Error loading model:', progress.error);
          }
        },
      });

      // Verify model is properly initialized
      if (!this.model) {
        throw new Error('Model pipeline creation returned null');
      }

      // Test the model with a simple input to ensure it's working
      try {
        console.log('Testing model initialization...');
        const testInput = ['test assembly code'];
        const testOutput = await this.model(testInput, {
          pooling: 'mean',
          normalize: true,
        });

        if (!testOutput || !testOutput.data) {
          throw new Error('Model test failed: no output generated');
        }

        console.log(`Model test successful. Output dimensions: ${testOutput.dims || 'unknown'}`);
      } catch (testError) {
        console.error('Model test failed:', testError);
        this.model = null; // Reset model on test failure
        throw new Error(
          `Model initialization test failed: ${testError instanceof Error ? testError.message : 'unknown error'}`,
        );
      }

      console.log('Local embedding model loaded and verified successfully');
    } catch (error) {
      // Reset model state on any failure
      this.model = null;
      this.isInitialized = false;

      // Categorize and handle different types of errors
      if (error instanceof EmbeddingException) {
        throw error; // Re-throw existing embedding exceptions
      }

      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        // Network-related errors
        if (
          errorMessage.includes('network') ||
          errorMessage.includes('fetch') ||
          errorMessage.includes('connection') ||
          errorMessage.includes('timeout')
        ) {
          throw new EmbeddingException(
            EmbeddingError.NETWORK_ERROR,
            `Network error while loading model: ${error.message}. Please check your internet connection and try again.`,
            true,
          );
        }

        // Memory-related errors
        if (
          errorMessage.includes('memory') ||
          errorMessage.includes('allocation') ||
          errorMessage.includes('out of memory')
        ) {
          throw new EmbeddingException(
            EmbeddingError.INSUFFICIENT_MEMORY,
            `Insufficient memory to load model: ${error.message}. Try closing other applications and retry.`,
            true,
          );
        }

        // File system or cache-related errors
        if (
          errorMessage.includes('file') ||
          errorMessage.includes('path') ||
          errorMessage.includes('permission') ||
          errorMessage.includes('cache')
        ) {
          throw new EmbeddingException(
            EmbeddingError.MODEL_LOAD_FAILED,
            `File system error while loading model: ${error.message}. The model cache may be corrupted. Try re-downloading the model.`,
            true,
          );
        }

        // Model format or compatibility errors
        if (
          errorMessage.includes('model') ||
          errorMessage.includes('pipeline') ||
          errorMessage.includes('tokenizer') ||
          errorMessage.includes('config')
        ) {
          throw new EmbeddingException(
            EmbeddingError.MODEL_LOAD_FAILED,
            `Model format error: ${error.message}. The model may be corrupted or incompatible. Try re-downloading the model.`,
            true,
          );
        }

        // Generic model loading failure
        throw new EmbeddingException(
          EmbeddingError.MODEL_LOAD_FAILED,
          `Failed to load local embedding model: ${error.message}. Please try re-downloading the model or check the logs for more details.`,
          true,
        );
      }

      // Handle non-Error objects
      throw new EmbeddingException(
        EmbeddingError.MODEL_LOAD_FAILED,
        `Unknown error while loading model: ${String(error)}`,
        true,
      );
    }
  }

  /**
   * Process a batch of texts through the embedding model
   * Handles proper tokenization and embedding extraction with memory monitoring
   */
  private async processBatch(texts: string[]): Promise<number[][]> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    // Check memory before processing
    const memoryBefore = this.memoryMonitor.getMemoryStats();
    if (!this.memoryMonitor.isMemoryUsageSafe()) {
      throw new EmbeddingException(
        EmbeddingError.INSUFFICIENT_MEMORY,
        `Memory usage too high before batch processing: ${memoryBefore.percentage.toFixed(1)}%`,
        true,
      );
    }

    try {
      console.log(`Processing batch of ${texts.length} texts (Memory: ${memoryBefore.percentage.toFixed(1)}%)`);

      // Preprocess texts for better assembly code handling
      const processedTexts = texts.map((text) => {
        // Trim whitespace and ensure text is not empty
        const trimmed = text.trim();
        return trimmed || 'empty_assembly_function';
      });

      // Monitor memory during processing
      const memoryDuringPreprocess = this.memoryMonitor.getMemoryStats();
      if (memoryDuringPreprocess.percentage > 90) {
        throw new EmbeddingException(
          EmbeddingError.INSUFFICIENT_MEMORY,
          `Critical memory usage during preprocessing: ${memoryDuringPreprocess.percentage.toFixed(1)}%`,
          true,
        );
      }

      // Generate embeddings with proper configuration for assembly code
      const output = await this.model(processedTexts, {
        pooling: 'mean', // Use mean pooling for sentence-level embeddings
        normalize: true, // Normalize embeddings for better similarity computation
      });

      // Check memory after model inference
      const memoryAfterInference = this.memoryMonitor.getMemoryStats();
      if (memoryAfterInference.percentage > 95) {
        console.warn(`Very high memory usage after inference: ${memoryAfterInference.percentage.toFixed(1)}%`);
      }

      // Convert to the expected format (array of number arrays)
      const embeddings: number[][] = [];

      // Handle different output tensor shapes
      if (output.dims && output.dims.length === 3) {
        // Batch output: [batch_size, sequence_length, hidden_size]
        // After pooling, this becomes [batch_size, hidden_size]
        console.log(`Processing 3D output with dims: [${output.dims.join(', ')}]`);

        const batchSize = output.dims[0];
        const hiddenSize = output.dims[2];

        for (let i = 0; i < batchSize; i++) {
          const embedding: number[] = [];
          const startIdx = i * hiddenSize;

          for (let j = 0; j < hiddenSize; j++) {
            embedding.push(output.data[startIdx + j]);
          }
          embeddings.push(embedding);
        }
      } else if (output.dims && output.dims.length === 2) {
        // 2D output: [batch_size, hidden_size] or [sequence_length, hidden_size]
        console.log(`Processing 2D output with dims: [${output.dims.join(', ')}]`);

        const dim0 = output.dims[0];
        const dim1 = output.dims[1];

        if (dim0 === texts.length) {
          // [batch_size, hidden_size] - each row is an embedding
          for (let i = 0; i < dim0; i++) {
            const embedding: number[] = [];
            const startIdx = i * dim1;

            for (let j = 0; j < dim1; j++) {
              embedding.push(output.data[startIdx + j]);
            }
            embeddings.push(embedding);
          }
        } else {
          // Single embedding case: [sequence_length, hidden_size] -> take mean
          const embedding: number[] = [];
          for (let j = 0; j < dim1; j++) {
            embedding.push(output.data[j]);
          }
          embeddings.push(embedding);
        }
      } else if (output.dims && output.dims.length === 1) {
        // 1D output: single flattened embedding
        console.log(`Processing 1D output with dims: [${output.dims.join(', ')}]`);
        const embedding = Array.from(output.data);
        embeddings.push(embedding);
      } else {
        // Fallback: try to extract embeddings from the output structure
        console.log('Using fallback embedding extraction');

        if (Array.isArray(output)) {
          return output.map((item) => Array.from(item.data || item));
        } else if (output.data) {
          // Single embedding case
          return [Array.from(output.data)];
        } else {
          throw new Error(`Unexpected output format: ${JSON.stringify(output).substring(0, 200)}...`);
        }
      }

      // Validate embeddings
      if (embeddings.length !== texts.length) {
        throw new Error(`Embedding count mismatch: expected ${texts.length}, got ${embeddings.length}`);
      }

      // Validate embedding dimensions
      const expectedDim = this.config.dimensions;
      for (let i = 0; i < embeddings.length; i++) {
        if (embeddings[i].length !== expectedDim) {
          console.warn(`Embedding ${i} has unexpected dimension: ${embeddings[i].length}, expected: ${expectedDim}`);
        }

        // Check for NaN or infinite values
        if (embeddings[i].some((val) => !isFinite(val))) {
          throw new Error(`Embedding ${i} contains invalid values (NaN or Infinity)`);
        }
      }

      // Log memory usage after processing
      const memoryAfter = this.memoryMonitor.getMemoryStats();
      const memoryDelta = memoryAfter.percentage - memoryBefore.percentage;

      console.log(
        `Successfully processed batch: ${embeddings.length} embeddings of dimension ${embeddings[0]?.length || 0} ` +
          `(Memory: ${memoryAfter.percentage.toFixed(1)}%, Δ${memoryDelta > 0 ? '+' : ''}${memoryDelta.toFixed(1)}%)`,
      );

      // Clean up intermediate variables to help with memory management
      processedTexts.length = 0; // Clear the array

      return embeddings;
    } catch (error) {
      // Log memory state on error
      const memoryOnError = this.memoryMonitor.getMemoryStats();
      console.error(`Error in processBatch (Memory: ${memoryOnError.percentage.toFixed(1)}%):`, error);

      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        // Memory-related errors
        if (
          errorMessage.includes('memory') ||
          errorMessage.includes('allocation') ||
          errorMessage.includes('out of memory')
        ) {
          throw new EmbeddingException(
            EmbeddingError.INSUFFICIENT_MEMORY,
            `Insufficient memory for batch processing: ${error.message}. Try reducing batch size or closing other applications.`,
            true,
          );
        }

        // Model or tokenization errors
        if (errorMessage.includes('tokenizer') || errorMessage.includes('model') || errorMessage.includes('pipeline')) {
          throw new EmbeddingException(
            EmbeddingError.EMBEDDING_FAILED,
            `Model processing error: ${error.message}. The model may need to be reloaded.`,
            true,
          );
        }

        // Generic embedding failure
        throw new EmbeddingException(
          EmbeddingError.EMBEDDING_FAILED,
          `Failed to process embedding batch: ${error.message}`,
          true,
        );
      }

      throw new EmbeddingException(
        EmbeddingError.EMBEDDING_FAILED,
        `Unknown error during batch processing: ${String(error)}`,
        true,
      );
    }
  }

  private getModelCachePath(): string {
    return vscode.Uri.joinPath(this.extensionContext.globalStorageUri, 'models', this.config.name).fsPath;
  }

  private async isModelCached(): Promise<boolean> {
    try {
      // Check configuration first
      const config = embeddingConfigManager.getLocalEmbeddingConfig();
      if (!config || !config.enabled) {
        return false;
      }

      // Check if model files exist in cache
      const modelPath = this.getModelCachePath();
      await vscode.workspace.fs.stat(vscode.Uri.file(modelPath));
      return true;
    } catch {
      return false;
    }
  }

  private async updateModelConfig(config: LocalEmbeddingConfig): Promise<void> {
    await embeddingConfigManager.setLocalEmbeddingConfig(config);
  }

  private async getModelConfig(): Promise<LocalEmbeddingConfig | undefined> {
    return embeddingConfigManager.getLocalEmbeddingConfig() || undefined;
  }

  private estimateTokens(text: string): number {
    // Simple token estimation (roughly 4 characters per token)
    return Math.ceil(text.length / 4);
  }

  /**
   * Create adaptive chunks based on memory constraints and text complexity
   */
  private createAdaptiveChunks(texts: string[]): string[][] {
    const chunks: string[][] = [];
    let currentChunk: string[] = [];
    let currentChunkComplexity = 0;

    // Estimate complexity based on text length and content
    const getTextComplexity = (text: string): number => {
      const baseComplexity = text.length / 100; // Base complexity from length
      const lineCount = text.split('\n').length;
      const tokenEstimate = this.estimateTokens(text);

      // Assembly code with more lines and tokens is more complex to process
      return baseComplexity + lineCount * 0.1 + tokenEstimate * 0.01;
    };

    for (const text of texts) {
      const textComplexity = getTextComplexity(text);
      const optimalBatchSize = this.memoryMonitor.getOptimalBatchSize(this.config.batchSize);

      // Check if adding this text would exceed optimal batch size or complexity threshold
      const complexityThreshold = optimalBatchSize * 2; // Adjust based on batch size

      if (
        currentChunk.length >= optimalBatchSize ||
        (currentChunk.length > 0 && currentChunkComplexity + textComplexity > complexityThreshold)
      ) {
        // Finalize current chunk
        if (currentChunk.length > 0) {
          chunks.push([...currentChunk]);
          currentChunk = [];
          currentChunkComplexity = 0;
        }
      }

      currentChunk.push(text);
      currentChunkComplexity += textComplexity;
    }

    // Add remaining texts as final chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Process a batch with retry logic for memory issues
   */
  private async processBatchWithRetry(
    texts: string[],
    chunkIndex: number,
    maxRetries: number = 2,
  ): Promise<number[][]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check memory before each attempt
        if (!this.memoryMonitor.isMemoryUsageSafe() && attempt > 0) {
          console.log(`Attempt ${attempt + 1}: Cleaning up memory before retry`);
          this.memoryMonitor.forceGarbageCollection();
          await new Promise((resolve) => setTimeout(resolve, 200)); // Wait for GC
        }

        return await this.processBatch(texts);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof EmbeddingException && error.type === EmbeddingError.INSUFFICIENT_MEMORY) {
          console.warn(`Memory error on attempt ${attempt + 1} for chunk ${chunkIndex + 1}:`, error.message);

          if (attempt < maxRetries) {
            // Try to free up memory and reduce batch size for retry
            this.memoryMonitor.forceGarbageCollection();
            await new Promise((resolve) => setTimeout(resolve, 500)); // Wait longer for memory recovery
            continue;
          }
        } else {
          // Non-memory errors should not be retried
          throw error;
        }
      }
    }

    // If all retries failed, throw the last error
    throw lastError || new Error('Unknown error during batch processing with retry');
  }

  /**
   * Process a chunk with memory recovery by splitting into smaller sub-chunks
   */
  private async processChunkWithMemoryRecovery(texts: string[]): Promise<number[][]> {
    console.log(`Attempting memory recovery for ${texts.length} texts by splitting into smaller sub-chunks`);

    // Split the chunk into smaller sub-chunks
    const subChunkSize = Math.max(1, Math.floor(texts.length / 4)); // Quarter the size
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += subChunkSize) {
      const subChunk = texts.slice(i, i + subChunkSize);

      // Force memory cleanup before each sub-chunk
      this.memoryMonitor.forceGarbageCollection();
      await new Promise((resolve) => setTimeout(resolve, 300));

      console.log(`Processing memory recovery sub-chunk: ${subChunk.length} texts`);

      try {
        const subChunkEmbeddings = await this.processBatch(subChunk);
        results.push(...subChunkEmbeddings);
      } catch (error) {
        // If even small sub-chunks fail, try processing one by one
        if (error instanceof EmbeddingException && error.type === EmbeddingError.INSUFFICIENT_MEMORY) {
          console.warn('Sub-chunk still failed, processing texts individually');

          for (const singleText of subChunk) {
            this.memoryMonitor.forceGarbageCollection();
            await new Promise((resolve) => setTimeout(resolve, 100));

            const singleEmbedding = await this.processBatch([singleText]);
            results.push(...singleEmbedding);
          }
        } else {
          throw error;
        }
      }
    }

    console.log(`Memory recovery completed: processed ${results.length} embeddings`);
    return results;
  }

  public isEnabled(): boolean {
    return this.isInitialized && this.model !== null;
  }

  public getConfig(): ModelConfig {
    return { ...this.config };
  }

  /**
   * Get the status of the local embedding model
   */
  public async getModelStatus(): Promise<{
    isDownloaded: boolean;
    isInitialized: boolean;
    config?: LocalEmbeddingConfig;
    memoryStats?: MemoryStats;
  }> {
    const config = await this.getModelConfig();
    return {
      isDownloaded: await this.isModelCached(),
      isInitialized: this.isInitialized,
      config,
      memoryStats: this.memoryMonitor.getMemoryStats(),
    };
  }

  /**
   * Get current memory statistics
   */
  public getMemoryStats(): MemoryStats {
    return this.memoryMonitor.getMemoryStats();
  }

  /**
   * Force memory cleanup (useful for external callers)
   */
  public forceMemoryCleanup(): void {
    console.log('Forcing memory cleanup on LocalEmbeddingService');
    this.memoryMonitor.forceGarbageCollection();
  }

  /**
   * Update batch processing options for memory management
   */
  public updateBatchProcessingOptions(options: Partial<BatchProcessingOptions>): void {
    this.memoryMonitor = new MemoryMonitor({
      ...this.memoryMonitor['options'],
      ...options,
    });
    console.log('Updated batch processing options:', options);
  }
}
