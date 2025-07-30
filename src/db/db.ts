import * as vscode from 'vscode';
import { createRxDatabase, RxCollection, RxDatabase, RxCollectionCreator, RxDocument } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { cosineSimilarity } from 'rxdb/plugins/vector';
import { VoyageApiResponse } from './voyage';
import { getVoyageApiKey } from '../configurations/workspace-configs';
import { checkFileExists, getRelativePath, getWorkspaceRoot } from '../utils/vscode-utils';
import { extractFunctionCallsFromAssembly } from '../utils/asm-utils';
import { LocalEmbeddingService } from './local-embedding';
import { embeddingConfigManager, EmbeddingProviderStatus } from '../configurations/embedding-config';

export type DecompFunctionDoc = {
  id: string;
  name: string;
  cCode?: string;
  cModulePath?: string;
  asmCode: string;
  asmModulePath: string;
  callsFunctions: string[];
};
export type DecompFunction = Omit<DecompFunctionDoc, 'callsFunctions'> & {
  callsFunctions: DecompFunctionDoc[];
};

export interface VectorDoc {
  id: string;
  embedding: number[];
}

export interface VectorSearchResult {
  decompFunction: DecompFunction;
  similarity: number;
}

type KappaRxDatabase = RxDatabase<{
  decompFunctions: RxCollection<DecompFunctionDoc>;
  vectors: RxCollection<VectorDoc>;
}>;

class Database {
  #db: Promise<KappaRxDatabase>;
  private localEmbeddingService?: LocalEmbeddingService;

  constructor() {
    this.#db = this.#initializeDb();
  }

  /**
   * Initialize local embedding service
   * This should be called during extension activation to set up the local embedding capability
   */
  initializeLocalEmbedding(extensionContext: vscode.ExtensionContext): void {
    try {
      this.localEmbeddingService = new LocalEmbeddingService(extensionContext);
      console.log('Local embedding service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize local embedding service:', error);
      // Don't throw here - let the system continue with Voyage AI only
      this.localEmbeddingService = undefined;
    }
  }

  /**
   * Check if local embedding is enabled and available
   */
  async isLocalEmbeddingEnabled(): Promise<boolean> {
    // Check configuration first
    if (!embeddingConfigManager.isLocalEmbeddingEnabled()) {
      return false;
    }

    // Check if service is available
    if (!this.localEmbeddingService) {
      return false;
    }

    return await this.localEmbeddingService.isAvailable();
  }

  /**
   * Get the user's preferred embedding provider
   */
  private getEmbeddingProvider(): 'voyage' | 'local' {
    return embeddingConfigManager.getEmbeddingProvider();
  }

  /**
   * Get the current status of embedding providers
   */
  async getEmbeddingProviderStatus(): Promise<EmbeddingProviderStatus> {
    const configStatus = await embeddingConfigManager.getEmbeddingProviderStatus();

    // Enhance with runtime availability check for local embedding
    const localRuntimeAvailable = await this.isLocalEmbeddingEnabled();

    // Update active provider based on runtime availability
    let activeProvider = configStatus.activeProvider;
    if (configStatus.preferred === 'local' && !localRuntimeAvailable) {
      // If local is preferred but not available at runtime, fallback
      activeProvider = configStatus.voyageAvailable ? 'voyage' : 'none';
    }

    return {
      ...configStatus,
      localAvailable: localRuntimeAvailable,
      activeProvider,
    };
  }

  async #initializeDb(): Promise<KappaRxDatabase> {
    try {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        console.error('No workspace root found, cannot initialize Kappa');

        // Create a dummy promise to avoid unhandled rejection
        return new Promise(() => null);
      }

      const db: KappaRxDatabase = await createRxDatabase({
        name: 'kappa-db',
        storage: getRxStorageMemory(),
      });

      // Schema for functions
      const decompFunctionSchema: RxCollectionCreator<DecompFunctionDoc> = {
        schema: {
          version: 0,
          primaryKey: 'id',
          type: 'object',
          properties: {
            id: {
              type: 'string',
              maxLength: 100,
            },
            name: {
              type: 'string',
            },
            cCode: {
              type: 'string',
            },
            cModulePath: {
              type: 'string',
            },
            asmCode: {
              type: 'string',
            },
            asmModulePath: {
              type: 'string',
            },
            callsFunctions: {
              type: 'array',
              ref: 'decompFunctions',
              items: {
                type: 'string',
              },
            },
          },
          required: ['id', 'name', 'asmCode', 'asmModulePath', 'callsFunctions'],
        },
      };

      // Schema for vector embeddings
      const vectorSchema: RxCollectionCreator<VectorDoc> = {
        schema: {
          version: 0,
          primaryKey: 'id',
          type: 'object',
          properties: {
            id: {
              type: 'string',
              maxLength: 100,
            },
            embedding: {
              type: 'array',
              items: {
                type: 'number',
              },
            },
          },
          required: ['id', 'embedding'],
        },
      };

      // Create collections
      await db.addCollections({
        decompFunctions: decompFunctionSchema,
        vectors: vectorSchema,
      });

      // Check if the database dump file exists
      const filePath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'kappa-db.json');
      const databaseDumpExists = await checkFileExists(filePath.fsPath);
      if (!databaseDumpExists) {
        console.log('No existing database dump found, starting with an empty database');
        return db;
      }

      // If the dump file exists, read it and populate the database
      const content = await vscode.workspace.fs.readFile(filePath);
      const dump = JSON.parse(new TextDecoder().decode(content));

      const decompFunctionsCollection = db.collections.decompFunctions;
      const vectorCollection = db.collections.vectors;

      await decompFunctionsCollection.bulkUpsert(dump.decompFunctions);
      await vectorCollection.bulkUpsert(dump.vectors);

      return db;
    } catch (error) {
      vscode.window.showErrorMessage('Failed to initialize the database for Kappa');
      console.error('Failed to initialize the database for Kappa:', error);
      throw error;
    }
  }

  async embedAsm(progressReport: (currentBatch: number, totalBatches: number) => void): Promise<void> {
    const db = await this.#db;

    // Get all function IDs that already have vectors
    const vectorCollection = db.collections.vectors;
    const existingVectorIds = await vectorCollection.find().exec();
    const existingIds = new Set(existingVectorIds.map((doc) => doc.id));

    // Get only functions that don't have corresponding vectors
    const allFunctions = await db.collections.decompFunctions.find().exec();
    const allAsmCodes = allFunctions.filter((func) => !existingIds.has(func.primary));

    const batchSize = 25;
    const totalBatches = Math.ceil(allAsmCodes.length / batchSize);

    for (let i = 0; i < allAsmCodes.length; i += batchSize) {
      const currentBatch = Math.floor(i / batchSize) + 1;
      progressReport(currentBatch, totalBatches);

      const batch = allAsmCodes.slice(i, i + batchSize);
      const asmCodes = batch.map((doc) => doc.asmCode);
      const embeddings = await this.#getEmbedding(asmCodes);

      const vectorDocs = batch.map((doc, index) => {
        const embedding = embeddings[index];
        const vectorDoc: VectorDoc = {
          id: doc.primary,
          embedding,
        };
        return vectorDoc;
      });

      const vectors = db.collections.vectors;
      await vectors.bulkUpsert(vectorDocs);

      await this.dumpDatabase();
    }
  }

  async #getEmbedding(asmCodes: string[]): Promise<number[][]> {
    const preferredProvider = this.getEmbeddingProvider();

    // Try local embedding first if preferred or if it's the only available option
    if (preferredProvider === 'local' || (preferredProvider === 'voyage' && !getVoyageApiKey())) {
      if (this.localEmbeddingService && (await this.localEmbeddingService.isAvailable())) {
        try {
          console.log(`Using local embedding service for ${asmCodes.length} assembly functions`);
          return await this.localEmbeddingService.getEmbedding(asmCodes);
        } catch (error) {
          console.error('Local embedding failed:', error);

          // If user explicitly chose local, don't fallback - throw the error
          if (preferredProvider === 'local') {
            throw new Error(
              `Local embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please check the model status or switch to Voyage AI in settings.`,
            );
          }

          // If we were trying local as fallback for missing Voyage key, continue to Voyage error
          console.log('Local embedding failed, attempting Voyage AI fallback...');
        }
      } else if (preferredProvider === 'local') {
        // User explicitly chose local but it's not available
        throw new Error(
          'Local embedding model not available. The model needs to be downloaded first. Use the "Kappa: Enable Local Embedding Model" command or switch to Voyage AI in settings.',
        );
      }
    }

    // Use Voyage AI (either as preference or as fallback)
    try {
      console.log(`Using Voyage AI embedding service for ${asmCodes.length} assembly functions`);
      return await this.#getVoyageEmbedding(asmCodes);
    } catch (error) {
      // If Voyage fails and local is available, try local as final fallback
      if (this.localEmbeddingService && (await this.localEmbeddingService.isAvailable())) {
        console.log('Voyage AI failed, attempting local embedding fallback...');
        try {
          return await this.localEmbeddingService.getEmbedding(asmCodes);
        } catch (localError) {
          console.error('Both Voyage AI and local embedding failed:', { voyageError: error, localError });
          throw new Error(
            `Both embedding services failed. Voyage AI: ${error instanceof Error ? error.message : 'Unknown error'}. Local: ${localError instanceof Error ? localError.message : 'Unknown error'}`,
          );
        }
      }

      // No fallback available, throw original Voyage error
      throw error;
    }
  }

  async #getVoyageEmbedding(asmCodes: string[]): Promise<number[][]> {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getVoyageApiKey()}`,
      },
      body: JSON.stringify({
        input: asmCodes,
        model: 'voyage-code-3',
        input_type: 'document',
      }),
    });

    if (!response.ok) {
      throw new Error(`Voyage AI API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as VoyageApiResponse;
    return data.data.map((item) => item.embedding);
  }

  /**
   * Add an assembly function to the database
   */
  async addFunction(func: {
    name: string;
    cCode?: string;
    asmCode: string;
    cModulePath?: string;
    asmModulePath: string;
  }): Promise<string> {
    const db = await this.#db;

    const id = `id:${func.name}`;

    const callsFunctions = extractFunctionCallsFromAssembly(func.asmCode).map((call) => `id:${call}`);

    await db.collections.decompFunctions.upsert({
      id,
      name: func.name,
      cCode: func.cCode,
      asmCode: func.asmCode,
      cModulePath: func.cModulePath && getRelativePath(func.cModulePath),
      asmModulePath: getRelativePath(func.asmModulePath),
      callsFunctions,
    });

    return id;
  }

  /**
   * Search for similar assembly functions using vector similarity
   */
  async searchSimilarFunctions(func: DecompFunction, limit = 10, threshold = 0.5): Promise<VectorSearchResult[]> {
    const db = await this.#db;

    const vector = await db.collections.vectors.findOne(func.id).exec();

    if (!vector) {
      return [];
    }

    return this.#vectorSearch(vector.embedding, limit, threshold);
  }

  /**
   * Optimized vector search using index range method
   */
  async #vectorSearch(searchEmbedding: number[], limit: number, threshold: number): Promise<VectorSearchResult[]> {
    const db = await this.#db;

    const vectorCollection = db.collections.vectors;
    const assemblyCollection = db.collections.decompFunctions;

    // Get all vector documents
    const allVectorDocs = await vectorCollection.find().exec();

    // Calculate similarities and filter by threshold
    const similarities: Array<{ id: string; similarity: number }> = [];

    for (const vectorDoc of allVectorDocs) {
      const func = await this.getFunctionById(vectorDoc.id);
      if (!func?.cCode) {
        continue;
      }

      const similarity = cosineSimilarity(searchEmbedding, vectorDoc.embedding);

      if (similarity >= threshold) {
        similarities.push({
          id: vectorDoc.id,
          similarity,
        });
      }
    }

    // Sort by similarity (highest first) and limit results
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topSimilarities = similarities.slice(0, limit);

    // Get the corresponding assembly function documents
    const results: VectorSearchResult[] = [];

    for (const { id, similarity } of topSimilarities) {
      const decompFunction = await this.getFunctionById(id);
      if (decompFunction) {
        results.push({
          decompFunction,
          similarity,
        });
      }
    }

    return results;
  }

  /**
   * Get a function by ID
   */
  async getFunctionById(id: string): Promise<DecompFunction | null> {
    const db = await this.#db;

    const doc = await db.collections.decompFunctions.findOne(id).exec();
    if (!doc) {
      return null;
    }

    const decompFunction: DecompFunction = {
      id: doc.id,
      name: doc.name,
      cCode: doc.cCode,
      cModulePath: doc.cModulePath,
      asmCode: doc.asmCode,
      asmModulePath: doc.asmModulePath,
      callsFunctions: await doc.populate('callsFunctions'),
    };

    return decompFunction;
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalFunctions: number;
    totalDecompiledFunctions: number;
    totalNotDecompiledFunctions: number;
    totalVectors: number;
  }> {
    const db = await this.#db;

    const assemblyCollection = db.collections.decompFunctions;
    const vectorCollection = db.collections.vectors;

    const totalFunctions = await assemblyCollection.count().exec();
    const totalDecompiledFunctions = (await assemblyCollection.find({ selector: { cCode: { $exists: true } } }).exec())
      .length;
    const totalNotDecompiledFunctions = (
      await assemblyCollection.find({ selector: { cCode: { $exists: false } } }).exec()
    ).length;
    const totalVectors = await vectorCollection.count().exec();

    return {
      totalFunctions,
      totalDecompiledFunctions,
      totalNotDecompiledFunctions,
      totalVectors,
    };
  }

  async dumpDatabase(): Promise<void> {
    const db = await this.#db;

    const allDecompFunctions = await db.collections.decompFunctions.find().exec();
    const allVectors = await db.collections.vectors.find().exec();

    const dump = {
      decompFunctions: allDecompFunctions.map((doc) => doc.toJSON()),
      vectors: allVectors.map((doc) => doc.toJSON()),
    };

    const filePath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'kappa-db.json');
    await vscode.workspace.fs.writeFile(filePath, Buffer.from(JSON.stringify(dump, null, 2), 'utf-8'));
  }

  getDatabase(): Promise<KappaRxDatabase> {
    return this.#db;
  }
}

export const database = new Database();
