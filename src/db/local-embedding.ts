import * as vscode from 'vscode';
import { pipeline, env, FeatureExtractionPipeline } from '@xenova/transformers';
import { VoyageApiResponse } from './voyage';

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

export class LocalEmbeddingService implements EmbeddingProvider {
  public readonly name = 'LocalEmbedding';
  private model: FeatureExtractionPipeline | null = null;
  private isInitialized: boolean = false;
  private extensionContext: vscode.ExtensionContext;
  private config: ModelConfig;

  constructor(extensionContext: vscode.ExtensionContext, config: ModelConfig = DEFAULT_MODEL) {
    this.extensionContext = extensionContext;
    this.config = config;

    // Set custom cache directory to VS Code extension global storage
    env.customCache = this.extensionContext.globalStorageUri.fsPath;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if model is already initialized
      if (this.isInitialized && this.model) {
        return true;
      }

      // Check if model files exist in cache
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

    try {
      // Process texts in batches to manage memory
      const batchSize = this.config.batchSize;
      const results: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchEmbeddings = await this.processBatch(batch);
        results.push(...batchEmbeddings);
      }

      return results;
    } catch (error) {
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
    if (this.model) {
      // Dispose of model resources if the pipeline supports it
      try {
        // Note: Transformers.js doesn't have explicit cleanup methods,
        // but we can null the reference to help with garbage collection
        this.model = null;
        this.isInitialized = false;
      } catch (error) {
        console.warn('Error during model cleanup:', error);
      }
    }
  }

  /**
   * Drop-in replacement for the existing #getEmbedding method in Database class
   * Returns embeddings in the same format as Voyage AI
   */
  async getEmbedding(asmCodes: string[]): Promise<number[][]> {
    return await this.embed(asmCodes);
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
          normalize: true 
        });
        
        if (!testOutput || !testOutput.data) {
          throw new Error('Model test failed: no output generated');
        }
        
        console.log(`Model test successful. Output dimensions: ${testOutput.dims || 'unknown'}`);
      } catch (testError) {
        console.error('Model test failed:', testError);
        this.model = null; // Reset model on test failure
        throw new Error(`Model initialization test failed: ${testError instanceof Error ? testError.message : 'unknown error'}`);
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
        if (errorMessage.includes('network') || 
            errorMessage.includes('fetch') || 
            errorMessage.includes('connection') ||
            errorMessage.includes('timeout')) {
          throw new EmbeddingException(
            EmbeddingError.NETWORK_ERROR,
            `Network error while loading model: ${error.message}. Please check your internet connection and try again.`,
            true,
          );
        }
        
        // Memory-related errors
        if (errorMessage.includes('memory') || 
            errorMessage.includes('allocation') ||
            errorMessage.includes('out of memory')) {
          throw new EmbeddingException(
            EmbeddingError.INSUFFICIENT_MEMORY,
            `Insufficient memory to load model: ${error.message}. Try closing other applications and retry.`,
            true,
          );
        }
        
        // File system or cache-related errors
        if (errorMessage.includes('file') || 
            errorMessage.includes('path') ||
            errorMessage.includes('permission') ||
            errorMessage.includes('cache')) {
          throw new EmbeddingException(
            EmbeddingError.MODEL_LOAD_FAILED,
            `File system error while loading model: ${error.message}. The model cache may be corrupted. Try re-downloading the model.`,
            true,
          );
        }
        
        // Model format or compatibility errors
        if (errorMessage.includes('model') || 
            errorMessage.includes('pipeline') ||
            errorMessage.includes('tokenizer') ||
            errorMessage.includes('config')) {
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
   * Handles proper tokenization and embedding extraction
   */
  private async processBatch(texts: string[]): Promise<number[][]> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      console.log(`Processing batch of ${texts.length} texts`);
      
      // Preprocess texts for better assembly code handling
      const processedTexts = texts.map(text => {
        // Trim whitespace and ensure text is not empty
        const trimmed = text.trim();
        return trimmed || 'empty_assembly_function';
      });

      // Generate embeddings with proper configuration for assembly code
      const output = await this.model(processedTexts, { 
        pooling: 'mean',        // Use mean pooling for sentence-level embeddings
        normalize: true,        // Normalize embeddings for better similarity computation
      });

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
        if (embeddings[i].some(val => !isFinite(val))) {
          throw new Error(`Embedding ${i} contains invalid values (NaN or Infinity)`);
        }
      }

      console.log(`Successfully processed batch: ${embeddings.length} embeddings of dimension ${embeddings[0]?.length || 0}`);
      return embeddings;
      
    } catch (error) {
      console.error('Error in processBatch:', error);
      
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        
        // Memory-related errors
        if (errorMessage.includes('memory') || 
            errorMessage.includes('allocation') ||
            errorMessage.includes('out of memory')) {
          throw new EmbeddingException(
            EmbeddingError.INSUFFICIENT_MEMORY,
            `Insufficient memory for batch processing: ${error.message}. Try reducing batch size or closing other applications.`,
            true,
          );
        }
        
        // Model or tokenization errors
        if (errorMessage.includes('tokenizer') || 
            errorMessage.includes('model') ||
            errorMessage.includes('pipeline')) {
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
      const modelPath = this.getModelCachePath();
      await vscode.workspace.fs.stat(vscode.Uri.file(modelPath));
      return true;
    } catch {
      return false;
    }
  }

  private async updateModelConfig(config: LocalEmbeddingConfig): Promise<void> {
    const configKey = 'localEmbeddingConfig';
    await this.extensionContext.globalState.update(configKey, config);
  }

  private async getModelConfig(): Promise<LocalEmbeddingConfig | undefined> {
    const configKey = 'localEmbeddingConfig';
    return this.extensionContext.globalState.get<LocalEmbeddingConfig>(configKey);
  }

  private estimateTokens(text: string): number {
    // Simple token estimation (roughly 4 characters per token)
    return Math.ceil(text.length / 4);
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
  }> {
    const config = await this.getModelConfig();
    return {
      isDownloaded: await this.isModelCached(),
      isInitialized: this.isInitialized,
      config,
    };
  }
}
