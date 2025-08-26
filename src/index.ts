// Import the QrUpload class and its types
import { QrUpload, initQrUpload } from './QrUpload';
import './styles.css';

import type { 
  QrUploadConfig, 
  ImageFile, 
  ApiConfig, 
  QRCodeGenerationOptions,
  IQRUploadSDK 
} from './QrUpload';

// Import QR code utilities
import { generateQrCode as generateQrCodeUtil, generateQrUrl, generateSessionId } from './utils/qr';

// Re-export types
export type { 
  QrUploadConfig, 
  ImageFile, 
  ApiConfig, 
  QRCodeGenerationOptions,
  IQRUploadSDK
};

// Re-export the QrUpload class and initQrUpload function
export { QrUpload, initQrUpload };

// Re-export utility functions
export { generateQrUrl, generateSessionId };

// Export the generateQrCode function with proper typing
export const generateQrCode = (url: string, options: QRCodeGenerationOptions = {}): Promise<string> => {
  return generateQrCodeUtil(url, {
    size: options.size || 200,
    color: options.color || '#000000',
    backgroundColor: options.backgroundColor || '#ffffff',
    errorCorrectionLevel: options.errorCorrectionLevel || 'H',
    margin: options.margin ?? 1,
  });
};


// Default export for backward compatibility
export default QrUpload;
