/**
 * Generate a unique session ID
 * @returns A unique session ID string
 */
declare function generateSessionId(): string;
/**
 * Generate a QR code URL for the upload page
 * @param frontendUrl - Base URL of the frontend
 * @param sdkRoute - SDK route (default: '/qr-upload')
 * @param sessionId - Optional session ID
 * @returns Full URL for the QR code
 */
declare function generateQrUrl(frontendUrl: string, sdkRoute?: string, sessionId?: string): string;

interface ImageFile {
    id: string;
    previewUrl: string;
    file: File;
    status: 'pending' | 'uploading' | 'uploaded' | 'error';
    progress?: number;
    error?: string;
}
interface ApiConfig {
    url: string;
    headers?: Record<string, string>;
    body?: Record<string, any>;
}
interface QrUploadConfig {
    frontendUrl: string;
    sdkRoute?: string;
    uploadApi: ApiConfig;
    fetchApi?: ApiConfig;
    autoStartCamera?: boolean;
    maxImages?: number;
    allowedMimeTypes?: string[];
    onUploadComplete?: (response: any) => void;
    onError?: (error: Error) => void;
}

interface QRCodeGenerationOptions {
    size?: number;
    color?: string;
    backgroundColor?: string;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
}
interface IQRUploadSDK {
    init(config: Partial<QrUploadConfig>): void;
    mount(container: HTMLElement): void;
    unmount(): void;
    startCamera(): Promise<void>;
    stopCamera(): void;
    captureImage(): Promise<Blob>;
    uploadImage(file: File): Promise<any>;
    generateQrCode(options?: QRCodeGenerationOptions): Promise<string>;
}
declare class QrUpload implements IQRUploadSDK {
    private config;
    private images;
    private container;
    private sessionId;
    private isInitialized;
    private videoElement;
    private mediaStream;
    constructor(config?: QrUploadConfig);
    /**
     * Get default configuration for the QrUpload instance
     * @returns Default configuration object
     */
    private getDefaultConfig;
    /**
     * Initialize the QrUpload instance with configuration
     * @param config - Configuration options
     */
    init(config: Partial<QrUploadConfig>): void;
    /**
     * Mount the upload interface to the specified container
     * @param container - The HTML element to mount the interface to
     */
    mount(container: HTMLElement): void;
    /**
     * Unmount the upload interface
     */
    unmount(): void;
    /**
     * Start the camera
     * @returns Promise that resolves when the camera is started
     */
    startCamera(): Promise<void>;
    /**
     * Stop the camera
     */
    stopCamera(): void;
    /**
     * Capture an image from the camera
     * @returns The captured image as a Blob
     */
    captureImage(): Promise<Blob>;
    /**
     * Upload an image
     * @param file - The file to upload
     * @returns Promise that resolves when the upload is complete
     */
    uploadImage(file: File): Promise<any>;
    /**
     * Generate a URL that will be encoded in the QR code
     * @returns The URL for the QR code
     */
    generateQrUrl(): string;
    /**
     * Generate a QR code for the current session
     * @param options QR code generation options
     * @returns Promise that resolves with the QR code data URL
     */
    /**
     * Generates a QR code for the current session
     * @param options - Options for QR code generation
     * @returns Promise that resolves with the data URL of the generated QR code
     */
    generateQrCode(options?: QRCodeGenerationOptions): Promise<string>;
    private ensureInitialized;
    private handleError;
    private updateImageStatus;
    private renderInterface;
    /**
     * Render image previews with drag & drop reorder and remove buttons
     */
    private renderPreviews;
    private reorderImages;
    private removeImage;
}
declare function initQrUpload(config: QrUploadConfig): QrUpload;

declare const generateQrCode: (url: string, options?: QRCodeGenerationOptions) => Promise<string>;

export { type ApiConfig, type IQRUploadSDK, type ImageFile, type QRCodeGenerationOptions, QrUpload, type QrUploadConfig, QrUpload as default, generateQrCode, generateQrUrl, generateSessionId, initQrUpload };
