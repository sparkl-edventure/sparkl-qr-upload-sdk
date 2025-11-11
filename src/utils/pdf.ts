import { jsPDF } from 'jspdf';

export interface PdfOptions {
    pageSize?: 'a4' | 'letter' | 'legal';
    orientation?: 'portrait' | 'landscape';
    fileName?: string;
    quality?: number; // 0.1 to 1
}

/**
 * Load an image file and convert to data URL
 */
async function fileToDataUrl(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
            try {
                // Create canvas to convert image to data URL
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    URL.revokeObjectURL(url);
                    reject(new Error('Failed to get canvas context'));
                    return;
                }
                
                // Draw image to canvas
                ctx.drawImage(img, 0, 0);
                
                // Convert to data URL
                const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                
                URL.revokeObjectURL(url);
                resolve({
                    dataUrl,
                    width: img.naturalWidth,
                    height: img.naturalHeight
                });
            } catch (error) {
                URL.revokeObjectURL(url);
                reject(error);
            }
        };
        
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error(`Failed to load image: ${file.name}`));
        };
        
        img.src = url;
    });
}

/**
 * Calculate dimensions to fit image within PDF page while maintaining aspect ratio
 */
function calculateFitDimensions(
    imgWidth: number,
    imgHeight: number,
    pageWidth: number,
    pageHeight: number,
    margin: number = 10
): { width: number; height: number; x: number; y: number } {
    const maxWidth = pageWidth - (margin * 2);
    const maxHeight = pageHeight - (margin * 2);
    
    let width = imgWidth;
    let height = imgHeight;
    
    // Scale down if image is larger than page
    const widthRatio = maxWidth / width;
    const heightRatio = maxHeight / height;
    const ratio = Math.min(widthRatio, heightRatio, 1); // Don't scale up
    
    width *= ratio;
    height *= ratio;
    
    // Center on page
    const x = (pageWidth - width) / 2;
    const y = (pageHeight - height) / 2;
    
    return { width, height, x, y };
}

/**
 * Convert array of image files to a single PDF
 * @param files - Array of image files to convert
 * @param options - PDF generation options
 * @returns A File object containing the generated PDF
 */
export async function imagesToPdf(
    files: File[],
    options: PdfOptions = {}
): Promise<File> {
    if (!files || files.length === 0) {
        throw new Error('No files provided for PDF conversion');
    }
    
    const {
        pageSize = 'a4',
        orientation = 'portrait',
        fileName = `scan-${Date.now()}.pdf`
    } = options;
    
    // Map orientation to jsPDF format
    const pdfOrientation = orientation === 'landscape' ? 'l' : 'p';
    
    // Create PDF document
    const pdf = new jsPDF({
        orientation: pdfOrientation,
        unit: 'mm',
        format: pageSize,
        compress: true
    });
    
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    // Process each image
    for (let i = 0; i < files.length; i++) {
        try {
            const { dataUrl, width: imgWidth, height: imgHeight } = await fileToDataUrl(files[i]);
            
            // Calculate dimensions to fit on page
            const { width, height, x, y } = calculateFitDimensions(
                imgWidth,
                imgHeight,
                pageWidth,
                pageHeight
            );
            
            // Add new page for images after the first
            if (i > 0) {
                pdf.addPage();
            }
            
            // Add image to PDF using data URL
            pdf.addImage(dataUrl, 'JPEG', x, y, width, height, undefined, 'FAST');
            
        } catch (error) {
            console.error(`Failed to add image ${i + 1} to PDF:`, error);
            throw new Error(`Failed to process image ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    // Generate PDF blob
    const pdfBlob = pdf.output('blob');
    
    // Create File object from blob
    const pdfFile = new File([pdfBlob], fileName, {
        type: 'application/pdf',
        lastModified: Date.now()
    });
    
    console.log(`Generated PDF: ${fileName} (${(pdfFile.size / 1024 / 1024).toFixed(2)} MB, ${files.length} pages)`);
    
    return pdfFile;
}

/**
 * Convert a single image to PDF
 * @param file - Image file to convert
 * @param options - PDF generation options
 * @returns A File object containing the generated PDF
 */
export async function imageToPdf(
    file: File,
    options: PdfOptions = {}
): Promise<File> {
    return imagesToPdf([file], options);
}

