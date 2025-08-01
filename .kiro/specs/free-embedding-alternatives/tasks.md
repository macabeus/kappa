# Implementation Plan

- [x] 1. Set up local embedding infrastructure

  - Install and configure Transformers.js dependency for local model execution
  - Create LocalEmbeddingService class with same interface as Voyage AI
  - _Requirements: 1.2, 2.1, 2.2_

- [x] 2. Implement model download and initialization

  - [x] 2.1 Create model download functionality with progress tracking

    - Write downloadModel method that fetches Xenova/all-MiniLM-L6-v2 from Hugging Face
    - Implement progress reporting during model download
    - Store model files in VS Code extension global storage directory
    - _Requirements: 1.2, 1.4, 5.2_

  - [x] 2.2 Implement model loading and initialization
    - Write loadModel method that initializes Transformers.js pipeline
    - Configure model for embedding generation with proper tokenization
    - Add error handling for model loading failures
    - _Requirements: 2.1, 6.2, 6.4_

- [x] 3. Create embedding generation functionality

  - [x] 3.1 Implement getEmbedding method with Voyage AI compatibility

    - Write embedding generation that processes assembly code strings
    - Return embeddings in same format as Voyage AI (number[][] arrays)
    - Handle batch processing of 25 functions like existing implementation
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Add batch processing and memory management
    - Implement efficient batch processing for multiple assembly functions
    - Add memory monitoring and cleanup after embedding generation
    - Handle large batches by splitting into smaller chunks if needed
    - _Requirements: 2.2, 4.1, 4.3_

- [x] 4. Integrate with existing database system

  - [x] 4.1 Modify Database class to support local embeddings

    - Update #getEmbedding method to use LocalEmbeddingService when enabled
    - Maintain fallback to Voyage AI when local model is not available
    - Ensure existing embedAsm method works unchanged with local embeddings
    - _Requirements: 2.1, 2.4, 6.3_

  - [x] 4.2 Add configuration management for embedding provider
    - Create settings to track which embedding provider is active
    - Store local model status and configuration in VS Code settings
    - Add methods to check if local embedding is enabled and available
    - _Requirements: 2.4, 5.1, 5.3_

- [x] 5. Create command palette integration

  - [x] 5.1 Add "Enable Local Embedding Model" command

    - Register new command in package.json contributes.commands section
    - Create command handler that triggers model download and initialization
    - Show progress notification during model setup process
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 5.2 Implement command execution workflow
    - Write command handler that downloads model with progress feedback
    - Initialize LocalEmbeddingService and verify it works correctly
    - Update configuration to enable local embeddings after successful setup
    - Display success message when local embedding model is ready
    - _Requirements: 1.2, 1.4, 5.3_

- [x] 6. Fix embedding configuration to use decomp.yaml

  - [x] 6.1 Update decomp.yaml schema to include embedding configuration

    - Add embeddingProvider field to kappa tools section
    - Add localEmbedding configuration with enabled and modelName fields
    - Update createDecompYaml to include default embedding configuration
    - _Requirements: Per-project consistency, team collaboration_

  - [x] 6.2 Migrate EmbeddingConfigManager from VS Code settings to decomp.yaml
    - Update all configuration methods to read from decomp.yaml instead of VS Code settings
    - Keep VS Code settings only for API keys (voyageApiKey) as sensitive information
    - Update all async method signatures for configuration access
    - _Requirements: Per-project consistency, team collaboration_

  - [x] 6.3 Update database and local embedding service integration
    - Update database class to use async configuration methods
    - Update local embedding service to read configuration from decomp.yaml
    - Update command handlers to use async configuration access
    - _Requirements: Per-project consistency, team collaboration_

- [x] 7. Add error handling and user feedback

  - [x] 7.1 Implement comprehensive error handling

    - Add try-catch blocks around model download and initialization
    - Create specific error types for different failure scenarios
    - Implement retry logic for network-related download failures
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 7.2 Add user feedback and status reporting
    - Show clear progress during model download with estimated time
    - Display informative error messages when operations fail
    - Add status indicators to show when local embedding is active
    - Provide troubleshooting guidance for common issues
    - _Requirements: 5.1, 5.2, 5.3, 6.1_

- [x] 8. Create unit tests for local embedding functionality

  - [x] 8.1 Write tests for LocalEmbeddingService

    - Test model initialization and embedding generation
    - Test batch processing with various input sizes
    - Test error handling for model failures and network issues
    - _Requirements: 2.1, 2.2, 4.1_

  - [x] 8.2 Write integration tests for database integration
    - Test that local embeddings integrate correctly with existing database
    - Verify that similarity search works with locally generated embeddings
    - Test fallback behavior when local model is unavailable
    - _Requirements: 2.4, 4.1, 6.3_

- [x] 9. Add documentation and user guidance

  - [x] 9.1 Update README with local embedding instructions

    - Document the new "Enable Local Embedding Model" command
    - Explain benefits of local vs cloud embedding options
    - Add troubleshooting section for common local embedding issues
    - _Requirements: 5.1, 5.3, 6.1_

  - [x] 9.2 Add inline help and tooltips
    - Add helpful descriptions to command palette entries
    - Include tooltips explaining local embedding benefits
    - Provide guidance on when to use local vs cloud embeddings
    - _Requirements: 5.1, 5.2_
