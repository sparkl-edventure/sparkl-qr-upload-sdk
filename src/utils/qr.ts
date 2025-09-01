import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
// QR code generation options
export interface QRCodeOptions {
  size?: number;
  color?: string;
  backgroundColor?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
}

/**
 * Generate a QR code as a data URL
 * @param data - Data to encode in the QR code
 * @param options - QR code generation options
 * @returns Promise that resolves with the data URL of the QR code
 */
export async function generateQrCode(
  data: string | object,
  options: QRCodeOptions = {}
): Promise<string> {
  const {
    size = 200,
    color = '#000000',
    backgroundColor = '#ffffff',
    errorCorrectionLevel = 'H',
    margin = 1,
  } = options;

  const dataString = typeof data === 'string' ? data : JSON.stringify(data);

  try {
    // Create a canvas element to render the QR code
    const canvas = document.createElement('canvas');
    
    // Generate QR code to canvas with direct color strings
    await QRCode.toCanvas(canvas, dataString, {
      width: size,
      color: {
        dark: color as string,
        light: backgroundColor as string,
      },
      errorCorrectionLevel,
      margin,
    });
    
    // Convert canvas to data URL
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Generate a unique session ID
 * @returns A unique session ID string
 */
export function generateSessionId(): string {
  return `sess_${uuidv4().replace(/-/g, '')}`;
}

/**
 * Generate a QR code URL for the upload page
 * @param frontendUrl - Base URL of the frontend
 * @param sdkRoute - SDK route (default: '/qr-upload')
 * @param sessionId - Optional session ID
 * @returns Full URL for the QR code
 */
export function generateQrUrl(
  frontendUrl: string,
  sdkRoute?: string,
  sessionId?: string,
  params?: Record<string, string>,
): string {
  const url = new URL(frontendUrl);

  // Only append sdkRoute if provided
  if (sdkRoute && sdkRoute.trim()) {
    url.pathname = pathJoin(url.pathname, sdkRoute);
  }

  if (sessionId) {
    url.searchParams.set("session_id", sessionId);
  }

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

// Helper: safely join paths
function pathJoin(base: string, append: string): string {
  if (!base.endsWith("/")) base += "/";
  if (append.startsWith("/")) append = append.slice(1);
  return base + append;
}

