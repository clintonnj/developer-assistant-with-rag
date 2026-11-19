import type { Chunk } from "./types.ts";
import { slugify } from "./text.ts";

interface UseCase {
  name: string;
  definition: string;
}

interface KnowledgeWithUseCases {
  documentation: { useCases: UseCase[] };
}

export function chunkUseCases(knowledge: KnowledgeWithUseCases): Chunk[] {
  return knowledge.documentation.useCases.map((useCase) => ({
    sourceType: "usecase",
    sourceId: slugify(useCase.name),
    title: useCase.name,
    text: `${useCase.name}: ${useCase.definition}`,
    metadata: {},
  }));
}
