/**
 * Type declarations for essentia.js
 */

declare module 'essentia.js' {
  interface EssentiaInstance {
    arrayToVector: (arr: Float32Array) => any;
    vectorToArray: (vec: any) => Float32Array;

    // Algorithms
    RhythmExtractor: (signal: any) => { bpm: number; confidence: number };
    KeyExtractor: (signal: any) => { key: string; scale: string; strength: number };
    Loudness: (signal: any) => { loudness: number };
    Energy: (signal: any) => { energy: number };
    DynamicComplexity: (signal: any) => { dynamicComplexity: number; loudness: number };
    Danceability: (signal: any) => { danceability: number };
    SpectralCentroidTime: (signal: any) => { spectralCentroid: number };
    ZeroCrossingRate: (signal: any) => { zeroCrossingRate: number };
    MFCC: (signal: any, options?: { numberCoefficients?: number }) => { mfcc: Float32Array[] };
  }

  // The default export is a Promise that resolves to a constructor
  const EssentiaWASM: Promise<new () => EssentiaInstance>;
  export default EssentiaWASM;
}
