export interface ImageFile {
  id: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  progress?: number;
  error?: string;
}

export interface ApiConfig {
  url: string;
  headers?: Record<string, string>;
}

export interface PollingCallbacks {
  onPollingStart?: () => void;
  onPollingStop?: () => void;
  onPollingError?: (error: Error) => void;
  onNewImages?: (images: any[]) => void;
}

export interface QrUploadConfig {
  frontendUrl: string;
  sdkRoute?: string;
  uploadApi: ApiConfig;
  fetchApi?: ApiConfig;
  autoStartCamera?: boolean;
  pollingInterval?: number;
  maxImages?: number;
  allowedMimeTypes?: string[];
  polling?: PollingCallbacks;
  onError?: (error: Error) => void;
}

export interface IQRUploadSDK {
  init(config: Partial<QrUploadConfig>): void;
  mount(container: HTMLElement): void;
  unmount(): void;
  startCamera(): Promise<void>;
  stopCamera(): void;
  captureImage(): Promise<Blob>;
  uploadImage(file: File): Promise<any>;
  generateQrCode(options?: QRCodeGenerationOptions): Promise<string>;
  startPolling(): boolean;
  stopPolling(): boolean;
  isPollingActive(): boolean;
}

export interface QRCodeGenerationOptions {
  size?: number;
  color?: string;
  backgroundColor?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
}
