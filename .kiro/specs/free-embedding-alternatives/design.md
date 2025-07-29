# Design Document

## Overview

This design implements a local embedding model system for Kappa that provides the same functionality as the current Voyage AI integration while being completely free and privacy-preserving. The solution uses Transformers.js to run embedding models directly in the VS Code extension environment, maintaining API compatibility with the existing codebase.

## Architecture

### High-Level Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   VS Code UI    │    │  Kappa Extension │    │ Local Embedding │
│                 │    │                  │    │     Service     │
│ Command Palette │───▶│  Enable Command  │───▶│                 │
│                 │    │                  │    │ Transformers.js │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Database       │    │ Model Cache     │
                       │                  │    │                 │
                       │ Same vectors     │    │ Downloaded      │
                       │ collection as    │    │ Model Files     │
                       │ Voyage AI uses   │    │                 │
                       └──────────────────┘    └─────────────────┘

Flow: Enable Command → Download Model → Replace Voyage API calls → Store in same DB schema
```

### Component Breakdown

1. **Local Embedding Service**: Core service that manages the local embedding model
2. **Model Manager**: Handles downloading, caching, and initializing models
3. **Database Integration**: Seamless integration with existing database schema
4. **Command Handler**: VS Code command for enabling local embeddings

## Components and Interfaces

### 1. Embedding Provider Interface

```typescript
interface EmbeddingProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  initialize(): Promise<void>;
  embed(texts: string[]): Promise<number[][]>;
  cleanup(): Promise<void>;
}
```

### 2. Local Embedding Service

```typescript
class LocalEmbeddingService {
  private model: any; // Transformers.js model instance
  private isInitialized: boolean = false;

  // Drop-in replacement for the existing #getEmbedding method
  async getEmbedding(asmCodes: string[]): Promise<number[][]>;

  // Mimics Voyage AI response format exactly
  async embed(asmCodes: string[]): Promise<VoyageApiResponse>;

  private async initialize(): Promise<void>;
  private async downloadModel(): Promise<void>;
  private async loadModel(): Promise<void>;
}
```

### 3. Database Integration

The local embedding service will integrate directly with the existing database class by replacing the `#getEmbedding` method:

```typescript
// In src/db/db.ts - minimal changes needed
class Database {
  private localEmbeddingService?: LocalEmbeddingService;

  // Modified method - same signature, different implementation
  async #getEmbedding(asmCodes: string[]): Promise<number[][]> {
    if (this.localEmbeddingService?.isEnabled()) {
      return await this.localEmbeddingService.getEmbedding(asmCodes);
    }

    // Fallback to existing Voyage AI implementation
    return await this.#getVoyageEmbedding(asmCodes);
  }

  // Existing embedAsm method works unchanged
  // Existing vectorSearch method works unchanged
  // All existing database schema remains the same
}
```

### 4. Model Configuration

```typescript
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
```

## Data Models

### Existing Schema Compatibility

The local embedding service will maintain full compatibility with the existing database schema:

```typescript
// No changes to existing interfaces
interface VectorDoc {
  id: string;
  embedding: number[]; // Same format as Voyage AI
}

interface VoyageApiResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  // Local service will return this same format
}
```

### Configuration Storage

```typescript
interface LocalEmbeddingConfig {
  enabled: boolean;
  modelName: string;
  modelPath: string;
  lastUpdated: string;
  version: string;
}
```

## Error Handling

### Error Types

```typescript
enum EmbeddingError {
  MODEL_DOWNLOAD_FAILED = 'MODEL_DOWNLOAD_FAILED',
  MODEL_LOAD_FAILED = 'MODEL_LOAD_FAILED',
  EMBEDDING_FAILED = 'EMBEDDING_FAILED',
  INSUFFICIENT_MEMORY = 'INSUFFICIENT_MEMORY',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

class EmbeddingException extends Error {
  constructor(
    public type: EmbeddingError,
    message: string,
    public recoverable: boolean = true,
  ) {
    super(message);
  }
}
```

### Error Recovery Strategies

1. **Download Failures**: Retry with exponential backoff, offer manual retry
2. **Memory Issues**: Reduce batch size, suggest closing other applications
3. **Model Loading**: Clear cache and re-download, fallback to cached embeddings
4. **Runtime Errors**: Log detailed errors, continue with existing embeddings

## Testing Strategy

### Unit Tests

1. **LocalEmbeddingService Tests**

   - Model initialization
   - Embedding generation
   - Batch processing
   - Error handling

2. **Database Integration Tests**

   - Provider switching
   - Fallback behavior
   - Schema compatibility

3. **Integration Tests**
   - End-to-end embedding workflow
   - Database integration
   - Command palette integration

### Performance Tests

1. **Embedding Speed**: Compare with Voyage AI baseline
2. **Memory Usage**: Monitor memory consumption during embedding
3. **Batch Processing**: Test with various batch sizes
4. **Model Loading Time**: Measure initialization performance

### Compatibility Tests

1. **API Compatibility**: Ensure existing code works unchanged
2. **Database Schema**: Verify embedding format compatibility
3. **Similarity Search**: Compare results with Voyage AI embeddings

## Implementation Details

### Integration with Existing Workflow

The local embedding model will integrate seamlessly with the existing Kappa workflow:

1. **Command Execution**: `Kappa: Enable Local Embedding Model` downloads and initializes the model
2. **Embedding Generation**: When `database.embedAsm()` is called, it uses local model instead of Voyage AI
3. **Storage**: Embeddings are stored in the same `vectors` collection with identical schema
4. **Similarity Search**: Existing `searchSimilarFunctions()` works unchanged with local embeddings
5. **Prompt Building**: Existing prompt builder uses local embeddings transparently

### Model Selection Rationale

**Chosen Model: `Xenova/all-MiniLM-L6-v2`**

Reasons:

- **Size**: ~25MB, reasonable download size
- **Quality**: Good performance on code similarity tasks
- **Speed**: Fast inference suitable for VS Code extension
- **Compatibility**: Works well with Transformers.js
- **Dimensions**: 384-dimensional vectors (manageable size)
- **Voyage AI Compatibility**: Similar embedding quality for code similarity

### Transformers.js Integration

```typescript
import { pipeline, env } from '@xenova/transformers';

// Configure for VS Code extension environment
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = path.join(extensionContext.globalStorageUri.fsPath, 'models');
```

### Progressive Enhancement

1. **Phase 1**: Basic local embedding with command palette
2. **Phase 2**: Automatic fallback between providers
3. **Phase 3**: Model selection options
4. **Phase 4**: Performance optimizations

### Memory Management

- **Lazy Loading**: Only load model when needed
- **Memory Monitoring**: Track memory usage during embedding
- **Cleanup**: Proper disposal of model resources
- **Batch Optimization**: Adjust batch size based on available memory

### Caching Strategy

- **Model Files**: Cache in VS Code global storage
- **Embeddings**: Use existing database caching
- **Configuration**: Store in VS Code settings
- **Version Management**: Handle model updates gracefully

## Security Considerations

### Data Privacy

- **No External Transmission**: All processing happens locally
- **Model Source**: Download from trusted Hugging Face repository
- **File Permissions**: Restrict model cache to extension directory
- **Memory Security**: Clear sensitive data from memory after use

### Model Integrity

- **Checksum Verification**: Verify downloaded model integrity
- **Source Validation**: Only download from official Hugging Face models
- **Update Security**: Secure model update mechanism

## Performance Considerations

### Optimization Strategies

1. **Model Quantization**: Use quantized models for faster inference
2. **Batch Processing**: Optimize batch sizes for memory/speed balance
3. **Caching**: Cache frequently used embeddings
4. **Background Processing**: Run embedding in background threads when possible

### Expected Performance

- **Model Loading**: ~2-5 seconds initial load
- **Embedding Speed**: ~50-100 functions per second
- **Memory Usage**: ~100-200MB during active embedding
- **Storage**: ~25MB for model files

## Migration Strategy

### Backward Compatibility

- Existing Voyage AI functionality remains unchanged
- Users can switch between providers seamlessly
- Existing embeddings are preserved and compatible

### Rollout Plan

1. **Alpha**: Internal testing with local models
2. **Beta**: Limited user testing with feedback collection
3. **Release**: Full release with documentation and tutorials
4. **Post-Release**: Monitor performance and user feedback
