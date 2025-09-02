import type { ImageConfig } from './types';
import { generateQrCode, generateQrUrl, generateSessionId } from './utils/qr';
import Sortable from "sortablejs";

// Core types
export interface ImageFile {
    id: string;
    previewUrl: string;
    file: File;
    status: 'pending' | 'uploading' | 'uploaded' | 'error';
    progress?: number;
    error?: string;
    timestamp?: Date;
}

export interface ApiConfig {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: Record<string, string>;
    fileKey?: string;
    responseKey?: string;
    onUploadImageSuccess?: (uploadedFiles: File[]) => void;
}

export interface PollingCallbacks {
    onPollingStart?: () => void;
    onPollingStop?: () => void;
    onPollingError?: (error: Error) => void;
    onNewImages?: (images: any[]) => void;
}

export interface QrUploadConfig {
    qrUrl?: {
        frontendUrl: string;
        sdkRoute?: string;
    };
    uploadApi?: ApiConfig;
    fetchApi?: ApiConfig;
    autoStartCamera?: boolean;
    enablePolling?: boolean;
    pollingInterval?: number;
    imageConfig?: ImageConfig;
    polling?: PollingCallbacks;
    onError?: (error: Error) => void;
    onUploadComplete?: (response: any) => void;
    logoUrl?: string | null;
}

export interface QRCodeGenerationOptions {
    size?: number;
    color?: string;
    backgroundColor?: string;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    qrImage?: string;
    params?: Record<string, string>;
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
    setPollingEnabled(enabled: boolean): void;
    setPollingInterval(interval: number): void;
}

export class QrUpload implements IQRUploadSDK {
    private config: QrUploadConfig;
    private images: ImageFile[] = [];
    private container: HTMLElement | null = null;
    private sessionId: string = '';
    private isInitialized: boolean = false;
    private videoWrapper: HTMLDivElement | null = null;
    private videoElement: HTMLVideoElement | null = null;
    private mediaStream: MediaStream | null = null;
    private pollingInterval: NodeJS.Timeout | null = null;
    private isPolling: boolean = false;

    private defaultConfig: QrUploadConfig = {
        qrUrl: {
            frontendUrl: '',
            sdkRoute: '/qr-upload',
        },
        uploadApi: {
            url: '',
            method: 'POST',
            headers: {},
        },
        fetchApi: {
            url: '',
            headers: {},
            responseKey: 'data'
        },
        autoStartCamera: true,
        enablePolling: false,
        pollingInterval: 3000, // Default to 3 seconds
        imageConfig: {
            multiPhoto: false,
            maxImages: 1,
            allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
        },
        polling: {},
        logoUrl: null
    };

    constructor(config?: Partial<QrUploadConfig>) {
        this.config = { ...this.defaultConfig, ...config };
        this.sessionId = generateSessionId();
    }

    // Implement IQRUploadSDK interface methods
    init(config: Partial<QrUploadConfig>): void {
        this.config = { ...this.defaultConfig, ...config };
        this.isInitialized = true;
    }

    mount(container?: HTMLElement): void {
        this.ensureInitialized();

        if (container) {
            // Use the passed container
            this.container = container;
        } else {
            const appRoot = document.querySelector("body #root");
            this.container = document.createElement("div");
            this.container.className = "qr-upload-root";

            if (appRoot) {
                appRoot.appendChild(this.container);
            } else {
                // Fallback to body if no #root
                document.body.appendChild(this.container);
            }
        }


        const currentPath = window.location.pathname;
        const sdkRoute = this.config.qrUrl?.sdkRoute ?? "/qr-upload";
        if (currentPath === sdkRoute || currentPath.endsWith(sdkRoute)) {

            this.startCamera();
            this.renderInterface();
        }

    }




    unmount(): void {
        this.stopCamera();
        this.stopPolling();
        if (this.container) {
            this.container.innerHTML = '';
            this.container = null;
        }
    }

    updateUploadApi(config: Partial<ApiConfig>) {
        this.ensureInitialized();
        if (!this.config.uploadApi) {
            throw new Error('Upload API not configured');
        }
        this.config.uploadApi = {
            ...this.config.uploadApi,
            ...config,
            url: config.url ?? this.config!.uploadApi!.url,
        };
    }

    updateFetchApi(config: Partial<ApiConfig>) {
        this.ensureInitialized();

        if (!this.config.fetchApi) {
            throw new Error('Fetch API not configured');
        }
        this.config.fetchApi = {
            ...this.config.fetchApi,
            ...config,
            url: config.url ?? this.config!.fetchApi!.url,
        };
    }


    async startCamera(): Promise<void> {
        this.ensureInitialized();
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
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

    stopCamera(): void {
        this.ensureInitialized();
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
    }

    async captureImage(): Promise<Blob> {
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
                if (!blob) {
                    reject(new Error('Failed to capture image'));
                    return;
                }
                resolve(blob);
            }, 'image/jpeg', 0.9);
        });
    }

    async uploadImage(file: File): Promise<any> {
        this.ensureInitialized();
        if (!this.config.uploadApi?.url) {
            throw new Error("Upload API URL not configured");
        }

        const {
            url,
            method = "POST",
            headers = {},
            body = {},
            fileKey = "files",
        } = this.config.uploadApi;

        const formData = new FormData();

        // 🔥 Add the file under the user-defined key
        formData.append(fileKey, file);

        // Add all extra fields
        Object.entries(body).forEach(([key, rawValue]) => {
            const value: any = rawValue;

            if (value instanceof File || value instanceof Blob) {
                formData.append(key, value);
            } else if (Array.isArray(value)) {
                value.forEach((v) => {
                    formData.append(key, v instanceof File || v instanceof Blob ? v : String(v));
                });
            } else {
                formData.append(key, String(value));
            }
        });

        // Debugging: check what’s actually being sent
        formData.forEach((v, k) => console.log("FormData →", k, v));

        // ⚠️ Don’t override Content-Type (fetch will handle boundary)
        const { ["Content-Type"]: _, ...safeHeaders } = headers;

        const response = await fetch(url, {
            method,
            headers: safeHeaders,
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }




    async generateQrCode(options?: QRCodeGenerationOptions): Promise<string> {
        this.ensureInitialized();
        const qrUrl = generateQrUrl(
            this.config!.qrUrl!.frontendUrl,
            this.config!.qrUrl!.sdkRoute,
            this.sessionId,
            options?.params
        );

        return generateQrCode(qrUrl, options);
    }

    // Polling methods
    startPolling(): boolean {
        this.ensureInitialized();
        if (this.isPolling) return false;

        this.isPolling = true;
        this.config.polling?.onPollingStart?.();

        this.pollingInterval = setInterval(async () => {
            try {
                await this.checkForNewImages();
            } catch (error) {
                this.config.polling?.onPollingError?.(error instanceof Error ? error : new Error(String(error)));
            }
        }, this.config.pollingInterval || 3000);

        return true;
    }

    stopPolling(): boolean {
        this.ensureInitialized();
        if (!this.isPolling || !this.pollingInterval) return false;

        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
        this.isPolling = false;
        this.config.polling?.onPollingStop?.();

        return true;
    }

    isPollingActive(): boolean {
        this.ensureInitialized();
        return this.config.enablePolling === true;
    }

    setPollingEnabled(enabled: boolean): void {
        this.ensureInitialized();
        if (this.config.enablePolling === enabled) return;

        this.config.enablePolling = enabled;
        if (enabled) {
            this.startPolling();
        } else {
            this.stopPolling();
        }
    }

    setPollingInterval(interval: number): void {
        this.ensureInitialized();
        if (interval < 1000) {
            console.warn('Polling interval too low, setting to minimum of 1000ms');
            interval = 1000;
        }

        this.config.pollingInterval = interval;

        // Restart polling with new interval if it's currently active
        if (this.pollingInterval) {
            this.stopPolling();
            this.startPolling();
        }
    }

    private async checkForNewImages(): Promise<void> {
        this.ensureInitialized();
        if (!this.config.fetchApi?.url) return;

        const getNested = (obj: any, path: string): any => {
            return path.split(".").reduce((acc, part) => acc?.[part], obj);
        };

        try {
            const response = await fetch(this.config.fetchApi.url, {
                headers: this.config.fetchApi.headers,
                method: "GET",
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch images: ${response.statusText}`);
            }

            const data = await response.json();

            // configurable key path
            const keyPath = this.config.fetchApi.responseKey || "data";
            const items = getNested(data, keyPath);

            if (items && Array.isArray(items) && items.length > 0) {
                // 🔑 directly fire callback with the raw array
                this.config.polling?.onNewImages?.(items);
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.config.polling?.onPollingError?.(err);
            this.handleError(err);
        }
    }



    /**
     * Ensures the SDK is properly initialized with required configurations
     * @throws {Error} If SDK is not initialized or required configurations are missing
     */
    private ensureInitialized(): void {
        // Check if SDK is initialized
        if (!this.isInitialized) {
            console.error('QrUpload not initialized. Call init() first.');
        }
    }

    private handleError(error: Error): void {
        console.error('QrUpload error:', error);
        this.config.onError?.(error);
    }


    private renderInterface(): void {
        this.ensureInitialized();

        // ✅ instead of creating a new container, reuse the one from mount()
        if (!this.container) {
            throw new Error("Container not initialized. Call mount() first.");
        }

        // Clear container
        this.container.innerHTML = "";

        // Wrapper
        const wrapper = document.createElement("div");
        wrapper.className = "qr-upload-layout";

        const header = document.createElement("div");
        header.className = "qr-upload__header";

        if (this.config?.logoUrl) {
            const logoImg = document.createElement("img");
            logoImg.src = this.config.logoUrl;
            logoImg.alt = "Logo";
            logoImg.className = "qr-upload__logo";
            header.appendChild(logoImg);
        }

        const title = document.createElement("h3");
        title.className = "qr-upload__title";
        title.textContent = "QR Upload";
        header.appendChild(title);


        const videoWrapper = document.createElement("div");
        videoWrapper.className = "qr-upload__camera";

        // Main camera/video
        const videoElement = document.createElement("video");
        videoElement.className = "camera-preview";
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        this.videoElement = videoElement;
        this.videoWrapper = videoWrapper;
        
        videoWrapper.appendChild(videoElement);

        // Shutter button
        const shutterWrapper = document.createElement("div");
        shutterWrapper.className = "shutter-wrapper";
        shutterWrapper.innerHTML = `
        <button class="shutter-btn">
            <span class="inner-circle"></span>
        </button>
    `;

        // Preview section
        const previewOverlay = document.createElement("div");
        previewOverlay.className = "preview-overlay";
        previewOverlay.innerHTML = `
        <div class="preview-container">
            <div class="no-img-placeholder">
                <p>Click capture to add images</p>
            </div>
        </div>
        <button class="upload-btn" style="display:none;">Upload All</button>
    `;

        // Append all
        wrapper.appendChild(header);
        wrapper.appendChild(videoWrapper);
        wrapper.appendChild(shutterWrapper);
        wrapper.appendChild(previewOverlay);

        this.container.appendChild(wrapper);

        // Capture button handler
        const captureBtn = shutterWrapper.querySelector(".shutter-btn");
        captureBtn?.addEventListener("click", async () => {
            const maxImages = this.config.imageConfig?.maxImages ?? 1;
            if (this.images.length >= maxImages) {
                this.showToast(`Maximum ${maxImages} image${maxImages > 1 ? "s" : ""} allowed`, "error");
                return;
            }
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

        // 🔹 Upload button handler
        const uploadBtn = previewOverlay.querySelector(".upload-btn") as HTMLButtonElement;
        uploadBtn?.addEventListener("click", async () => {
            for (const img of this.images) {
                if (img.status === "pending" || img.status === "error") {
                    await this.uploadImage(img.file);
                }
            }
            this.renderPreviews();
        });
    }



    private showToast(message: string, type: "success" | "error" = "success"): void {
        const toast = document.createElement("div");
        toast.className = `qr-upload__toast qr-upload__toast--${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }




    private async submitImages(): Promise<void> {
        const uploadedFiles: File[] = [];

        try {
            // Process all pending/error images
            for (const img of this.images) {
                if (img.status === "pending" || img.status === "error") {
                    try {
                        await this.uploadImage(img.file);
                        img.status = "uploaded";
                        uploadedFiles.push(img.file);
                    } catch (err) {
                        img.status = "error";
                        this.handleError(err instanceof Error ? err : new Error(String(err)));
                    }
                }
            }

            // Only proceed if we have successfully uploaded files
            if (uploadedFiles.length > 0) {
                // Call the success callback if provided
                if (this.config?.uploadApi?.onUploadImageSuccess) {
                    try {
                        this.config?.uploadApi?.onUploadImageSuccess(uploadedFiles);
                    } catch (error) {
                        console.error('Error in onSuccess callback:', error);
                    }
                }

                // Remove uploaded images from the list
                this.images = this.images.filter(img => img.status !== "uploaded");
                this.renderPreviews();


            }
        } catch (error) {
            console.error('Error in submitImages:', error);
            this.handleError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    private renderPreviews(): void {
        this.ensureInitialized();
        if (!this.container) return;

        const previewContainer = this.container.querySelector(
            ".preview-container"
        ) as HTMLElement | null;
        const previewOverlay = this.container.querySelector(
            ".preview-overlay"
        ) as HTMLElement | null;
        const uploadBtn = this.container.querySelector(
            ".upload-btn"
        ) as HTMLButtonElement | null;
        const captureBtn = this.container.querySelector(".shutter-btn") as HTMLElement | null;

        if (!previewContainer || !previewOverlay) return;

        previewContainer.innerHTML = "";

        const isMulti = this.config.imageConfig?.multiPhoto ?? true;

        if (this.images.length === 0) {
            // No images placeholder
            previewContainer.innerHTML = `
                <div class="no-img-placeholder">
                  <p>Click capture to add images</p>
                </div>
            `;
            if (uploadBtn) uploadBtn.style.display = "none";

            // Show camera & capture button
            if (this.videoWrapper) this.videoWrapper.style.display = "block";
            if (captureBtn) captureBtn.style.display = "block";

            // Reset overlay
            previewOverlay.style.position = "absolute";
            previewOverlay.style.left = "";
            previewOverlay.style.top = "";
            previewOverlay.style.bottom = "100px";
            previewOverlay.style.transform = "";

            return;
        }

        if (!isMulti) {
            const img = this.images[0];

            // Hide camera and capture button
            if (this.videoWrapper) this.videoWrapper.style.display = "none";
            if (captureBtn) captureBtn.style.display = "none";

            // Center the overlay
            previewOverlay.style.position = "absolute";
            previewOverlay.style.left = "50%";
            previewOverlay.style.top = "50%";
            previewOverlay.style.bottom = "auto";
            previewOverlay.style.transform = "translate(-50%, -50%)";

            const singlePreview = document.createElement("div");
            singlePreview.className = "single-preview";
            singlePreview.innerHTML = `
                <div class="single-img-wrapper">
                    <img src="${img.previewUrl}" class="camera-preview" />
                    <button class="close-btn">&times;</button>
                    <button class="tick-btn">&#10003;</button>
                </div>
            `;

            // Close button
            singlePreview.querySelector(".close-btn")?.addEventListener("click", () => {
                this.removeImage(img.id);

                // Show camera & capture again
                if (this.videoWrapper) this.videoWrapper.style.display = "block";
                if (captureBtn) captureBtn.style.display = "block";

                // Reset overlay
                previewOverlay.style.position = "absolute";
                previewOverlay.style.left = "";
                previewOverlay.style.top = "";
                previewOverlay.style.bottom = "100px";
                previewOverlay.style.transform = "";

                this.renderPreviews();
            });

            // Tick button
            singlePreview.querySelector(".tick-btn")?.addEventListener("click", async () => {
                await this.submitImages();

                // Show camera & capture again
                if (this.videoWrapper) this.videoWrapper.style.display = "block";
                if (captureBtn) captureBtn.style.display = "block";

                // Reset overlay
                previewOverlay.style.position = "absolute";
                previewOverlay.style.left = "";
                previewOverlay.style.top = "";
                previewOverlay.style.bottom = "100px";
                previewOverlay.style.transform = "";
            });

            previewContainer.appendChild(singlePreview);
            if (uploadBtn) uploadBtn.style.display = "none"; // hide default upload
            return;
        }

        // MULTI IMAGE MODE
        if (this.videoWrapper) this.videoWrapper.style.display = "block";
        if (uploadBtn) uploadBtn.style.display = this.images.length > 0 ? "inline-block" : "none";

        // Upload All button
        uploadBtn?.addEventListener("click", async () => {
            await this.submitImages();
        });

        this.images.forEach((img, index) => {
            const item = document.createElement("div");
            item.className = "preview-item";
            item.dataset.index = String(index);

            item.innerHTML = `
                <img src="${img.previewUrl}" alt="preview" />
                <button class="remove-btn" title="Remove">&times;</button>
            `;

            // Remove button
            item.querySelector(".remove-btn")?.addEventListener("click", () => {
                this.removeImage(img.id);
            });

            previewContainer.appendChild(item);
        });

        // Enable SortableJS
        Sortable.create(previewContainer, {
            animation: 200,
            easing: "cubic-bezier(0.25, 1, 0.5, 1)",
            ghostClass: "sortable-ghost",
            chosenClass: "sortable-chosen",
            dragClass: "sortable-drag",
            filter: ".remove-btn",
            onFilter: (evt: Sortable.SortableEvent) => {
                const oe = (evt as any).originalEvent as Event | undefined;
                if (oe && (oe.target as HTMLElement).closest(".remove-btn")) {
                    const index = Number(evt.item.dataset.index);
                    const img = this.images[index];
                    if (img) this.removeImage(img.id);
                }
            },
            onEnd: (evt) => {
                if (evt.oldIndex != null && evt.newIndex != null) {
                    const [moved] = this.images.splice(evt.oldIndex, 1);
                    this.images.splice(evt.newIndex, 0, moved);
                    this.renderPreviews();
                }
            }
        });
    }



    private removeImage(imageId: string): void {
        const index = this.images.findIndex(img => img.id === imageId);
        if (index !== -1) {
            // Revoke the object URL to free up memory
            URL.revokeObjectURL(this.images[index].previewUrl);
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
