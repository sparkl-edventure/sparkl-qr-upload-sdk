import type { ImageFile, ImageConfig } from '../types';
import { imagesToPdf } from '../utils/pdf';
import Sortable from 'sortablejs';

export interface MultiScanConfig {
    parent: HTMLElement;
    imageConfig: ImageConfig;
    nativeCameraInput: HTMLInputElement;
    logoUrl?: string | null;
    onDone: (result: File | File[]) => void;
    onCancel: () => void;
}

/**
 * MultiScan component for capturing and managing multiple images
 * Provides interface similar to document scanning apps with page management
 */
export class MultiScan {
    private config: MultiScanConfig;
    private container: HTMLElement | null = null;
    private images: ImageFile[] = [];
    private currentImageIndex: number = 0;
    private sortableInstance: Sortable | null = null;
    private editMode: 'none' | 'crop' | 'rotate' = 'none';
    private rotation: number = 0; // Current rotation angle in degrees
    
    // Crop state (matches ImageEditor's EditorState)
    private cropState = { x: 0, y: 0, width: 0, height: 0 };
    private isDraggingCrop = false;
    private dragType: 'handle' | 'move' | null = null;
    private dragHandleType: string | null = null;
    private dragStartPos = { x: 0, y: 0 };
    private cropStartState = { x: 0, y: 0, width: 0, height: 0 };
    private cropOverlay: HTMLElement | null = null;
    private currentImage: HTMLImageElement | null = null;

    constructor(config: MultiScanConfig) {
        this.config = config;
        this.render();
    }

    private render(): void {
        // Clear parent
        this.config.parent.innerHTML = '';

        // Create main container
        this.container = document.createElement('div');
        this.container.className = 'qr-upload__ms-container';

        // Top app bar
        const appBar = this.createAppBar();
        
        // Main preview area (with crop overlay inside)
        const previewArea = this.createPreviewArea();
        
        // Add crop overlay to preview area
        const cropOverlay = document.createElement('div');
        cropOverlay.className = 'qr-upload__ms-crop-overlay';
        cropOverlay.id = 'qr-upload-ms-crop-overlay';
        cropOverlay.style.display = 'none';
        cropOverlay.innerHTML = `
            <!-- Corner handles -->
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-nw" data-handle="nw"></div>
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-ne" data-handle="ne"></div>
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-sw" data-handle="sw"></div>
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-se" data-handle="se"></div>
            <!-- Edge handles -->
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-n" data-handle="n"></div>
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-s" data-handle="s"></div>
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-e" data-handle="e"></div>
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-w" data-handle="w"></div>
        `;
        const imageContainer = previewArea.querySelector('#qr-upload-ms-image-container');
        imageContainer?.appendChild(cropOverlay);
        
        // Bottom toolbar with thumbnails
        const toolbar = this.createToolbar();

        this.container.appendChild(appBar);
        this.container.appendChild(previewArea);
        this.container.appendChild(toolbar);

        this.config.parent.appendChild(this.container);

        // Update UI to show empty state or images
        this.updateUI();
    }

    private createAppBar(): HTMLElement {
        const appBar = document.createElement('div');
        appBar.className = 'qr-upload__ms-appbar';

        // Logo (if provided)
        if (this.config.logoUrl) {
            const logoImg = document.createElement('img');
            logoImg.src = this.config.logoUrl;
            logoImg.alt = 'Logo';
            logoImg.className = 'qr-upload__ms-logo';
            appBar.appendChild(logoImg);
        }


        const title = document.createElement('h2');
        title.className = 'qr-upload__ms-title';
        title.textContent = 'Scan Documents';

        const pageCount = document.createElement('span');
        pageCount.className = 'qr-upload__ms-page-count';
        pageCount.textContent = `${this.images.length} page${this.images.length !== 1 ? 's' : ''}`;

        appBar.appendChild(title);
        appBar.appendChild(pageCount);

        return appBar;
    }

    private createPreviewArea(): HTMLElement {
        const previewArea = document.createElement('div');
        previewArea.className = 'qr-upload__ms-preview-area';
        previewArea.id = 'qr-upload-ms-preview-area';

        const imageContainer = document.createElement('div');
        imageContainer.className = 'qr-upload__ms-image-container';
        imageContainer.id = 'qr-upload-ms-image-container';

        const previewImg = document.createElement('img');
        previewImg.className = 'qr-upload__ms-preview-img';
        previewImg.alt = 'Preview';
        previewImg.id = 'qr-upload-ms-preview-img';

        // Crop overlay with handles (hidden by default)
        const cropOverlay = document.createElement('div');
        cropOverlay.className = 'qr-upload__ms-crop-overlay';
        cropOverlay.id = 'qr-upload-ms-crop-overlay';
        cropOverlay.style.display = 'none';
        cropOverlay.innerHTML = `
            <!-- Corner handles -->
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-nw" data-handle="nw"></div>
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-ne" data-handle="ne"></div>
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-sw" data-handle="sw"></div>
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-se" data-handle="se"></div>
            <!-- Edge handles -->
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-n" data-handle="n"></div>
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-s" data-handle="s"></div>
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-e" data-handle="e"></div>
            <div class="qr-upload__ms-crop-handle qr-upload__ms-crop-handle-w" data-handle="w"></div>
        `;

        const emptyState = document.createElement('div');
        emptyState.className = 'qr-upload__ms-empty-state';
        emptyState.innerHTML = `
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <p>Tap the + button to start scanning</p>
        `;

        // Add page FAB (Floating Action Button) - positioned top right
        const addPageFab = document.createElement('button');
        addPageFab.className = 'qr-upload__ms-fab';
        addPageFab.innerHTML = `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
        `;
        addPageFab.addEventListener('click', () => this.addPage());

        imageContainer.appendChild(previewImg);
        imageContainer.appendChild(cropOverlay);
        
        previewArea.appendChild(emptyState);
        previewArea.appendChild(imageContainer);
        previewArea.appendChild(addPageFab);

        return previewArea;
    }


    private createToolbar(): HTMLElement {
        const toolbar = document.createElement('div');
        toolbar.className = 'qr-upload__ms-toolbar';
        toolbar.id = 'qr-upload-ms-toolbar';

        // Thumbnail container at the top
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'qr-upload__ms-thumbnails';
        thumbnailContainer.id = 'qr-upload-ms-thumbnails';

        // Action buttons container (Crop, Rotate, Delete)
        const actions = document.createElement('div');
        actions.className = 'qr-upload__ms-actions';

        // Crop button
        const cropBtn = this.createActionButton('Crop', `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"></path>
                <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"></path>
            </svg>
        `, () => this.cropImage());

        // Rotate button
        const rotateBtn = this.createActionButton('Rotate', `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
        `, () => this.rotateImage());

        // Delete button
        const deleteBtn = this.createActionButton('Delete', `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        `, () => this.deleteCurrentPage());

        actions.appendChild(cropBtn);
        actions.appendChild(rotateBtn);
        actions.appendChild(deleteBtn);

        // Next button (large yellow button)
        const nextBtn = document.createElement('button');
        nextBtn.className = 'qr-upload__ms-next-btn';
        nextBtn.textContent = 'Generate PDF';
        nextBtn.addEventListener('click', () => this.handleDone());

        // Home indicator bar at bottom
        const homeIndicator = document.createElement('div');
        homeIndicator.className = 'qr-upload__ms-home-indicator';

        toolbar.appendChild(thumbnailContainer);
        toolbar.appendChild(actions);
        toolbar.appendChild(nextBtn);
        toolbar.appendChild(homeIndicator);

        return toolbar;
    }

    private createActionButton(label: string, icon: string, onClick: () => void): HTMLElement {
        const btn = document.createElement('button');
        btn.className = 'qr-upload__ms-action-btn';
        btn.innerHTML = `
            ${icon}
            <span>${label}</span>
        `;
        btn.addEventListener('click', onClick);
        return btn;
    }

    private addPage(): void {
        const maxImages = this.config.imageConfig.maxImages || 10;
        if (this.images.length >= maxImages) {
            this.showToast(`Maximum ${maxImages} pages allowed`, 'error');
            return;
        }

        // Trigger native camera
        this.config.nativeCameraInput.click();
    }

    public handleImageCapture(file: File): void {
        const imageFile: ImageFile = {
            id: crypto.randomUUID(),
            previewUrl: URL.createObjectURL(file),
            file,
            status: 'pending',
            timestamp: new Date()
        };

        this.images.push(imageFile);
        this.currentImageIndex = this.images.length - 1;
        this.updateUI();
    }

    private updateUI(): void {
        // Update page count
        const pageCount = this.container?.querySelector('.qr-upload__ms-page-count');
        if (pageCount) {
            pageCount.textContent = `${this.images.length} page${this.images.length !== 1 ? 's' : ''}`;
        }

        // Update preview
        const previewImg = this.container?.querySelector('#qr-upload-ms-preview-img') as HTMLImageElement;
        const emptyState = this.container?.querySelector('.qr-upload__ms-empty-state') as HTMLElement;
        
        if (this.images.length === 0) {
            if (previewImg) previewImg.style.display = 'none';
            if (emptyState) emptyState.style.display = 'flex';
        } else {
            if (previewImg) {
                previewImg.src = this.images[this.currentImageIndex].previewUrl;
                previewImg.style.display = 'block';
            }
            if (emptyState) emptyState.style.display = 'none';
        }

        // Update thumbnails
        this.renderThumbnails();

        // Update next button state
        const nextBtn = this.container?.querySelector('.qr-upload__ms-next-btn') as HTMLButtonElement;
        if (nextBtn) {
            nextBtn.disabled = this.images.length === 0;
        }
    }

    private renderThumbnails(): void {
        const thumbnailContainer = this.container?.querySelector('#qr-upload-ms-thumbnails');
        if (!thumbnailContainer) return;

        thumbnailContainer.innerHTML = '';

        this.images.forEach((img, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'qr-upload__ms-thumbnail';
            thumb.dataset.index = String(index);
            
            if (index === this.currentImageIndex) {
                thumb.classList.add('qr-upload__ms-thumbnail--active');
            }

            thumb.innerHTML = `
                <img src="${img.previewUrl}" alt="Page ${index + 1}" />
                <span class="qr-upload__ms-thumbnail-number">${index + 1}</span>
                <button class="qr-upload__ms-thumbnail-delete" data-index="${index}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `;

            thumb.addEventListener('click', (e) => {
                // Don't trigger if clicking delete button
                if ((e.target as HTMLElement).closest('.qr-upload__ms-thumbnail-delete')) {
                    return;
                }
                this.currentImageIndex = index;
                this.updateUI();
            });

            const deleteBtn = thumb.querySelector('.qr-upload__ms-thumbnail-delete');
            deleteBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deletePageByIndex(index);
            });

            thumbnailContainer.appendChild(thumb);
        });

        // Initialize Sortable for drag-and-drop reordering
        if (this.sortableInstance) {
            this.sortableInstance.destroy();
        }

        this.sortableInstance = Sortable.create(thumbnailContainer as HTMLElement, {
            animation: 200,
            easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
            ghostClass: 'qr-upload__ms-thumbnail--ghost',
            chosenClass: 'qr-upload__ms-thumbnail--chosen',
            dragClass: 'qr-upload__ms-thumbnail--drag',
            onEnd: (evt) => {
                if (evt.oldIndex != null && evt.newIndex != null) {
                    const [moved] = this.images.splice(evt.oldIndex, 1);
                    this.images.splice(evt.newIndex, 0, moved);
                    
                    // Update current index if needed
                    if (this.currentImageIndex === evt.oldIndex) {
                        this.currentImageIndex = evt.newIndex;
                    } else if (
                        evt.oldIndex < this.currentImageIndex &&
                        evt.newIndex >= this.currentImageIndex
                    ) {
                        this.currentImageIndex--;
                    } else if (
                        evt.oldIndex > this.currentImageIndex &&
                        evt.newIndex <= this.currentImageIndex
                    ) {
                        this.currentImageIndex++;
                    }
                    
                    this.updateUI();
                }
            }
        });
    }

    private cropImage(): void {
        if (this.images.length === 0) return;
        
        this.editMode = 'crop';
        
        // Get preview image and initialize crop state (matching ImageEditor's openEditor)
        const previewImg = this.container?.querySelector('#qr-upload-ms-preview-img') as HTMLImageElement;
        
        // Wait for image to load
        const initCrop = () => {
            if (previewImg && previewImg.naturalWidth && previewImg.naturalHeight) {
                this.currentImage = previewImg;
                
                // Initialize crop to full image dimensions (matching ImageEditor)
                this.cropState = {
                    x: 0,
                    y: 0,
                    width: previewImg.naturalWidth,
                    height: previewImg.naturalHeight
                };
                
                // Get crop overlay reference (matching ImageEditor's setupCropHandlers)
                this.cropOverlay = this.container?.querySelector('#qr-upload-ms-crop-overlay') as HTMLElement;
                if (this.cropOverlay) {
                    this.cropOverlay.style.display = 'block';
                }
                
                this.setupCropHandlers();
                
                // Update overlay position after a short delay (matching ImageEditor's setTimeout pattern)
                setTimeout(() => {
                    this.updateCropOverlay();
                }, 100);
            }
        };
        
        if (previewImg.complete && previewImg.naturalWidth) {
            initCrop();
        } else {
            previewImg.onload = initCrop;
        }
        
        // Show crop edit toolbar
        this.showEditToolbar('crop');
    }

    private rotateImage(): void {
        if (this.images.length === 0) return;
        
        this.editMode = 'rotate';
        this.rotation = 0;
        
        // Show rotate edit toolbar
        this.showEditToolbar('rotate');
    }

    private showEditToolbar(mode: 'crop' | 'rotate'): void {
        const toolbar = this.container?.querySelector('#qr-upload-ms-toolbar') as HTMLElement;
        if (!toolbar) return;

        // Clear toolbar content
        toolbar.innerHTML = '';

        if (mode === 'rotate') {
            // Create rotate controls
            const rotateControls = document.createElement('div');
            rotateControls.className = 'qr-upload__ms-edit-controls';
            rotateControls.innerHTML = `
                <div class="qr-upload__ms-edit-rotate-controls-container">
                <div class="qr-upload__ms-edit-rotate-controls-container-buttons">
                <button class=" qr-upload__ms-cancel-btn">
                    <span>Cancel</span>
                </button>
                 <span> Rotate </span>
                 <button class=" qr-upload__ms-rotate-apply-btn">
                     <span>Apply</span>
                 </button>
                </div>
                <div class="qr-upload__ms-edit-rotate-controls-container-buttons">
                <button class="qr-upload__ms-rotate-left-btn">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                    </svg>
                    <span>Left</span>
                </button>
                <button class="qr-upload__ms-rotate-right-btn">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    <span>Right</span>
                </button>
                </div>
                </div>
            `;

            toolbar.appendChild(rotateControls);

            // Setup event listeners
            const rotateLeftBtn = toolbar.querySelector('.qr-upload__ms-rotate-left-btn');
            const rotateRightBtn = toolbar.querySelector('.qr-upload__ms-rotate-right-btn');
            const applyBtn = toolbar.querySelector('.qr-upload__ms-rotate-apply-btn');
            const cancelBtn = toolbar.querySelector('.qr-upload__ms-cancel-btn');

            rotateLeftBtn?.addEventListener('click', () => this.handleRotate(-90));
            rotateRightBtn?.addEventListener('click', () => this.handleRotate(90));
            applyBtn?.addEventListener('click', () => this.applyRotation());
            cancelBtn?.addEventListener('click', () => this.cancelEdit());

        } else if (mode === 'crop') {
            // Create crop controls
            const cropControls = document.createElement('div');
            cropControls.className = 'qr-upload__ms-edit-controls';
            cropControls.innerHTML = `
            <div class="qr-upload__ms-edit-crop-controls-container">
            <div class="qr-upload__ms-edit-crop-controls">
                <button class="qr-upload__ms-reset-btn">
                    <span>Cancel</span>
                </button>
                <span> Crop </span>
                <button class="qr-upload__ms-save-btn">
                   
                    <span>Save</span>
                </button>
            </div>
            <span class="qr-upload__ms-edit-crop-controls-text"> Drag handles to adjust crop area </span>
            </div>
            `;

            toolbar.appendChild(cropControls);

            // Setup event listeners
            const resetBtn = toolbar.querySelector('.qr-upload__ms-reset-btn');
            const saveBtn = toolbar.querySelector('.qr-upload__ms-save-btn');

            resetBtn?.addEventListener('click', () => this.cancelEdit());
            saveBtn?.addEventListener('click', () => this.saveCrop());
        }
    }

    private handleRotate(angle: number): void {
        this.rotation = (this.rotation + angle) % 360;
        if (this.rotation < 0) this.rotation += 360;
        
        const previewImg = this.container?.querySelector('#qr-upload-ms-preview-img') as HTMLImageElement;
        if (previewImg) {
            previewImg.style.transform = `rotate(${this.rotation}deg)`;
            previewImg.style.transition = 'transform 0.3s ease';
        }
    }

    private cancelEdit(): void {
        // Reset rotation/crop state
        this.rotation = 0;
        const previewImg = this.container?.querySelector('#qr-upload-ms-preview-img') as HTMLImageElement;
        if (previewImg) {
            previewImg.style.transform = '';
        }
        
        // Hide crop overlay if visible
        const cropOverlay = this.container?.querySelector('#qr-upload-ms-crop-overlay') as HTMLElement;
        if (cropOverlay) {
            cropOverlay.style.display = 'none';
        }
        
        this.editMode = 'none';
        this.restoreToolbar();
    }

    private saveCrop(): void {
        this.applyCrop();
    }

    private restoreToolbar(): void {
        const toolbar = this.container?.querySelector('#qr-upload-ms-toolbar') as HTMLElement;
        if (!toolbar) return;

        // Clear and rebuild toolbar
        toolbar.innerHTML = '';

        // Thumbnail container
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'qr-upload__ms-thumbnails';
        thumbnailContainer.id = 'qr-upload-ms-thumbnails';

        // Action buttons
        const actions = document.createElement('div');
        actions.className = 'qr-upload__ms-actions';

        const cropBtn = this.createActionButton('Crop', `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"></path>
                <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"></path>
            </svg>
        `, () => this.cropImage());

        const rotateBtn = this.createActionButton('Rotate', `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
        `, () => this.rotateImage());

        const deleteBtn = this.createActionButton('Delete', `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        `, () => this.deleteCurrentPage());

        actions.appendChild(cropBtn);
        actions.appendChild(rotateBtn);
        actions.appendChild(deleteBtn);

        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'qr-upload__ms-next-btn';
        nextBtn.textContent = 'Submit';
        nextBtn.addEventListener('click', () => this.handleDone());

        // Home indicator
        const homeIndicator = document.createElement('div');
        homeIndicator.className = 'qr-upload__ms-home-indicator';

        toolbar.appendChild(thumbnailContainer);
        toolbar.appendChild(actions);
        toolbar.appendChild(nextBtn);
        toolbar.appendChild(homeIndicator);

        // Update thumbnails
        this.updateUI();
    }


    private async applyRotation(): Promise<void> {
        const currentImage = this.images[this.currentImageIndex];
        
        try {
            // Load image
            const img = await this.loadImage(currentImage.file);
            
            // Create canvas
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not get canvas context');

            // Calculate new dimensions after rotation
            const rad = (this.rotation * Math.PI) / 180;
            const sin = Math.abs(Math.sin(rad));
            const cos = Math.abs(Math.cos(rad));
            
            canvas.width = img.width * cos + img.height * sin;
            canvas.height = img.width * sin + img.height * cos;

            // Apply rotation
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(rad);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);

            // Convert to file
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(blob => {
                    if (blob) resolve(blob);
                    else reject(new Error('Failed to create blob'));
                }, 'image/jpeg', 0.9);
            });

            const newFile = new File([blob], currentImage.file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
            });

            // Update image
            URL.revokeObjectURL(currentImage.previewUrl);
            currentImage.file = newFile;
            currentImage.previewUrl = URL.createObjectURL(newFile);

            // Reset rotation state and UI
            this.rotation = 0;
            const previewImg = this.container?.querySelector('#qr-upload-ms-preview-img') as HTMLImageElement;
            if (previewImg) previewImg.style.transform = '';
            
            this.editMode = 'none';
            this.showToast('Image rotated', 'success');
            this.restoreToolbar();

        } catch (error) {
            console.error('Failed to rotate image:', error);
            this.showToast('Failed to rotate image', 'error');
        }
    }

    private loadImage(file: File): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };
            
            img.src = url;
        });
    }


    // ===== CROP FUNCTIONALITY =====

    private setupCropHandlers(): void {
        // Match ImageEditor's setupCropHandlers (lines 399-432)
        const cropOverlay = this.container?.querySelector('#qr-upload-ms-crop-overlay') as HTMLElement;
        if (!cropOverlay) return;

        // Set initial visibility based on crop mode
        cropOverlay.style.display = 'block';

        const handles = cropOverlay.querySelectorAll('.qr-upload__ms-crop-handle');
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => this.startCropDrag(e as MouseEvent));
            handle.addEventListener('touchstart', (e) => this.startCropDrag(e as TouchEvent));
        });

        // Drag the crop area itself - make entire overlay draggable except handles (matching ImageEditor lines 412-426)
        cropOverlay.addEventListener('mousedown', (e) => {
            const target = e.target as HTMLElement;
            // Allow dragging if clicking on the overlay itself or any non-handle child
            if (!target.classList.contains('qr-upload__ms-crop-handle')) {
                this.startCropMove(e);
            }
        });

        cropOverlay.addEventListener('touchstart', (e) => {
            const target = e.target as HTMLElement;
            if (!target.classList.contains('qr-upload__ms-crop-handle')) {
                // For touch, we need to handle it differently - just use the first touch point
                const touch = e.touches[0];
                const mouseEvent = new MouseEvent('mousedown', {
                    clientX: touch.clientX,
                    clientY: touch.clientY
                });
                this.startCropMove(mouseEvent);
            }
        });

        // Document-level listeners for drag and end events (matching ImageEditor lines 428-431)
        document.addEventListener('mousemove', (e) => this.onCropDrag(e));
        document.addEventListener('touchmove', (e) => this.onCropDrag(e));
        document.addEventListener('mouseup', () => this.stopCropDrag());
        document.addEventListener('touchend', () => this.stopCropDrag());
    }

    private startCropDrag(e: MouseEvent | TouchEvent): void {
        // Match ImageEditor's startCropDrag (lines 440-460)
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
            x: this.cropState.x,
            y: this.cropState.y,
            width: this.cropState.width,
            height: this.cropState.height
        };
    }

    private startCropMove(e: MouseEvent): void {
        // Match ImageEditor's startCropMove (lines 462-484)
        if (!this.currentImage) {
            return;
        }

        console.log('Starting crop move');
        this.isDraggingCrop = true;
        this.dragType = 'move';

        const clientX = 'clientX' in e ? e.clientX : 0;
        const clientY = 'clientY' in e ? e.clientY : 0;

        this.dragStartPos = { x: clientX, y: clientY };
        this.cropStartState = {
            x: this.cropState.x,
            y: this.cropState.y,
            width: this.cropState.width,
            height: this.cropState.height
        };

        e.preventDefault();
        e.stopPropagation();
    }

    private onCropDrag(e: MouseEvent | TouchEvent): void {
        // Match ImageEditor's onCropDrag logic exactly (lines 486-608)
        if (!this.isDraggingCrop || !this.currentImage) return;

        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        // Calculate actual scale based on displayed image size (matching ImageEditor lines 492-494)
        const actualImageWidth = this.currentImage.offsetWidth;
        const actualImageScale = actualImageWidth / this.currentImage.naturalWidth;

        // Use actual scale for delta calculations (matching ImageEditor lines 496-498)
        const deltaX = (clientX - this.dragStartPos.x) / actualImageScale;
        const deltaY = (clientY - this.dragStartPos.y) / actualImageScale;

        if (this.dragType === 'handle' && this.dragHandleType) {
            // Handle resize logic with proper constraints (matching ImageEditor lines 500-582)
            const { x, y, width, height } = this.cropStartState;
            const MIN_SIZE = 50;

            // Store original state for calculations
            let newX = x;
            let newY = y;
            let newWidth = width;
            let newHeight = height;

            switch (this.dragHandleType) {
                case 'nw':
                    // Northwest corner - resize from top-left
                    newX = Math.max(0, Math.min(x + deltaX, x + width - MIN_SIZE));
                    newY = Math.max(0, Math.min(y + deltaY, y + height - MIN_SIZE));
                    newWidth = width - (newX - x);
                    newHeight = height - (newY - y);
                    break;

                case 'ne':
                    // Northeast corner - resize from top-right
                    newY = Math.max(0, Math.min(y + deltaY, y + height - MIN_SIZE));
                    newWidth = Math.max(MIN_SIZE, Math.min(width + deltaX, this.currentImage.naturalWidth - x));
                    newHeight = height - (newY - y);
                    break;

                case 'sw':
                    // Southwest corner - resize from bottom-left
                    newX = Math.max(0, Math.min(x + deltaX, x + width - MIN_SIZE));
                    newWidth = width - (newX - x);
                    newHeight = Math.max(MIN_SIZE, Math.min(height + deltaY, this.currentImage.naturalHeight - y));
                    break;

                case 'se':
                    // Southeast corner - resize from bottom-right
                    newWidth = Math.max(MIN_SIZE, Math.min(width + deltaX, this.currentImage.naturalWidth - x));
                    newHeight = Math.max(MIN_SIZE, Math.min(height + deltaY, this.currentImage.naturalHeight - y));
                    break;

                // Edge handles
                case 'n':
                    // North edge - resize from top
                    newY = Math.max(0, Math.min(y + deltaY, y + height - MIN_SIZE));
                    newHeight = height - (newY - y);
                    break;

                case 's':
                    // South edge - resize from bottom
                    newHeight = Math.max(MIN_SIZE, Math.min(height + deltaY, this.currentImage.naturalHeight - y));
                    break;

                case 'e':
                    // East edge - resize from right
                    newWidth = Math.max(MIN_SIZE, Math.min(width + deltaX, this.currentImage.naturalWidth - x));
                    break;

                case 'w':
                    // West edge - resize from left
                    newX = Math.max(0, Math.min(x + deltaX, x + width - MIN_SIZE));
                    newWidth = width - (newX - x);
                    break;
            }

            // Final constraints to ensure crop stays within image bounds (matching ImageEditor lines 564-568)
            newX = Math.max(0, Math.min(newX, this.currentImage.naturalWidth - MIN_SIZE));
            newY = Math.max(0, Math.min(newY, this.currentImage.naturalHeight - MIN_SIZE));
            newWidth = Math.max(MIN_SIZE, Math.min(newWidth, this.currentImage.naturalWidth - newX));
            newHeight = Math.max(MIN_SIZE, Math.min(newHeight, this.currentImage.naturalHeight - newY));

            // Apply the new values
            this.cropState.x = newX;
            this.cropState.y = newY;
            this.cropState.width = newWidth;
            this.cropState.height = newHeight;

            console.log('Crop resize:', {
                handle: this.dragHandleType,
                crop: { x: newX, y: newY, width: newWidth, height: newHeight },
                image: { width: this.currentImage.naturalWidth, height: this.currentImage.naturalHeight },
                scale: actualImageScale
            });

        } else if (this.dragType === 'move') {
            // Move entire crop area (matching ImageEditor lines 583-600)
            const newX = this.cropStartState.x + deltaX;
            const newY = this.cropStartState.y + deltaY;

            // Constrain movement to keep crop within image bounds
            this.cropState.x = Math.max(0, Math.min(newX, this.currentImage.naturalWidth - this.cropState.width));
            this.cropState.y = Math.max(0, Math.min(newY, this.currentImage.naturalHeight - this.cropState.height));

            console.log('Crop move:', {
                crop: { x: this.cropState.x, y: this.cropState.y },
                maxPosition: {
                    x: this.currentImage.naturalWidth - this.cropState.width,
                    y: this.currentImage.naturalHeight - this.cropState.height
                },
                scale: actualImageScale
            });
        }

        // Ensure crop overlay updates immediately during drag (matching ImageEditor lines 605-607)
        this.updateCropOverlay();
    }

    private stopCropDrag(): void {
        // Match ImageEditor's stopCropDrag (lines 610-617)
        if (this.isDraggingCrop) {
            this.isDraggingCrop = false;
            this.dragType = null;
            this.dragHandleType = null;
            // Note: ImageEditor saves state here, but we don't have history in MultiScan
        }
    }

    private updateCropOverlay(): void {
        // Match ImageEditor's updateCropOverlay logic exactly
        if (!this.cropOverlay || !this.currentImage) {
            console.log('Cannot update crop overlay - missing elements:', {
                cropOverlay: !!this.cropOverlay,
                currentImage: !!this.currentImage
            });
            return;
        }

        const imageContainer = this.container?.querySelector('#qr-upload-ms-image-container') as HTMLElement;
        if (!imageContainer) return;

        // Validate and constrain crop state to image boundaries (matching ImageEditor lines 1042-1062)
        const maxCropX = Math.max(0, this.currentImage.naturalWidth - 50);
        const maxCropY = Math.max(0, this.currentImage.naturalHeight - 50);
        const maxCropWidth = this.currentImage.naturalWidth - this.cropState.x;
        const maxCropHeight = this.currentImage.naturalHeight - this.cropState.y;

        // Constrain crop values to valid ranges
        const constrainedCropX = Math.max(0, Math.min(this.cropState.x, maxCropX));
        const constrainedCropY = Math.max(0, Math.min(this.cropState.y, maxCropY));
        const constrainedCropWidth = Math.max(50, Math.min(this.cropState.width, maxCropWidth));
        const constrainedCropHeight = Math.max(50, Math.min(this.cropState.height, maxCropHeight));

        // Update state if values were constrained
        if (constrainedCropX !== this.cropState.x || constrainedCropY !== this.cropState.y ||
            constrainedCropWidth !== this.cropState.width || constrainedCropHeight !== this.cropState.height) {
            this.cropState.x = constrainedCropX;
            this.cropState.y = constrainedCropY;
            this.cropState.width = constrainedCropWidth;
            this.cropState.height = constrainedCropHeight;
            console.log('Crop state constrained to image boundaries:', this.cropState);
        }

        // Get image position within its container (matching ImageEditor lines 1064-1075)
        const imgRect = this.currentImage.getBoundingClientRect();
        const containerRect = imageContainer.getBoundingClientRect();

        // The image is rendered at its actual displayed size (offsetWidth/Height)
        const actualImageWidth = this.currentImage.offsetWidth;
        const actualImageHeight = this.currentImage.offsetHeight;

        // Calculate image offset within container
        const imageOffsetX = imgRect.left - containerRect.left;
        const imageOffsetY = imgRect.top - containerRect.top;

        // Calculate scale based on actual displayed dimensions (matching ImageEditor line 1079)
        const actualImageScale = actualImageWidth / this.currentImage.naturalWidth;

        console.log('Image positioning:', {
            imgRect: { left: imgRect.left, top: imgRect.top, width: imgRect.width, height: imgRect.height },
            containerRect: { left: containerRect.left, top: containerRect.top, width: containerRect.width, height: containerRect.height },
            imageOffset: { x: imageOffsetX, y: imageOffsetY },
            actualImageSize: { width: actualImageWidth, height: actualImageHeight },
            naturalImageSize: { width: this.currentImage.naturalWidth, height: this.currentImage.naturalHeight },
            actualScale: actualImageScale
        });

        // Image starts at the offset position (matching ImageEditor lines 1092-1094)
        const imageStartX = imageOffsetX;
        const imageStartY = imageOffsetY;

        // Calculate crop rectangle in screen coordinates using actual scale (matching ImageEditor lines 1096-1100)
        const cropLeft = imageStartX + (this.cropState.x * actualImageScale);
        const cropTop = imageStartY + (this.cropState.y * actualImageScale);
        const cropWidth = this.cropState.width * actualImageScale;
        const cropHeight = this.cropState.height * actualImageScale;

        // Ensure crop overlay stays within the displayed image bounds (matching ImageEditor lines 1102-1107)
        const maxCropLeft = imageStartX + actualImageWidth - cropWidth;
        const maxCropTop = imageStartY + actualImageHeight - cropHeight;

        const constrainedCropLeft = Math.max(imageStartX, Math.min(cropLeft, maxCropLeft));
        const constrainedCropTop = Math.max(imageStartY, Math.min(cropTop, maxCropTop));

        console.log('Crop overlay positioning:', {
            cropState: { x: this.cropState.x, y: this.cropState.y, w: this.cropState.width, h: this.cropState.height },
            scale: actualImageScale,
            calculatedPosition: { left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight },
            finalPosition: { left: constrainedCropLeft, top: constrainedCropTop, width: cropWidth, height: cropHeight }
        });

        // Position the overlay using constrained values with precise pixel alignment (matching ImageEditor lines 1116-1123)
        this.cropOverlay.style.left = `${Math.round(constrainedCropLeft)}px`;
        this.cropOverlay.style.top = `${Math.round(constrainedCropTop)}px`;
        this.cropOverlay.style.width = `${Math.round(cropWidth)}px`;
        this.cropOverlay.style.height = `${Math.round(cropHeight)}px`;

        // Ensure overlay is visible
        this.cropOverlay.style.display = 'block';
    }

    private async applyCrop(): Promise<void> {
        const currentImage = this.images[this.currentImageIndex];
        
        try {
            // Load image
            const img = await this.loadImage(currentImage.file);
            
            // Crop state is already in image coordinates, so use it directly
            const cropX = Math.round(this.cropState.x);
            const cropY = Math.round(this.cropState.y);
            const cropWidth = Math.round(this.cropState.width);
            const cropHeight = Math.round(this.cropState.height);

            console.log('Applying crop:', { cropX, cropY, cropWidth, cropHeight, imageSize: { width: img.width, height: img.height } });

            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.width = cropWidth;
            canvas.height = cropHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not get canvas context');

            // Draw cropped portion
            ctx.drawImage(
                img,
                cropX,
                cropY,
                cropWidth,
                cropHeight,
                0,
                0,
                cropWidth,
                cropHeight
            );

            // Convert to file
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(blob => {
                    if (blob) resolve(blob);
                    else reject(new Error('Failed to create blob'));
                }, 'image/jpeg', 0.9);
            });

            const newFile = new File([blob], currentImage.file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
            });

            // Update image
            URL.revokeObjectURL(currentImage.previewUrl);
            currentImage.file = newFile;
            currentImage.previewUrl = URL.createObjectURL(newFile);

            console.log('Crop applied successfully');

            // Hide crop overlay and reset state
            const cropOverlay = this.container?.querySelector('#qr-upload-ms-crop-overlay') as HTMLElement;
            if (cropOverlay) cropOverlay.style.display = 'none';
            
            this.editMode = 'none';
            this.showToast('Image cropped', 'success');
            this.restoreToolbar();

        } catch (error) {
            console.error('Failed to crop image:', error);
            this.showToast('Failed to crop image', 'error');
        }
    }

    private deleteCurrentPage(): void {
        if (this.images.length === 0) return;
        this.deletePageByIndex(this.currentImageIndex);
    }

    private deletePageByIndex(index: number): void {
        if (index < 0 || index >= this.images.length) return;

        // Revoke object URL to free memory
        URL.revokeObjectURL(this.images[index].previewUrl);
        
        // Remove from array
        this.images.splice(index, 1);

        // Adjust current index
        if (this.images.length === 0) {
            this.currentImageIndex = 0;
        } else if (this.currentImageIndex >= this.images.length) {
            this.currentImageIndex = this.images.length - 1;
        }

        this.updateUI();

        this.showToast('Page deleted', 'success');
    }

    private async handleDone(): Promise<void> {
        if (this.images.length === 0) {
            this.showToast('Please add at least one page', 'error');
            return;
        }

        try {
            // Show loader
            this.showLoader('Generating PDF...');
            
            // Always convert to PDF
            const pdfConfig = this.config.imageConfig.pdf;
            const pdfFile = await imagesToPdf(
                this.images.map(img => img.file),
                {
                    pageSize: pdfConfig?.pageSize || 'a4',
                    orientation: pdfConfig?.orientation || 'portrait',
                    fileName: pdfConfig?.fileName || `scan-${Date.now()}.pdf`,
                    quality: pdfConfig?.quality || 0.85
                }
            );

            this.hideLoader();
            this.config.onDone(pdfFile);

            // Cleanup
            this.cleanup();
        } catch (error) {
            this.hideLoader();
            console.error('Failed to process images:', error);
            this.showToast(
                error instanceof Error ? error.message : 'Failed to generate PDF',
                'error'
            );
        }
    }

    private cleanup(): void {
        // Revoke all object URLs
        this.images.forEach(img => URL.revokeObjectURL(img.previewUrl));
        this.images = [];

        // Destroy sortable instance
        if (this.sortableInstance) {
            this.sortableInstance.destroy();
            this.sortableInstance = null;
        }

        // Remove container
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }

    private showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
        const toast = document.createElement('div');
        toast.className = `qr-upload__toast qr-upload__toast_${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    private showLoader(message: string): void {
        const loader = document.createElement('div');
        loader.className = 'qr-upload__ms-loader';
        loader.id = 'qr-upload-ms-loader';
        loader.innerHTML = `
            <div class="qr-upload__ms-loader-content">
                <div class="qr-upload__ms-spinner"></div>
                <p>${message}</p>
            </div>
        `;
        document.body.appendChild(loader);
    }

    private hideLoader(): void {
        const loader = document.getElementById('qr-upload-ms-loader');
        if (loader) {
            loader.remove();
        }
    }

    // Public method to destroy the component
    public destroy(): void {
        this.cleanup();
    }
}


