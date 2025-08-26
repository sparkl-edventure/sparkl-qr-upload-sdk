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
export declare function generateQrCode(data: string | object, options?: QRCodeOptions): Promise<string>;
/**
 * Generate a unique session ID
 * @returns A unique session ID string
 */
export declare function generateSessionId(): string;
/**
 * Generate a QR code URL for the upload page
 * @param frontendUrl - Base URL of the frontend
 * @param sdkRoute - SDK route (default: '/qr-upload')
 * @param sessionId - Optional session ID
 * @returns Full URL for the QR code
 */
export declare function generateQrUrl(frontendUrl: string, sdkRoute?: string, sessionId?: string): string;
//# sourceMappingURL=qr.d.ts.map