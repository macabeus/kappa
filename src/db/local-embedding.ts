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
      const modelPath = this.getModelCachePath();
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(modelPath));
        return true;
      } catch {
        return false;
      }
    } catch (error) {
      console.error('Error checking local embedding availability:', error);
      return false;
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized && this.model) {
      return;
    }

    try {
      await this.loadModel();
      this.isInitialized = true;
    } catch (error) {
      this.isInitialized = false;
      if (error instanceof Error) {
        throw new EmbeddingException(
          EmbeddingError.MODEL_LOAD_FAILED,
          `Failed to initialize local embedding model: ${error.message}`,
          true,
        );
      }
      throw error;
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

  private async loadModel(): Promise<void> {
    try {
      // Create the embedding pipeline
      this.model = await pipeline('feature-extraction', this.config.huggingFaceId, {
        progress_callback: (progress: any) => {
          // Progress callback for model download
          if (progress.status === 'downloading') {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            console.log(`Downloading model: ${percent}%`);
          }
        },
      });
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

  private async processBatch(texts: string[]): Promise<number[][]> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      // Generate embeddings for the batch
      const output = await this.model(texts, { pooling: 'mean', normalize: true });

      // Convert to the expected format (array of number arrays)
      const embeddings: number[][] = [];

      if (output.dims && output.dims.length === 3) {
        // Handle batch output: [batch_size, sequence_length, hidden_size]
        for (let i = 0; i < output.dims[0]; i++) {
          const embedding: number[] = [];
          for (let j = 0; j < output.dims[2]; j++) {
            embedding.push(output.data[i * output.dims[2] + j]);
          }
          embeddings.push(embedding);
        }
      } else if (output.dims && output.dims.length === 2) {
        // Handle single output: [sequence_length, hidden_size]
        const embedding: number[] = [];
        for (let i = 0; i < output.dims[1]; i++) {
          embedding.push(output.data[i]);
        }
        embeddings.push(embedding);
      } else {
        // Fallback: try to extract embeddings from the output structure
        if (Array.isArray(output)) {
          return output.map((item) => Array.from(item.data || item));
        } else if (output.data) {
          // Single embedding case
          return [Array.from(output.data)];
        }
      }

      return embeddings;
    } catch (error) {
      if (error instanceof Error && error.message.includes('memory')) {
        throw new EmbeddingException(
          EmbeddingError.INSUFFICIENT_MEMORY,
          `Insufficient memory for batch processing: ${error.message}`,
          true,
        );
      }
      throw error;
    }
  }

  private getModelCachePath(): string {
    return vscode.Uri.joinPath(this.extensionContext.globalStorageUri, 'models', this.config.name).fsPath;
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
}
