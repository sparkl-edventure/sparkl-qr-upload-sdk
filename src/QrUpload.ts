import type { ImageConfig } from './types';
import { generateQrCode, generateQrUrl, generateSessionId } from './utils/qr';
import { QrImageEditor } from './utils/ImageEditor';
import Sortable from "sortablejs";
import cameraStar from './../assets/img/camera_star.png';

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
    useNativeCamera?: boolean; // If true: native camera app (requires tap); If false: live preview (auto-starts)
    enablePolling?: boolean;
    pollingInterval?: number;
    imageConfig?: ImageConfig;
    polling?: PollingCallbacks;
    onError?: (error: Error) => void;
    onUploadComplete?: (response: any) => void;
    onImageAccept?: (file: File) => void;
    onImageReject?: () => void;
    logoUrl?: string | null;
    enableImageEditor?: boolean;
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
    private nativeCameraInput: HTMLInputElement | null = null;

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
        useNativeCamera: true,
        enablePolling: false,
        pollingInterval: 3000, // Default to 3 seconds
        imageConfig: {
            multiPhoto: false,
            maxImages: 1,
            allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
        },
        polling: {},
        logoUrl: null,
        enableImageEditor: true // Enable image editor by default
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
            this.container.className = "qr-upload__root";

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
            if (this.config.useNativeCamera) {
                // Native camera app (file input) - requires user tap
                this.renderNativeCameraInterface();
            } else {
                // Live camera preview (getUserMedia) - auto-starts without tap
                this.startCamera();
                this.renderInterface();
            }
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

    updateImageConfig(config: Partial<ImageConfig>) {
        this.ensureInitialized();
        this.config.imageConfig = {
            ...this.config.imageConfig,
            ...config
        };
    };

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

        // helper to safely access nested keys, supports array indices
        const getNested = (obj: any, path: string): any => {
            return path.split(".").reduce((acc, part) => {
            if (acc == null) return undefined;

            // detect if key is numeric -> use as array index
            const index = Number(part);
            if (!isNaN(index) && Array.isArray(acc)) {
                return acc[index];
            }

            return acc[part];
            }, obj);
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

            if (Array.isArray(items) && items.length > 0) {
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
        wrapper.className = "qr-upload__layout";

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
        videoElement.className = "qr-upload__camera_preview";
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        this.videoElement = videoElement;
        this.videoWrapper = videoWrapper;
        
        videoWrapper.appendChild(videoElement);

        // Shutter button
        const shutterWrapper = document.createElement("div");
        shutterWrapper.className = "qr-upload__shutter_wrapper";
        shutterWrapper.innerHTML = `
        <button class="qr-upload__shutter_btn">
            <span class="qr-upload__inner-circle"></span>
        </button>
    `;

        // Preview section
        const previewOverlay = document.createElement("div");
        previewOverlay.className = "qr-upload__preview_overlay";
        previewOverlay.innerHTML = `
        <div class="qr-upload__preview_container">
            <div class="qr-upload__no_img_placeholder">
                <p>Click capture to add images</p>
            </div>
        </div>
        <button class="qr-upload__btn" style="display:none;">Upload All</button>
    `;

        // Append all
        wrapper.appendChild(header);
        wrapper.appendChild(videoWrapper);
        wrapper.appendChild(shutterWrapper);
        wrapper.appendChild(previewOverlay);

        this.container.appendChild(wrapper);

        // Capture button handler
        const captureBtn = shutterWrapper.querySelector(".qr-upload__shutter_btn");
        captureBtn?.addEventListener("click", async () => {
            const maxImages = this.config.imageConfig?.maxImages ?? 1;
            if (this.images.length >= maxImages) {
                this.showToast(`Maximum ${maxImages} image${maxImages > 1 ? "s" : ""} allowed`, "error");
                return;
            }
            try {
                const blob = await this.captureImage();
                const file = new File([blob], `${this.config.imageConfig?.fileName || `capture-${Date.now()}.jpg`}`, {
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
        const uploadBtn = previewOverlay.querySelector(".qr-upload__btn") as HTMLButtonElement;
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
        toast.className = `qr-upload__toast qr-upload__toast_${type}`;
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
            ".qr-upload__preview_container"
        ) as HTMLElement | null;
        const previewOverlay = this.container.querySelector(
            ".qr-upload__preview_overlay"
        ) as HTMLElement | null;
        const uploadBtn = this.container.querySelector(
            ".qr-upload__upload_btn"
        ) as HTMLButtonElement | null;
        const captureBtn = this.container.querySelector(".qr-upload__shutter_btn") as HTMLElement | null;

        if (!previewContainer || !previewOverlay) return;

        previewContainer.innerHTML = "";

        const isMulti = this.config.imageConfig?.multiPhoto ?? true;

        if (this.images.length === 0) {
            // No images placeholder
            previewContainer.innerHTML = `
                <div class="qr-upload__no_img_placeholder">
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
            previewOverlay.style.bottom = "135px";
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
            singlePreview.className = "qr-upload__single_preview";
            singlePreview.innerHTML = `
                <div class="qr-upload__single_img_wrapper">
                    <img src="${img.previewUrl}" class="qr-upload__camera_preview" />
                    <button class="qr-upload__close_btn">&times;</button>
                    <button class="qr-upload__tick_btn">&#10003;</button>
                </div>
            `;

            // Close button
            singlePreview.querySelector(".qr-upload__close_btn")?.addEventListener("click", () => {
                this.removeImage(img.id);

                // Show camera & capture again
                if (this.videoWrapper) this.videoWrapper.style.display = "block";
                if (captureBtn) captureBtn.style.display = "block";

                // Reset overlay
                previewOverlay.style.position = "absolute";
                previewOverlay.style.left = "";
                previewOverlay.style.top = "";
                previewOverlay.style.bottom = "135px";
                previewOverlay.style.transform = "";

                this.renderPreviews();
            });

            // Tick button
            singlePreview.querySelector(".qr-upload__tick_btn")?.addEventListener("click", async () => {
                await this.submitImages();

                // Show camera & capture again
                if (this.videoWrapper) this.videoWrapper.style.display = "block";
                if (captureBtn) captureBtn.style.display = "block";

                // Reset overlay
                previewOverlay.style.position = "absolute";
                previewOverlay.style.left = "";
                previewOverlay.style.top = "";
                previewOverlay.style.bottom = "135px";
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
            item.className = "qr-upload__preview_item";
            item.dataset.index = String(index);

            item.innerHTML = `
                <img src="${img.previewUrl}" alt="preview" />
                <button class="qr-upload__remove_btn" title="Remove">&times;</button>
            `;

            // Remove button
            item.querySelector(".qr-upload__remove_btn")?.addEventListener("click", () => {
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
            filter: ".qr-upload__remove_btn",
            onFilter: (evt: Sortable.SortableEvent) => {
                const oe = (evt as any).originalEvent as Event | undefined;
                if (oe && (oe.target as HTMLElement).closest(".qr-upload__remove_btn")) {
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

    /**
     * Renders native camera interface using HTML5 input[type=file] with capture attribute
     * Provides native camera access with all phone camera features
     */
    private renderNativeCameraInterface(): void {
        this.ensureInitialized();

        if (!this.container) {
            throw new Error("Container not initialized. Call mount() first.");
        }

        // Clear container
        this.container.innerHTML = "";

        // Main wrapper
        const wrapper = document.createElement("div");
        wrapper.className = "qr-upload__layout qr-upload__native-camera";

        // Header
        const header = document.createElement("div");
        header.className = "qr-upload__header";

        if (this.config?.logoUrl) {
            const logoImg = document.createElement("img");
            logoImg.src = this.config.logoUrl;
            logoImg.alt = "Logo";
            logoImg.className = "qr-upload__logo";
            header.appendChild(logoImg);
        }

        // Native camera input (hidden)
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = (this.config.imageConfig?.allowedMimeTypes || ['image/jpeg', 'image/png', 'image/webp']).join(',');
        fileInput.setAttribute("capture", ""); // Opens full native camera app with all features
        fileInput.style.display = "none";
        fileInput.id = "qr-upload-native-input";
        
        // Store reference for external trigger
        this.nativeCameraInput = fileInput;

        // Content area with title and description
        const contentArea = document.createElement("div");
        contentArea.className = "qr-upload__content-area";
        
        const mainTitle = document.createElement("h2");
        mainTitle.className = "qr-upload__main-title";
        mainTitle.textContent = "Upload your Answer";
        
        const description = document.createElement("p");
        description.className = "qr-upload__description";
        description.textContent = "Tap the camera below to capture";
        
        contentArea.appendChild(mainTitle);
        contentArea.appendChild(description);


        


        // Camera button container
        const cameraContainer = document.createElement("div");
        cameraContainer.className = "qr-upload__native-camera-container";

        cameraContainer.classList.add('blob-eclipse-container');

        const blobEclipse1 = document.createElement('div');
        blobEclipse1.classList.add('blob-eclipse', 'blob-eclipse1');
    
        const blobEclipse2 = document.createElement('div');
        blobEclipse2.classList.add('blob-eclipse', 'blob-eclipse2');
    
        cameraContainer.appendChild(blobEclipse1);
        cameraContainer.appendChild(blobEclipse2);

        const cameraButton = document.createElement("button");
        cameraButton.className = "qr-upload__native-camera-btn";
        
        // Create circular camera button design
        cameraButton.innerHTML = `
            <div class="qr-upload__camera-circle">
            <div class="flex flex-col">
                <img src="${cameraStar}" alt="camera_star"/>
                <span class="qr-upload__camera-text">Tap to Open<br>Camera</span>
                </div>
            </div>
           
        `;

        // Preview overlay for image confirmation
        const previewOverlay = document.createElement("div");
        previewOverlay.className = "qr-upload__native-preview-overlay";
        previewOverlay.style.display = "none";
        previewOverlay.innerHTML = `
            <div class="qr-upload__native-preview-container">
                <img class="qr-upload__native-preview-img" alt="Captured image" />
                <div class="qr-upload__native-preview-actions">
                    <button class="qr-upload__native-close-btn" title="Reject image">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                    <button class="qr-upload__native-edit-btn" title="Edit image">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="qr-upload__native-tick-btn" title="Accept image">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        // Event listeners
        cameraButton.addEventListener("click", () => {
            fileInput.click();
        });

        fileInput.addEventListener("change", async (e) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];

            if (!file) return;

            // Validate file type
            const allowedTypes = this.config.imageConfig?.allowedMimeTypes || ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                this.showToast(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`, "error");
                return;
            }

            // Show preview with close and tick buttons
            const previewImg = previewOverlay.querySelector(".qr-upload__native-preview-img") as HTMLImageElement;
            previewImg.src = URL.createObjectURL(file);
            previewOverlay.style.display = "flex";
            cameraContainer.style.display = "none";

            // Store the current file for callbacks
            const currentFile = file;

            // Close button handler
            const closeBtn = previewOverlay.querySelector(".qr-upload__native-close-btn");
            const closeHandler = () => {
                URL.revokeObjectURL(previewImg.src);
                previewOverlay.style.display = "none";
                cameraContainer.style.display = "flex";
                fileInput.value = ""; // Reset input

                // Call reject callback
                if (this.config.onImageReject) {
                    this.config.onImageReject();
                }
            };
            closeBtn?.addEventListener("click", closeHandler);

            // Edit button handler
            const editBtn = previewOverlay.querySelector(".qr-upload__native-edit-btn");
            const editHandler = () => {
                // Hide preview
                previewOverlay.style.display = "none";
                
                // Open image editor
                this.openImageEditorWithUpload(currentFile, previewImg.src, cameraContainer, fileInput);
            };
            editBtn?.addEventListener("click", editHandler);

            // Tick button handler (Accept without editing)
            const tickBtn = previewOverlay.querySelector(".qr-upload__native-tick-btn");
            const tickHandler = async () => {
                // Hide preview
                previewOverlay.style.display = "none";
                
                // Call accept callback
                if (this.config.onImageAccept) {
                    this.config.onImageAccept(currentFile);
                }

                // Upload directly without editing
                try {
                        const imageFile: ImageFile = {
                            id: crypto.randomUUID(),
                            previewUrl: previewImg.src,
                            file: currentFile,
                            status: "pending",
                        };

                        this.images.push(imageFile);

                        // Upload if API is configured
                        if (this.config.uploadApi?.url) {
                            imageFile.status = "uploading";
                            const response = await this.uploadImage(currentFile);
                            imageFile.status = "uploaded";

                            if (this.config.onUploadComplete) {
                                this.config.onUploadComplete(response);
                            }

                            this.showToast("Image uploaded successfully!", "success");
                        }

                    // Reset UI
                    URL.revokeObjectURL(previewImg.src);
                    cameraContainer.style.display = "flex";
                    fileInput.value = ""; // Reset input

                } catch (error) {
                    this.handleError(error instanceof Error ? error : new Error(String(error)));
                    this.showToast("Failed to process image", "error");

                    // Reset UI on error
                    URL.revokeObjectURL(previewImg.src);
                    previewOverlay.style.display = "none";
                    cameraContainer.style.display = "flex";
                    fileInput.value = "";
                }
            };
            tickBtn?.addEventListener("click", tickHandler);
        });

        // Append elements
        cameraContainer.appendChild(contentArea);
        cameraContainer.appendChild(cameraButton);
        wrapper.appendChild(header);
        wrapper.appendChild(cameraContainer);
        wrapper.appendChild(previewOverlay);
        wrapper.appendChild(fileInput);

        this.container.appendChild(wrapper);

    }

    /**
     * Trigger the native camera to open
     * Must be called from a user interaction context (e.g., button click)
     */
    triggerCamera(): void {
        if (this.nativeCameraInput) {
            this.nativeCameraInput.click();
        } else {
            throw new Error('Native camera input not initialized. Ensure you have mounted the SDK first.');
        }
    }

    /**
     * Open the image editor for rotating and cropping (for native camera with upload)
     */
    private openImageEditorWithUpload(
        file: File,
        previewUrl: string,
        cameraContainer: HTMLElement,
        fileInput: HTMLInputElement
    ): void {
        // Instantiate editor - it will show automatically after loading
        new QrImageEditor(file, {
            uploadApi: this.config.uploadApi ? {
                url: this.config.uploadApi.url,
                method: this.config.uploadApi.method,
                headers: this.config.uploadApi.headers,
                body: this.config.uploadApi.body,
                fileKey: this.config.uploadApi.fileKey,
                responseKey: this.config.uploadApi.responseKey,
                onUploadImageSuccess: (uploadedFiles: File[]) => {
                    // Handle successful upload
                    if (this.config.uploadApi?.onUploadImageSuccess) {
                        this.config.uploadApi.onUploadImageSuccess(uploadedFiles);
                    }
                    if (this.config.onUploadComplete) {
                        this.config.onUploadComplete({ files: uploadedFiles });
                    }
                    this.showToast("Image uploaded successfully!", "success");
                }
            } : undefined,
            onSave: async (editedFile: File) => {
                try {
                    const imageFile: ImageFile = {
                        id: crypto.randomUUID(),
                        previewUrl: URL.createObjectURL(editedFile),
                        file: editedFile,
                        status: "uploaded", // Set as uploaded since ImageEditor handles upload
                    };

                    this.images.push(imageFile);

                    // Clean up and reset UI
                    URL.revokeObjectURL(previewUrl);
                    cameraContainer.style.display = "flex";
                    fileInput.value = "";
                } catch (error) {
                    this.handleError(error instanceof Error ? error : new Error(String(error)));
                    this.showToast("Failed to process image", "error");
                    
                    // Reset UI on error
                    URL.revokeObjectURL(previewUrl);
                    cameraContainer.style.display = "flex";
                    fileInput.value = "";
                }
            },
            onCancel: () => {
                // Call reject callback if provided
                if (this.config.onImageReject) {
                    this.config.onImageReject();
                }
                
                // Clean up and return to camera
                URL.revokeObjectURL(previewUrl);
                cameraContainer.style.display = "flex";
                fileInput.value = "";
            },
            fileName: this.config.imageConfig?.fileName || `edited-${Date.now()}.jpg`
        });
        
        // Editor will show automatically after loading the image
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
