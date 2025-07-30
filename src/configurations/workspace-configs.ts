import { embeddingConfigManager } from './embedding-config';

export function getVoyageApiKey(): string {
  return embeddingConfigManager.getVoyageApiKey();