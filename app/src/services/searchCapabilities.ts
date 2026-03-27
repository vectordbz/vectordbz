import {
  SearchCapabilities,
  DEFAULT_SEARCH_CAPABILITIES,
  CollectionSchema,
  FusionStrategy,
} from '../types';

/**
 * Derives capability flags from collection schema (e.g. multiple vectors, sparse field, searchable text).
 */
export function getSchemaDerivedCapabilities(
  schema: CollectionSchema | null | undefined
): Partial<SearchCapabilities> {
  if (!schema) {
    return {};
  }
  const vectors = schema.vectors ?? {};
  const fields = schema.fields ?? {};
  const vectorValues = Object.values(vectors);
  const hasSparseVectorField = vectorValues.some((v) => v.vectorType === 'sparse');
  const hasSearchableTextFields = Object.values(fields).some((f) => f.searchable === true);
  const multipleVectorFields = schema.multipleVectors === true;

  return {
    multipleVectorFields,
    hasSparseVectorField,
    hasSearchableTextFields,
  };
}

function mergeFusionStrategies(
  defaultStrategies: FusionStrategy[],
  dbStrategies?: FusionStrategy[]
): FusionStrategy[] {
  if (dbStrategies && dbStrategies.length > 0) {
    return [...new Set([...defaultStrategies, ...dbStrategies])];
  }
  return defaultStrategies;
}

/**
 * Merges default capabilities + schema-derived + DB-specific overrides.
 * Clients call this with their Partial<SearchCapabilities> and the collection schema.
 */
export function mergeWithDefault(
  dbPartial: Partial<SearchCapabilities>,
  schema?: CollectionSchema | null
): SearchCapabilities {
  const schemaDerived = getSchemaDerivedCapabilities(schema ?? null);
  const merged: SearchCapabilities = {
    ...DEFAULT_SEARCH_CAPABILITIES,
    ...schemaDerived,
    ...dbPartial,
    fusionStrategies: mergeFusionStrategies(
      DEFAULT_SEARCH_CAPABILITIES.fusionStrategies,
      dbPartial.fusionStrategies
    ),
  };
  return merged;
}
