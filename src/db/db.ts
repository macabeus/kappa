import * as vscode from 'vscode';
import { createRxDatabase, RxCollection, RxDatabase, RxCollectionCreator, RxDocument } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { cosineSimilarity } from 'rxdb/plugins/vector';
import { VoyageApiResponse } from './voyage';
import { getVoyageApiKey } from '../configurations/workspace-configs';
import { checkFileExists, getRelativePath, getWorkspaceUri } from '../utils/vscode-utils';
import { extractFunctionCallsFromAssembly } from '../utils/asm-utils';

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

  constructor() {
    this.#db = this.#initializeDb();
  }

  async #initializeDb(): Promise<KappaRxDatabase> {
    try {
      const workspaceUri = getWorkspaceUri();

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
      const filePath = vscode.Uri.joinPath(workspaceUri, 'kappa-db.json');
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

    const workspaceUri = getWorkspaceUri();
    const filePath = vscode.Uri.joinPath(workspaceUri, 'kappa-db.json');
    await vscode.workspace.fs.writeFile(filePath, Buffer.from(JSON.stringify(dump, null, 2), 'utf-8'));
  }

  getDatabase(): Promise<KappaRxDatabase> {
    return this.#db;
  }
}

export const database = new Database();
