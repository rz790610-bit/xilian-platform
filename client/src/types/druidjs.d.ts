declare module '@saehrimnir/druidjs' {
  export class Matrix {
    static from(data: number[][]): Matrix;
    to2dArray: number[][];
  }
  
  export class TSNE {
    constructor(matrix: Matrix, options?: {
      perplexity?: number;
      epsilon?: number;
      d?: number;
    });
    next(): void;
    transform(): Matrix;
  }
  
  export class PCA {
    constructor(matrix: Matrix, components?: number);
    transform(): Matrix;
  }
  
  export class UMAP {
    constructor(matrix: Matrix, options?: {
      n_neighbors?: number;
      min_dist?: number;
      d?: number;
    });
    transform(): Matrix;
  }
}
