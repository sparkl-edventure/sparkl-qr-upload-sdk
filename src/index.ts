// Import the QrUpload class and its types
import { QrUpload } from './QrUpload';
import { generateQrCode, generateQrUrl, generateSessionId } from './utils/qr';
import './styles.css';

// Export types
export type {
  ImageFile,
  ApiConfig,
  PollingCallbacks,
  QrUploadConfig,
  QRCodeGenerationOptions,
  IQRUploadSDK
} from './QrUpload';

// Export types from types file
export type { ImageConfig } from './types';

// Export the QrUpload class
export { QrUpload };

// Export utilities
export { 
  generateQrCode,
  generateQrUrl,
  generateSessionId 
};

// Export PDF utilities
export { 
  imagesToPdf, 
  imageToPdf,
  type PdfOptions 
} from './utils/pdf';


// Default export for backward compatibility
export default QrUpload;

// Export all types for better IDE support
export * from './QrUpload';
