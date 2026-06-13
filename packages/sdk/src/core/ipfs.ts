import axios from 'axios';
import type { PinataConfig } from '@prisma-events/dids-types';

/**
 * Pinata IPFS client for pinning DID documents
 *
 * ⚠️ SECURITY WARNING: Using apiKey/apiSecret in browser bundles exposes credentials.
 *
 * For production client-side usage:
 * - Use JWT pinning tokens with scoped permissions (recommended)
 * - Proxy Pinata API calls through your backend
 * - NEVER ship apiKey/apiSecret to client bundles
 *
 * The JWT option provides better security for client-side applications.
 */
export class PinataClient {
  constructor(private config: PinataConfig) {}

  async pinJSON(data: object): Promise<string> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use JWT if available, otherwise fall back to API key/secret
        const headers = 'jwt' in this.config && this.config.jwt
          ? {
              'Authorization': `Bearer ${this.config.jwt}`,
              'Content-Type': 'application/json'
            }
          : {
              'pinata_api_key': (this.config as { apiKey: string; apiSecret: string }).apiKey,
              'pinata_secret_api_key': (this.config as { apiKey: string; apiSecret: string }).apiSecret,
              'Content-Type': 'application/json'
            };

        // Extract DID from data if it's a DID document
        const didId = (data as any)?.id;
        const pinataContent = {
          pinataContent: data,
          pinataMetadata: {
            name: didId ? `DID Document - ${didId.split(':').pop()?.substring(0, 20)}...` : 'Prisma DID Document',
          }
        };

        const response = await axios.post(
          'https://api.pinata.cloud/pinning/pinJSONToIPFS',
          pinataContent,
          {
            headers,
            timeout: 30000  // 30s timeout
          }
        );
        return response.data.IpfsHash;  // Returns CID (Qm...)
      } catch (error: any) {
        lastError = error;

        // Don't retry on auth errors
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw new Error(`Pinata authentication failed: ${error.message}`);
        }

        // Exponential backoff for retries
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Pinata pinning failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  async verifyPin(cid: string): Promise<boolean> {
    try {
      await axios.get(`https://gateway.pinata.cloud/ipfs/${cid}`, { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }
}
