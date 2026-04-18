// Type declarations for external modules without TypeScript definitions

declare module 'tsne-js' {
  export class TSNE {
    constructor(config: {
      dim?: number;
      perplexity?: number;
      earlyExaggeration?: number;
      learningRate?: number;
      nIter?: number;
      metric?: string;
    });

    init(data: { data: number[][]; type: 'dense' | 'sparse' }): void;

    run(): void;

    getOutput(): number[][];

    getOutputScaled(): number[][];
  }
}
