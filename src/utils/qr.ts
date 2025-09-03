import QRCodeStyling from 'qr-code-styling';
import { v4 as uuidv4 } from 'uuid';
// QR code generation options
export interface QRCodeGenerationOptions {
  size?: number;
  color?: string;
  backgroundColor?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
  qrImage?: string;
}

/**
 * Generate a QR code as a data URL
 * @param data - Data to encode in the QR code
 * @param options - QR code generation options
 * @returns Promise that resolves with the data URL of the QR code
 */


export async function generateQrCode(
  data: string,
  options: QRCodeGenerationOptions = {}
): Promise<string> {
  const {
    size = 300,
    color = "#000000",
    backgroundColor = "#ffffff",
    margin = 0,
    qrImage,
  } = options;

  return new Promise((resolve, reject) => {
    try {
      const qrCode = new QRCodeStyling({
        width: size,
        height: size,
        data,
        image: qrImage,
        backgroundOptions: { color: backgroundColor },
        dotsOptions: { color, type: "rounded" },
        cornersSquareOptions: { type: "extra-rounded" },
        cornersDotOptions: { type: "dot" },
        imageOptions: {
          crossOrigin: "anonymous",
          margin: margin || 10,
        },
      });

      // Export QR to blob
      qrCode.getRawData("png").then(async (blob:any) => {
        const baseImage = await blobToImage(blob);

        // Create canvas bigger than QR (to fit text below)
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;

        const padding = 40; // space for text
        canvas.width = size;
        canvas.height = size + padding;

        // Draw QR
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(baseImage, 0, 0);
        
        // Export final image
        resolve(canvas.toDataURL("image/png"));
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Helper: convert Blob -> HTMLImageElement
function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
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

