/**
 * ImageEditor - Custom image editor with crop, rotate, and flip functionality
 */

export interface ImageEditorConfig {
    onSave: (editedFile: File) => void;
    onCancel: () => void;
    fileName?: string;
    uploadApi?: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: Record<string, string>;
        fileKey?: string;
        responseKey?: string;
        onUploadImageSuccess?: (uploadedFiles: File[]) => void;
    };
}

interface EditorState {
    rotation: number;
    flipX: boolean;
    flipY: boolean;
    cropX: number;
    cropY: number;
    cropWidth: number;
    cropHeight: number;
    imageDataUrl?: string; // Store image state for crop operations
}

export class QrImageEditor {
    private config: ImageEditorConfig;
    private overlay: HTMLDivElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private image: HTMLImageElement | null = null;
    private originalImage: HTMLImageElement | null = null;
    // Editor state (rotation now uses -180 to +180)
    private state: EditorState = {
        rotation: 0,
        flipX: false,
        flipY: false,
        cropX: 0,
        cropY: 0,
        cropWidth: 0,
        cropHeight: 0
    };
    
    // History for undo/redo
    private history: EditorState[] = [];
    private historyIndex: number = -1;
    
    // Crop mode
    private cropMode: boolean = false;
    private cropOverlay: HTMLElement | null = null;
    
    // Canvas dimensions for proper scaling
    private imageScale: number = 1;
    private fixedCanvasWidth: number = 0;
    private fixedCanvasHeight: number = 0;

    constructor(file: File, config: ImageEditorConfig) {
        this.config = config;
        this.openEditor(file);
    }

    // ===== DRY OPTIMIZATION METHODS =====
    
    /**
     * Get element from overlay with null check
     */
    private getElement<T extends HTMLElement>(selector: string): T | null {
        return this.overlay?.querySelector(selector) as T || null;
    }

    /**
     * Get multiple elements from overlay
     */
    private getElements<T extends HTMLElement>(selector: string): NodeListOf<T> | null {
        return this.overlay?.querySelectorAll(selector) as NodeListOf<T> || null;
    }

    /**
     * Add event listener with null check
     */
    private addListener<K extends keyof HTMLElementEventMap>(
        element: HTMLElement | null,
        event: K,
        handler: (e: HTMLElementEventMap[K]) => void
    ): void {
        element?.addEventListener(event, handler);
    }

    /**
     * Update state and save/render
     */
    private updateState(updates: Partial<EditorState>, shouldSave = true, shouldRender = true): void {
        Object.assign(this.state, updates);
        if (shouldSave) this.saveState();
        if (shouldRender) this.render();
    }

    /**
     * Toggle flip state
     */
    private toggleFlip(type: 'horizontal' | 'vertical'): void {
        const updates = type === 'horizontal'
            ? { flipX: !this.state.flipX }
            : { flipY: !this.state.flipY };
        this.updateState(updates, true, true);
    }

    /**
     * Reset crop to full image
     */
    private resetCropToFullImage(): void {
        if (!this.image) return;
        this.updateState({
            cropX: 0,
            cropY: 0,
            cropWidth: this.image.width,
            cropHeight: this.image.height
        });
    }

    // ===== END DRY OPTIMIZATION METHODS =====

    private async openEditor(file: File): Promise<void> {
        try {
            // Load image
            this.image = await this.loadImage(file);
            
            // Store original image for reset functionality
            this.originalImage = this.image;
            
            // Initialize crop dimensions to match displayed image size (not original)
            // This will be set after canvas size calculation
            this.state.cropX = 0;
            this.state.cropY = 0;
            
            // Save initial state
            this.saveState();
            
            // Initialize crop mode as active by default (must be set BEFORE createEditorUI)
            this.cropMode = true;
            
            // Create UI (setupCropHandlers will now see cropMode = true)
            this.createEditorUI();
            
            // Calculate fixed canvas size once based on original image (after canvas is created)
            this.calculateFixedCanvasSize();
            
            // Render image first
            this.render();
            
        } catch (error) {
            console.error('Failed to load image:', error);
            alert('Failed to load image. Please try again.');
            this.config.onCancel();
        }
    }

    private loadImage(file: File): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    private createEditorUI(): void {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'qr-image-editor-overlay';
        
        this.overlay.innerHTML = `
            <div class="qr-image-editor-container">
                <!-- Header -->
                <div class="qr-image-editor-header">
                    <button class="qr-editor-btn-close" title="Close">×</button>
                    <div class="qr-editor-toolbar">
                        <button class="qr-editor-tool-btn" data-action="undo" title="Undo">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 7v6h6"/>
                                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
                            </svg>
                        </button>
                        <button class="qr-editor-tool-btn" data-action="redo" title="Redo">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 7v6h-6"/>
                                <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>
                            </svg>
                        </button>
                        <button class="qr-editor-tool-btn" data-action="reset" title="Reset All">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                            <path d="M21 3v5h-5"></path>
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                            <path d="M3 21v-5h5"></path>
                                <path d="M21 3v5h-5"></path>
                                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                                <path d="M3 21v-5h5"></path>
                            </svg>
                        </button>
                    </div>
                    <button class="qr-editor-btn-save" title="Save">✓</button>
                </div>
                
                <!-- Canvas wrapper -->
                <div class="qr-image-editor-canvas-wrapper">
                    <div class="qr-canvas-container">
                        <canvas class="qr-editor-canvas"></canvas>
                        <div class="qr-crop-overlay">
                            <!-- Corner handles -->
                            <div class="qr-crop-handle qr-crop-handle-nw" data-handle="nw"></div>
                            <div class="qr-crop-handle qr-crop-handle-ne" data-handle="ne"></div>
                            <div class="qr-crop-handle qr-crop-handle-sw" data-handle="sw"></div>
                            <div class="qr-crop-handle qr-crop-handle-se" data-handle="se"></div>
                            <!-- Edge handles -->
                            <div class="qr-crop-handle qr-crop-handle-n" data-handle="n"></div>
                            <div class="qr-crop-handle qr-crop-handle-s" data-handle="s"></div>
                            <div class="qr-crop-handle qr-crop-handle-e" data-handle="e"></div>
                            <div class="qr-crop-handle qr-crop-handle-w" data-handle="w"></div>
                        </div>
                    </div>
                </div>
                
                <!-- Controls -->
                <div class="qr-image-editor-controls">
                    <div class="qr-editor-tabs">
                        <button class="qr-editor-tab" data-tab="rotation" title="Rotation">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                            </svg>
                           
                        </button>
                        <button class="qr-editor-tab active" data-tab="crop" title="Crop">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/>
                                <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/>
                            </svg>
                            
                        </button>
                        <button class="qr-editor-tab qr-flip-toggle-tab" data-flip="horizontal" title="Horizontal Flip">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 3v18"/>
                                <path d="M5 7l7-4v18l-7-4z"/>
                                <path d="M19 17l-7 4V3l7 4z"/>
                            </svg>
                           
                        </button>
                        <button class="qr-editor-tab qr-flip-toggle-tab" data-flip="vertical" title="Vertical Flip">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 12h18"/>
                                <path d="M7 5l4 7H3l4-7z"/>
                                <path d="M17 19l-4-7h8l-4 7z"/>
                            </svg>
                            
                        </button>
                    </div>
                    <div class="qr-editor-tab-content" data-content="rotation" style="display: none;">
                        <div class="qr-slider-wrapper">
                            <div class="qr-slider-track">
                                <div class="qr-slider-dots"></div>
                                <div class="qr-rotation-value">0°</div>
                                <input type="range" class="qr-rotation-slider" min="-180" max="180" value="0" step="1" />
                            </div>
                        </div>
                    </div>
                    <div class="qr-editor-tab-content" data-content="crop" style="display: block;">
                        <div class="qr-crop-info">
                            <p>Drag corners to resize • Drag center to move</p>
                            <div class="qr-crop-buttons">
                                <button class="qr-crop-action-btn qr-save-crop-btn" title="Save Crop">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="20,6 9,17 4,12"></polyline>
                                    </svg>
                                </button>
                                <button class="qr-crop-action-btn qr-reset-crop-btn" title="Reset Crop">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                                        <path d="M21 3v5h-5"></path>
                                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                                        <path d="M3 21v-5h5"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.overlay);
        
        // Get canvas
        this.canvas = this.overlay.querySelector('.qr-editor-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            // Set high-quality rendering settings
            if (this.ctx) {
                this.ctx.imageSmoothingEnabled = true;
                this.ctx.imageSmoothingQuality = 'high';
            }
        }
        
        // Attach event listeners
        this.attachEventListeners();
    }

    private attachEventListeners(): void {
        if (!this.overlay) return;
        
        // Close and save buttons
        this.addListener(this.getElement('.qr-editor-btn-close'), 'click', () => this.handleCancel());
        this.addListener(this.getElement('.qr-editor-btn-save'), 'click', () => this.handleSave());
        
        // Tool buttons (undo/redo)
        const toolButtons = this.getElements('.qr-editor-tool-btn');
        toolButtons?.forEach(btn => {
            this.addListener(btn, 'click', (e) => {
                const action = (e.currentTarget as HTMLElement).dataset.action;
                if (action) this.handleToolAction(action);
            });
        });
        
        // Tabs (Rotation and Crop)
        const tabs = this.getElements('.qr-editor-tab:not(.qr-flip-toggle-tab)');
        tabs?.forEach(tab => {
            this.addListener(tab, 'click', (e) => {
                const tabName = (e.currentTarget as HTMLElement).dataset.tab as 'rotation' | 'crop';
                if (tabName) this.switchTab(tabName);
            });
        });
        
        // Flip toggle tabs
        const flipTabs = this.getElements('.qr-flip-toggle-tab');
        flipTabs?.forEach(tab => {
            this.addListener(tab, 'click', (e) => {
                const element = e.currentTarget as HTMLElement;
                const flipType = element.dataset.flip as 'horizontal' | 'vertical';
                
                if (flipType) {
                    this.toggleFlip(flipType);
                    element.classList.toggle('active', flipType === 'horizontal' ? this.state.flipX : this.state.flipY);
                }
            });
        });
        
        // Crop buttons
        this.addListener(this.getElement('.qr-reset-crop-btn'), 'click', () => this.resetCrop());
        this.addListener(this.getElement('.qr-save-crop-btn'), 'click', () => this.applyCrop());
        
        // Rotation slider
        const rotationSlider = this.getElement<HTMLInputElement>('.qr-rotation-slider');
        let rotationTimeout: NodeJS.Timeout;
        this.addListener(rotationSlider, 'input', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            this.updateState({ rotation: value }, false, true);
            this.updateRotationValue();
            
            // Debounce state saving to avoid too many history entries
            clearTimeout(rotationTimeout);
            rotationTimeout = setTimeout(() => {
                this.saveState();
            }, 300);
        });
        
        // Initialize slider dots
        this.createSliderDots();
        
        // Setup crop overlay interactions
        this.setupCropHandlers();
    }
    
    private createSliderDots(): void {
        const dotsContainer = this.getElement('.qr-slider-dots');
        if (!dotsContainer) return;
        
        // Create dots from -180 to +180, every 15 degrees
        // Total: 25 dots (-180, -165, -150, ..., -15, 0, 15, ..., 165, 180)
        for (let i = -180; i <= 180; i += 15) {
            const dot = document.createElement('div');
            // Large dots at the ends and center (0)
            if (i === -180 || i === 180 || i === 0) {
                dot.className = 'qr-slider-dot qr-slider-dot-large';
            } else {
                dot.className = 'qr-slider-dot';
            }
            dotsContainer.appendChild(dot);
        }
    }
    
    private setupCropHandlers(): void {
        this.cropOverlay = this.getElement('.qr-crop-overlay');
        if (!this.cropOverlay) return;
        
        // Set initial visibility based on crop mode (crop mode is true by default)
        this.cropOverlay.style.display = this.cropMode ? 'block' : 'none';
        
        const handles = this.cropOverlay.querySelectorAll('.qr-crop-handle');
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => this.startCropDrag(e as MouseEvent));
            handle.addEventListener('touchstart', (e) => this.startCropDrag(e as TouchEvent));
        });
        
        // Drag the crop area itself - make entire overlay draggable except handles
        this.cropOverlay.addEventListener('mousedown', (e) => {
            const target = e.target as HTMLElement;
            // Allow dragging if clicking on the overlay itself or any non-handle child
            if (!target.classList.contains('qr-crop-handle')) {
                this.startCropMove(e);
            }
        });
        
        this.cropOverlay.addEventListener('touchstart', (e) => {
            const target = e.target as HTMLElement;
            if (!target.classList.contains('qr-crop-handle')) {
                this.startCropMove(e.touches[0] as any);
            }
        });
        
        document.addEventListener('mousemove', (e) => this.onCropDrag(e));
        document.addEventListener('touchmove', (e) => this.onCropDrag(e));
        document.addEventListener('mouseup', () => this.stopCropDrag());
        document.addEventListener('touchend', () => this.stopCropDrag());
    }
    
    private isDraggingCrop = false;
    private dragType: 'handle' | 'move' | null = null;
    private dragHandleType: string | null = null;
    private dragStartPos = { x: 0, y: 0 };
    private cropStartState = { x: 0, y: 0, width: 0, height: 0 };
    
    private startCropDrag(e: MouseEvent | TouchEvent): void {
        e.preventDefault();
        e.stopPropagation();
        
        this.isDraggingCrop = true;
        this.dragType = 'handle';
        
        const target = e.target as HTMLElement;
        this.dragHandleType = target.dataset.handle || null;
        
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        this.dragStartPos = { x: clientX, y: clientY };
        this.cropStartState = {
            x: this.state.cropX,
            y: this.state.cropY,
            width: this.state.cropWidth,
            height: this.state.cropHeight
        };
    }
    
    private startCropMove(e: MouseEvent): void {
        if (!this.image) {
            return;
        }
        
        console.log('Starting crop move');
        this.isDraggingCrop = true;
        this.dragType = 'move';
        
        const clientX = 'clientX' in e ? e.clientX : 0;
        const clientY = 'clientY' in e ? e.clientY : 0;
        
        this.dragStartPos = { x: clientX, y: clientY };
        this.cropStartState = {
            x: this.state.cropX,
            y: this.state.cropY,
            width: this.state.cropWidth,
            height: this.state.cropHeight
        };
        
        e.preventDefault();
        e.stopPropagation();
    }
    
    private onCropDrag(e: MouseEvent | TouchEvent): void {
        if (!this.isDraggingCrop || !this.image) return;
        
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        const deltaX = (clientX - this.dragStartPos.x) / this.imageScale;
        const deltaY = (clientY - this.dragStartPos.y) / this.imageScale;
        
        if (this.dragType === 'handle' && this.dragHandleType) {
            // Handle resize logic
            const { x, y, width, height } = this.cropStartState;
            
            switch (this.dragHandleType) {
                case 'nw':
                    this.state.cropX = Math.max(0, Math.min(x + deltaX, x + width - 50));
                    this.state.cropY = Math.max(0, Math.min(y + deltaY, y + height - 50));
                    this.state.cropWidth = width - (this.state.cropX - x);
                    this.state.cropHeight = height - (this.state.cropY - y);
                    break;
                case 'ne':
                    this.state.cropY = Math.max(0, Math.min(y + deltaY, y + height - 50));
                    this.state.cropWidth = Math.max(50, Math.min(width + deltaX, this.image.width - x));
                    this.state.cropHeight = height - (this.state.cropY - y);
                    break;
                case 'sw':
                    this.state.cropX = Math.max(0, Math.min(x + deltaX, x + width - 50));
                    this.state.cropWidth = width - (this.state.cropX - x);
                    this.state.cropHeight = Math.max(50, Math.min(height + deltaY, this.image.height - y));
                    break;
                case 'se':
                    this.state.cropWidth = Math.max(50, Math.min(width + deltaX, this.image.width - x));
                    this.state.cropHeight = Math.max(50, Math.min(height + deltaY, this.image.height - y));
                    break;
                // Edge handles
                case 'n':
                    this.state.cropY = Math.max(0, Math.min(y + deltaY, y + height - 50));
                    this.state.cropHeight = height - (this.state.cropY - y);
                    break;
                case 's':
                    this.state.cropHeight = Math.max(50, Math.min(height + deltaY, this.image.height - y));
                    break;
                case 'e':
                    this.state.cropWidth = Math.max(50, Math.min(width + deltaX, this.image.width - x));
                    break;
                case 'w':
                    this.state.cropX = Math.max(0, Math.min(x + deltaX, x + width - 50));
                    this.state.cropWidth = width - (this.state.cropX - x);
                    break;
            }
        } else if (this.dragType === 'move') {
            // Move entire crop area
            const newX = this.cropStartState.x + deltaX;
            const newY = this.cropStartState.y + deltaY;
            
            this.state.cropX = Math.max(0, Math.min(newX, this.image.width - this.state.cropWidth));
            this.state.cropY = Math.max(0, Math.min(newY, this.image.height - this.state.cropHeight));
        }
        
        this.render();
        // Ensure crop overlay updates immediately during drag
        if (this.cropMode) {
            this.updateCropOverlay();
        }
    }
    
    private stopCropDrag(): void {
        if (this.isDraggingCrop) {
            this.isDraggingCrop = false;
            this.dragType = null;
            this.dragHandleType = null;
            this.saveState();
        }
    }
    
    private resetCrop(): void {
        this.resetCropToFullImage();
    }

    private resetAll(): void {
        if (!this.originalImage) return;
        
        console.log('Reset All called - restoring original image');
        
        // Restore original image
        this.image = this.originalImage;
        
        // Reset all transformations to initial state
        this.state = {
            rotation: 0,
            flipX: false,
            flipY: false,
            cropX: 0,
            cropY: 0,
            cropWidth: this.originalImage.width,
            cropHeight: this.originalImage.height
        };
        
        console.log('Reset to original image and state:', this.state);
        
        // Recalculate canvas size for original image
        this.calculateFixedCanvasSize();
        
        // Don't clear history - instead go back to initial state in history
        this.historyIndex = 0;
        this.history[0] = { ...this.state };
        
        // Update UI elements
        this.updateUIFromState();
        
        // Render without saving new state (we're going back to index 0)
        this.render();
    }
    
    private applyCrop(): void {
        if (!this.image) return;
        
        // Create a new cropped image from current crop area
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;
        
        // Set high-quality rendering settings
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        
        // Set canvas to crop size
        tempCanvas.width = this.state.cropWidth;
        tempCanvas.height = this.state.cropHeight;
        
        // Draw the cropped portion
        tempCtx.drawImage(
            this.image,
            this.state.cropX,
            this.state.cropY,
            this.state.cropWidth,
            this.state.cropHeight,
            0,
            0,
            this.state.cropWidth,
            this.state.cropHeight
        );
        
        // Create new image from cropped canvas
        const croppedImage = new Image();
        croppedImage.onload = () => {
            // Replace current image with cropped version
            this.image = croppedImage;
            
            // Reset crop to full new image size
            this.state.cropX = 0;
            this.state.cropY = 0;
            this.state.cropWidth = croppedImage.width;
            this.state.cropHeight = croppedImage.height;
            
            // Recalculate canvas size for new image
            this.calculateFixedCanvasSize();
            
            // Save state with image data for crop operations
            this.saveState();
            this.render();
            
            // Show feedback by briefly changing button style
            const saveCropBtn = this.overlay?.querySelector('.qr-save-crop-btn');
            if (saveCropBtn) {
                saveCropBtn.classList.add('success-feedback');
                setTimeout(() => {
                    saveCropBtn.classList.remove('success-feedback');
                }, 1500);
            }
        };
        
        croppedImage.src = tempCanvas.toDataURL('image/png');
    }

    private switchTab(tab: 'rotation' | 'crop'): void {
        if (!this.overlay) return;
        
        // Toggle crop mode
        this.cropMode = (tab === 'crop');
        
        // Show/hide crop overlay
        if (this.cropOverlay) {
            this.cropOverlay.style.display = this.cropMode ? 'block' : 'none';
        }
        
        // Auto-select entire image when entering crop mode for the first time
        // (only if crop dimensions are not yet set or are at initial state)
        if (this.cropMode && this.image) {
            const isInitialCropState = 
                this.state.cropWidth === this.image.width && 
                this.state.cropHeight === this.image.height &&
                this.state.cropX === 0 &&
                this.state.cropY === 0;
            
            // Only reset if it's at the initial full image state
            if (isInitialCropState && this.historyIndex === 0) {
                // Don't reset, crop is already at full image
            }
        }
        
        // Update tab buttons (only rotation and crop, not flip toggles)
        const tabs = this.getElements('.qr-editor-tab:not(.qr-flip-toggle-tab)');
        tabs?.forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-tab') === tab);
        });
        
        // Update tab content
        const contents = this.getElements('.qr-editor-tab-content');
        contents?.forEach(c => {
            const element = c as HTMLElement;
            element.style.display = c.getAttribute('data-content') === tab ? 'block' : 'none';
        });
    }

    private updateRotationValue(): void {
        const valueSpan = this.getElement('.qr-rotation-value');
        if (valueSpan) {
            valueSpan.textContent = `${this.state.rotation}°`;
        }
    }


    private handleToolAction(action: string): void {
        switch (action) {
            case 'undo':
                this.undo();
                break;
            case 'redo':
                this.redo();
                break;
            case 'reset':
                this.resetAll();
                break;
            case 'flip-h':
                this.toggleFlip('horizontal');
                break;
            case 'flip-v':
                this.toggleFlip('vertical');
                break;
        }
    }

    private saveState(): void {
        // Remove any states after current index (branching from middle of history)
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        // Create new state
        const newState: EditorState = { ...this.state };
        
        // Always include image data for proper history restoration
        if (this.canvas) {
            newState.imageDataUrl = this.canvas.toDataURL('image/png');
        }
        
        // Add new state
        this.history.push(newState);
        this.historyIndex++;
        
        console.log('State saved. History index:', this.historyIndex, 'History length:', this.history.length);
        console.log('Current state:', this.state);
        console.log('Image data included:', !!newState.imageDataUrl);
        
        // Limit history to 50 states for better undo/redo experience
        if (this.history.length > 50) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    private undo(): void {
        console.log('Undo called. History index:', this.historyIndex, 'History length:', this.history.length);
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const targetState = this.history[this.historyIndex];
            
            // Update state (excluding imageDataUrl) with validation
            this.state = {
                rotation: targetState.rotation,
                flipX: targetState.flipX,
                flipY: targetState.flipY,
                cropX: Math.max(0, targetState.cropX || 0),
                cropY: Math.max(0, targetState.cropY || 0),
                cropWidth: Math.max(50, targetState.cropWidth || (this.image?.width || 100)),
                cropHeight: Math.max(50, targetState.cropHeight || (this.image?.height || 100))
            };
            
            console.log('Undo to state:', this.state, 'History index:', this.historyIndex);
            
            // Restore image from stored data or original
            if (targetState.imageDataUrl) {
                this.restoreImageFromDataUrl(targetState.imageDataUrl);
            } else {
                // Fallback to original image
                this.image = this.originalImage;
                this.calculateFixedCanvasSize();
                this.updateUIFromState();
                this.render();
                if (this.cropMode) {
                    setTimeout(() => {
                        this.updateCropOverlay();
                        console.log('Crop overlay updated after undo to original image');
                    }, 50);
                }
            }
        } else {
            console.log('Cannot undo - already at beginning of history');
        }
    }

    private redo(): void {
        console.log('Redo called. History index:', this.historyIndex, 'History length:', this.history.length);
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const targetState = this.history[this.historyIndex];
            
            // Update state (excluding imageDataUrl) with validation
            this.state = {
                rotation: targetState.rotation,
                flipX: targetState.flipX,
                flipY: targetState.flipY,
                cropX: Math.max(0, targetState.cropX || 0),
                cropY: Math.max(0, targetState.cropY || 0),
                cropWidth: Math.max(50, targetState.cropWidth || (this.image?.width || 100)),
                cropHeight: Math.max(50, targetState.cropHeight || (this.image?.height || 100))
            };
            
            console.log('Redo to state:', this.state, 'History index:', this.historyIndex);
            
            // Restore image from stored data
            if (targetState.imageDataUrl) {
                this.restoreImageFromDataUrl(targetState.imageDataUrl);
            } else {
                // Fallback - just update UI and render
                this.updateUIFromState();
                this.render();
                if (this.cropMode) {
                    setTimeout(() => {
                        this.updateCropOverlay();
                        console.log('Crop overlay updated after redo fallback');
                    }, 50);
                }
            }
        } else {
            console.log('Cannot redo - already at end of history');
        }
    }

    private updateUIFromState(): void {
        if (!this.overlay) return;
        
        // Update rotation slider
        const rotationSlider = this.getElement<HTMLInputElement>('.qr-rotation-slider');
        if (rotationSlider) {
            rotationSlider.value = String(this.state.rotation);
            this.updateRotationValue();
        }
        
        // Update flip toggle tabs
        const flipTabs = this.getElements('.qr-flip-toggle-tab');
        flipTabs?.forEach(tab => {
            const element = tab as HTMLElement;
            const flipType = element.dataset.flip;
            
            element.classList.toggle('active', 
                flipType === 'horizontal' ? this.state.flipX : 
                flipType === 'vertical' ? this.state.flipY : false
            );
        });
        
        // Update crop overlay position if in crop mode
        if (this.cropMode) {
            // Force a refresh of crop overlay positioning
            setTimeout(() => this.updateCropOverlay(), 0);
        }
    }

    private calculateFixedCanvasSize(): void {
        if (!this.canvas || !this.image) return;
        
        // Get actual viewport dimensions for mobile
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Get container dimensions with fallback to viewport
        const containerElement = this.canvas.parentElement;
        const containerWidth = containerElement?.clientWidth || viewportWidth;
        const containerHeight = containerElement?.clientHeight || (viewportHeight * 0.75); // Increased height allocation
        
        console.log('Container dimensions:', containerWidth, 'x', containerHeight);
        console.log('Image dimensions:', this.image.width, 'x', this.image.height);
        
        // Calculate display dimensions to fill mobile screen
        const imgRatio = this.image.width / this.image.height;
        const containerRatio = containerWidth / containerHeight;
        
        let displayWidth: number;
        let displayHeight: number;
        
        // Fill container more completely for better visibility
        if (imgRatio > containerRatio) {
            // Image is wider - fit to width
            displayWidth = containerWidth * 0.95; // Increased from 0.98 to 0.95 for better fit
            displayHeight = displayWidth / imgRatio;
        } else {
            // Image is taller - fit to height  
            displayHeight = containerHeight * 0.95; // Increased from 0.98 to 0.95 for better fit
            displayWidth = displayHeight * imgRatio;
        }
        
        console.log('Display dimensions:', displayWidth, 'x', displayHeight);
        
        // Store fixed dimensions
        this.fixedCanvasWidth = displayWidth;
        this.fixedCanvasHeight = displayHeight;
        this.imageScale = displayWidth / this.image.width;
        
        // Initialize crop dimensions to full image if not set
        if (this.state.cropWidth === 0 || this.state.cropHeight === 0) {
            this.state.cropX = 0;
            this.state.cropY = 0;
            this.state.cropWidth = this.image.width;  // Full image width in original coordinates
            this.state.cropHeight = this.image.height; // Full image height in original coordinates
        }
    }

    private render(): void {
        if (!this.canvas || !this.ctx || !this.image) return;
        
        // Use fixed canvas size (doesn't change with transformations)
        const displayWidth = this.fixedCanvasWidth;
        const displayHeight = this.fixedCanvasHeight;
        
        // Set canvas to fixed size
        this.canvas.width = displayWidth;
        this.canvas.height = displayHeight;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, displayWidth, displayHeight);
        
        // Set high-quality rendering for display
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        
        // Save context state
        this.ctx.save();
        
        // Move to center for rotation
        this.ctx.translate(displayWidth / 2, displayHeight / 2);
        
        // Apply rotation (convert from -180/+180 range to radians)
        this.ctx.rotate((this.state.rotation * Math.PI) / 180);
        
        // Apply flip
        this.ctx.scale(
            this.state.flipX ? -1 : 1,
            this.state.flipY ? -1 : 1
        );
        
        // Draw image centered
        this.ctx.drawImage(
            this.image,
            -displayWidth / 2,
            -displayHeight / 2,
            displayWidth,
            displayHeight
        );
        
        // Restore context state
        this.ctx.restore();
        
        // Update crop overlay if in crop mode
        if (this.cropMode) {
            this.updateCropOverlay();
        }
    }
    
    private updateCropOverlay(): void {
        if (!this.cropOverlay || !this.canvas || !this.image) {
            console.log('Cannot update crop overlay - missing elements:', {
                cropOverlay: !!this.cropOverlay,
                canvas: !!this.canvas,
                image: !!this.image
            });
            return;
        }
        
        // Validate and constrain crop state to image boundaries
        const maxCropX = Math.max(0, this.image.width - 50);
        const maxCropY = Math.max(0, this.image.height - 50);
        const maxCropWidth = this.image.width - this.state.cropX;
        const maxCropHeight = this.image.height - this.state.cropY;
        
        // Constrain crop values to valid ranges
        const constrainedCropX = Math.max(0, Math.min(this.state.cropX, maxCropX));
        const constrainedCropY = Math.max(0, Math.min(this.state.cropY, maxCropY));
        const constrainedCropWidth = Math.max(50, Math.min(this.state.cropWidth, maxCropWidth));
        const constrainedCropHeight = Math.max(50, Math.min(this.state.cropHeight, maxCropHeight));
        
        // Update state if values were constrained
        if (constrainedCropX !== this.state.cropX || constrainedCropY !== this.state.cropY ||
            constrainedCropWidth !== this.state.cropWidth || constrainedCropHeight !== this.state.cropHeight) {
            this.state.cropX = constrainedCropX;
            this.state.cropY = constrainedCropY;
            this.state.cropWidth = constrainedCropWidth;
            this.state.cropHeight = constrainedCropHeight;
            console.log('Crop state constrained to image boundaries:', this.state);
        }
        
        // Get canvas position within its container
        const canvasRect = this.canvas.getBoundingClientRect();
        const containerRect = this.canvas.parentElement!.getBoundingClientRect();
        
        // Calculate canvas offset within container
        const canvasOffsetX = canvasRect.left - containerRect.left;
        const canvasOffsetY = canvasRect.top - containerRect.top;
        
        // Calculate the actual displayed image position on canvas
        const displayedImageWidth = this.fixedCanvasWidth;
        const displayedImageHeight = this.fixedCanvasHeight;
        
        // Get the actual canvas dimensions
        const canvasDisplayWidth = this.canvas.offsetWidth;
        const canvasDisplayHeight = this.canvas.offsetHeight;
        
        // Calculate image position within the canvas (centered) - more precise calculation
        const imageStartX = canvasOffsetX + Math.round((canvasDisplayWidth - displayedImageWidth) / 2);
        const imageStartY = canvasOffsetY + Math.round((canvasDisplayHeight - displayedImageHeight) / 2);
        
        // Calculate crop rectangle in screen coordinates relative to displayed image
        const cropLeft = imageStartX + (this.state.cropX * this.imageScale);
        const cropTop = imageStartY + (this.state.cropY * this.imageScale);
        const cropWidth = (this.state.cropWidth * this.imageScale);
        const cropHeight = (this.state.cropHeight * this.imageScale);
        
        // Ensure crop overlay stays within the displayed image bounds
        const maxCropLeft = imageStartX + displayedImageWidth - cropWidth;
        const maxCropTop = imageStartY + displayedImageHeight - cropHeight;
        
        const constrainedCropLeft = Math.max(imageStartX, Math.min(cropLeft, maxCropLeft));
        const constrainedCropTop = Math.max(imageStartY, Math.min(cropTop, maxCropTop));
        
        console.log('Updating crop overlay:', {
            imageInfo: { width: this.image.width, height: this.image.height },
            displayedImage: { width: displayedImageWidth, height: displayedImageHeight },
            imagePosition: { x: imageStartX, y: imageStartY },
            cropState: { x: this.state.cropX, y: this.state.cropY, w: this.state.cropWidth, h: this.state.cropHeight },
            imageScale: this.imageScale,
            originalPosition: { left: cropLeft, top: cropTop },
            finalPosition: { left: constrainedCropLeft, top: constrainedCropTop, width: cropWidth, height: cropHeight }
        });
        
        // Position the overlay using constrained values with precise pixel alignment
        this.cropOverlay.style.left = `${Math.round(constrainedCropLeft)}px`;
        this.cropOverlay.style.top = `${Math.round(constrainedCropTop)}px`;
        this.cropOverlay.style.width = `${Math.round(cropWidth)}px`;
        this.cropOverlay.style.height = `${Math.round(cropHeight)}px`;
        
        // Ensure overlay is visible
        this.cropOverlay.style.display = 'block';
    }

    private restoreImageFromDataUrl(dataUrl: string): void {
        const img = new Image();
        img.onload = () => {
            this.image = img;
            this.calculateFixedCanvasSize();
            this.updateUIFromState();
            this.render();
            
            // Force crop overlay update with longer delay to ensure canvas is fully rendered
            if (this.cropMode) {
                setTimeout(() => {
                    this.updateCropOverlay();
                    console.log('Crop overlay updated after image restoration');
                }, 50);
            }
        };
        img.src = dataUrl;
    }

    private async handleSave(): Promise<void> {
        if (!this.image) return;
        
        try {
            // Create a final canvas with all transformations
            const finalCanvas = document.createElement('canvas');
            const finalCtx = finalCanvas.getContext('2d');
            
            if (!finalCtx) throw new Error('Failed to create canvas context');
            
            // Set maximum quality rendering settings
            finalCtx.imageSmoothingEnabled = true;
            finalCtx.imageSmoothingQuality = 'high';
            
            // Additional quality settings for better rendering
            finalCtx.globalCompositeOperation = 'source-over';
            
            // Set output dimensions based on crop area only
            const outputWidth = Math.round(this.state.cropWidth);
            const outputHeight = Math.round(this.state.cropHeight);
            
            finalCanvas.width = outputWidth;
            finalCanvas.height = outputHeight;
            
            // Apply transformations
            finalCtx.save();
            
            // Move to center
            finalCtx.translate(outputWidth / 2, outputHeight / 2);
            
            // Apply rotation
            finalCtx.rotate((this.state.rotation * Math.PI) / 180);
            
            // Apply flip only (no scale)
            finalCtx.scale(
                this.state.flipX ? -1 : 1,
                this.state.flipY ? -1 : 1
            );
            
            // Draw cropped region
            finalCtx.drawImage(
                this.image,
                this.state.cropX,
                this.state.cropY,
                this.state.cropWidth,
                this.state.cropHeight,
                -this.state.cropWidth / 2,
                -this.state.cropHeight / 2,
                this.state.cropWidth,
                this.state.cropHeight
            );
            
            finalCtx.restore();
            
            // Convert to blob - use PNG for lossless quality, fallback to high-quality JPEG
            const blob = await new Promise<Blob>((resolve, reject) => {
                // Try PNG first for lossless quality
                finalCanvas.toBlob(
                    (b) => {
                        if (b) {
                            resolve(b);
                        } else {
                            // Fallback to high-quality JPEG
                            finalCanvas.toBlob(
                                (jpegBlob) => {
                                    if (jpegBlob) resolve(jpegBlob);
                                    else reject(new Error('Failed to create blob'));
                                },
                                'image/jpeg',
                                1.0  // Maximum quality
                            );
                        }
                    },
                    'image/png'  // Use PNG for lossless quality
                );
            });
            
            // Create file with appropriate extension
            const isPng = blob.type === 'image/png';
            const fileName = this.config.fileName || `edited-${Date.now()}.${isPng ? 'png' : 'jpg'}`;
            const file = new File([blob], fileName, { type: blob.type });
            
            // Always call save callback without uploading
            // Upload will be handled later by the parent component
            this.config.onSave(file);
            
            // Close editor
            this.close();
        } catch (error) {
            console.error('Failed to save image:', error);
            alert('Failed to save image. Please try again.');
        }
    }


    private handleCancel(): void {
        this.config.onCancel();
        this.close();
    }

    private close(): void {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        
        // Revoke object URL
        if (this.image) {
            URL.revokeObjectURL(this.image.src);
        }
    }
}
