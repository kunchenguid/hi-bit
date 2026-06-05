/** Progress while the local voice (Whisper) model downloads on first use. */
export type VoiceDownloadProgress = {
  /** The model file currently downloading, relative to the model dir. */
  file: string;
  /** 0-based index of the file among the ones that needed downloading. */
  fileIndex: number;
  /** How many files needed downloading this run. */
  fileCount: number;
  /** Overall fraction across all files this run, 0..1. */
  fraction: number;
};

/** Whether the local voice model is fully present on disk. */
export type VoiceStatus = { modelReady: boolean };
