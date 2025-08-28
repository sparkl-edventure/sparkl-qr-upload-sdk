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

// Export the QrUpload class
export { QrUpload };

// Export utilities
export { 
  generateQrCode,
  generateQrUrl,
  generateSessionId 
};


// Default export for backward compatibility
export default QrUpload;

// Export all types for better IDE support
export * from './QrUpload';
