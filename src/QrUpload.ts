// Core types
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

// Import utilities
import { generateQrCode, generateQrUrl, generateSessionId } from './utils/qr';

// Export types
export type { ImageFile, ApiConfig, QrUploadConfig };

// Add QR code options type
export interface QRCodeGenerationOptions {
    size?: number;
    color?: string;
    backgroundColor?: string;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
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
}

export class QrUpload implements IQRUploadSDK {
    private config: QrUploadConfig;
    private images: ImageFile[] = [];
    private container: HTMLElement | null = null;
    private sessionId: string = '';
    private isInitialized: boolean = false;
    private videoElement: HTMLVideoElement | null = null;
    private mediaStream: MediaStream | null = null;

    constructor(config?: QrUploadConfig) {
        this.config = config || this.getDefaultConfig();
        this.sessionId = generateSessionId();
    }

    /**
     * Get default configuration for the QrUpload instance
     * @returns Default configuration object
     */
    private getDefaultConfig(): QrUploadConfig {
        return {
            frontendUrl: typeof window !== 'undefined' ? window.location.origin : '',
            sdkRoute: '/qr-upload',
            uploadApi: {
                url: '/api/upload',
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            },
            fetchApi: {
                url: '/api/fetch',
            },
            autoStartCamera: true,
            maxImages: 10,
            allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        };
    }

    /**
     * Initialize the QrUpload instance with configuration
     * @param config - Configuration options
     */
    public init(config: Partial<QrUploadConfig>): void {
        this.config = { ...this.getDefaultConfig(), ...config };
        this.sessionId = generateSessionId();
        this.isInitialized = true;
    }

    /**
     * Mount the upload interface to the specified container
     * @param container - The HTML element to mount the interface to
     */
    public mount(container: HTMLElement): void {
        if (!this.isInitialized) {
            throw new Error('QrUpload must be initialized with init() before mounting');
        }

        this.container = container;
        this.renderInterface();

        if (this.config.autoStartCamera) {
            this.startCamera().catch(error => {
                console.warn('Failed to start camera automatically:', error);
            });
        }
    }

    /**
     * Unmount the upload interface
     */
    public unmount(): void {
        this.stopCamera();
        if (this.container) {
            this.container.innerHTML = '';
            this.container = null;
        }
    }

    /**
     * Start the camera
     * @returns Promise that resolves when the camera is started
     */
    public async startCamera(): Promise<void> {
        this.ensureInitialized();

        if (this.mediaStream) {
            return; // Already started
        }

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false,
            });

            if (this.videoElement) {
                this.videoElement.srcObject = this.mediaStream;
                await this.videoElement.play();
            }
        } catch (error) {
            this.handleError(new Error(`Failed to start camera: ${error instanceof Error ? error.message : String(error)}`));
            throw error;
        }
    }

    /**
     * Stop the camera
     */
    public stopCamera(): void {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
    }

    /**
     * Capture an image from the camera
     * @returns The captured image as a Blob
     */
    public async captureImage(): Promise<Blob> {
        this.ensureInitialized();

        if (!this.videoElement) {
            throw new Error('Video element not initialized');
        }

        const canvas = document.createElement('canvas');
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Could not get canvas context');
        }

        ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to capture image'));
                }
            }, 'image/jpeg', 0.9);
        });
    }

    /**
     * Upload an image
     * @param file - The file to upload
     * @returns Promise that resolves when the upload is complete
     */
    public async uploadImage(file: File): Promise<any> {
        this.ensureInitialized();

        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch(this.config.uploadApi.url, {
                method: "POST",
                headers: this.config.uploadApi.headers,
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`Upload failed with status ${response.status}`);
            }

            const result = await response.json();

            // ✅ Remove the image from previews on success
            this.images = this.images.filter(img => img.file !== file);

            if (this.config.onUploadComplete) {
                this.config.onUploadComplete(result);
            }

            return result;
        } catch (error) {
            const img = this.images.find(i => i.file === file);
            if (img) img.status = "error";

            this.handleError(error instanceof Error ? error : new Error(String(error)));
            throw error;
        } finally {
            this.renderPreviews();
        }
    }






    /**
     * Generate a URL that will be encoded in the QR code
     * @returns The URL for the QR code
     */
    public generateQrUrl(): string {
        this.ensureInitialized();

        return generateQrUrl(
            this.config.frontendUrl,
            this.config.sdkRoute || '/qr-upload',
            this.sessionId
        );
    }

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
    public async generateQrCode(options: QRCodeGenerationOptions = {}): Promise<string> {
        this.ensureInitialized();
        const url = this.generateQrUrl();

        return generateQrCode(url, {
            size: options.size ?? 200,
            color: options.color ?? '#000000',
            backgroundColor: options.backgroundColor ?? '#ffffff',
            errorCorrectionLevel: options.errorCorrectionLevel ?? 'H',
            margin: options.margin ?? 1,
        });
    }

    // Private helper methods
    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new Error('QrUpload must be initialized with init() before use');
        }
    }

    private handleError(error: Error): void {
        console.error('QrUpload Error:', error);
        if (this.config.onError) {
            this.config.onError(error);
        }
    }

    private updateImageStatus(
        imageId: string,
        status: 'pending' | 'uploading' | 'uploaded' | 'error',
        data?: { progress?: number },
        error?: string
    ): void {
        const image = this.images.find(img => img.id === imageId);
        if (image) {
            image.status = status;
            if (data?.progress !== undefined) {
                image.progress = data.progress;
            }
            if (error) {
                image.error = error;
            }
            this.renderInterface();
        }
    }

    private renderInterface(): void {
        if (!this.container) return;

        this.container.innerHTML = `

      
          <div class="qr-upload-layout">
            <!-- Camera Placeholder -->
            <div class="camera-section">
              <video class="camera-preview" autoplay playsinline></video>
              <button class="shutter-btn"></button>
            </div>
      
            <!-- Uploads Section -->
            <div class="uploads-section">
              <div class="preview-container">
                <div class="placeholder">
                  <p>No images uploaded yet</p>
                </div>
              </div>
              <button class="upload-btn">Upload All</button>
            </div>
          </div>
        `;

        this.videoElement = this.container.querySelector('.camera-preview') as HTMLVideoElement | null;

        // Capture button handler
        // Capture button handler
        const captureBtn = this.container.querySelector('.shutter-btn');
        captureBtn?.addEventListener("click", async () => {
            try {
                const blob = await this.captureImage();
                const file = new File([blob], `capture-${Date.now()}.jpg`, {
                    type: "image/jpeg",
                });

                const imageFile: ImageFile = {
                    id: crypto.randomUUID(),
                    previewUrl: URL.createObjectURL(file),
                    file,
                    status: "pending",
                };

                this.images.push(imageFile);
                this.renderPreviews();
            } catch (error) {
                this.handleError(error instanceof Error ? error : new Error(String(error)));
            }
        });

        // Upload all handler
        const uploadBtn = this.container.querySelector(".upload-btn");
        uploadBtn?.addEventListener("click", async () => {
            for (const img of this.images) {
                if (img.status === "pending" || img.status === "error") {
                    await this.uploadImage(img.file);
                }
            }
            this.renderPreviews();
        });
    }





    /**
     * Render image previews with drag & drop reorder and remove buttons
     */
    private renderPreviews(): void {
        if (!this.container) return;

        const previewContainer = this.container.querySelector(
            ".preview-container"
        ) as HTMLElement | null;
        if (!previewContainer) return;

        previewContainer.innerHTML = "";

        if (this.images.length === 0) {
            previewContainer.innerHTML = `
            <div class="placeholder">
              <p>No images yet</p>
            </div>
          `;
            return;
        }

        this.images.forEach((img, index) => {
            const item = document.createElement("div");
            item.className = "preview-item";
            item.draggable = true;
            item.dataset.index = String(index);

            item.innerHTML = `
            <img src="${img.previewUrl}" alt="preview" />
            <button class="remove-btn" title="Remove">&times;</button>
          `;

            // Reorder
            item.addEventListener("dragstart", (ev) => {
                ev.dataTransfer?.setData("text/plain", String(index));
            });

            item.addEventListener("dragover", (ev) => ev.preventDefault());

            item.addEventListener("drop", (ev) => {
                ev.preventDefault();
                const from = Number(ev.dataTransfer?.getData("text/plain"));
                const to = Number((ev.currentTarget as HTMLElement).dataset.index);
                if (!Number.isNaN(from) && !Number.isNaN(to) && from !== to) {
                    this.reorderImages(from, to);
                }
            });

            // Remove
            const removeBtn = item.querySelector(".remove-btn");
            removeBtn?.addEventListener("click", () => {
                this.removeImage(img.id);
            });

            previewContainer.appendChild(item);
        });
    }

    private reorderImages(from: number, to: number): void {
        if (from < 0 || from >= this.images.length || to < 0 || to >= this.images.length) {
            return;
        }

        const image = this.images[from];
        this.images.splice(from, 1);
        this.images.splice(to, 0, image);

        this.renderPreviews();
    }

    private removeImage(imageId: string): void {
        const index = this.images.findIndex(img => img.id === imageId);
        if (index !== -1) {
            this.images.splice(index, 1);
            this.renderPreviews();
        }
    }
}

// Export the initialization function
export function initQrUpload(config: QrUploadConfig): QrUpload {
    const qrUpload = new QrUpload();
    qrUpload.init(config);
    return qrUpload;
}

// Re-export the generateQrCode function from utils/qr
export { generateQrCode } from './utils/qr';
