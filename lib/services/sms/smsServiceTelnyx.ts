// @ts-ignore
const Telnyx = require('telnyx');

// Lazy initialization to prevent build errors
let telnyx: any = null;

function getTelnyxClient() {
  if (!telnyx) {
    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) {
      console.warn('TELNYX_API_KEY not found. SMS will work in sandbox mode only.');
      return null;
    }
    // CRITICAL FIX: Telnyx SDK is a function, NOT a constructor
    // Remove 'new' keyword - it should be called as a function
    telnyx = Telnyx(apiKey);
    
    // Debug: Log client structure to understand API
    console.log('🔍 Telnyx Client Debug:', {
      hasMessages: !!telnyx.messages,
      hasMessaging: !!telnyx.messaging,
      clientKeys: Object.keys(telnyx).slice(0, 10), // First 10 keys
      messagesType: typeof telnyx.messages,
      // Deep inspection of messages object
      messagesKeys: telnyx.messages ? Object.keys(telnyx.messages).slice(0, 20) : [],
      messagesCreateExists: !!(telnyx.messages && telnyx.messages.create),
      messagesCreateType: telnyx.messages ? typeof telnyx.messages.create : 'undefined',
    });
  }
  return telnyx;
}

export interface SMSMessage {
  to: string;
  body: string;
  from?: string;
}

export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class SMSService {
  // Retry configuration constants
  private static readonly MAX_RETRIES = 3;
  private static readonly FETCH_TIMEOUT_MS = 8000; // 8 seconds - well under Vercel's 15s default
  private static readonly BASE_RETRY_DELAY_MS = 1000; // 1 second base delay
  private static readonly MAX_RETRY_DELAY_MS = 5000; // Max 5 seconds between retries

  static async sendSMS(message: SMSMessage): Promise<SMSResult> {
    const startTime = Date.now();
    const logContext = {
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      vercelUrl: process.env.VERCEL_URL || 'local',
      to: message.to,
      messageLength: message.body.length,
    };

    try {
      console.log('📤 SMS Send Request:', logContext);

      // Read environment variables dynamically on each call
      const fromNumber = process.env.TELNYX_PHONE_NUMBER;
      const apiKey = process.env.TELNYX_API_KEY;
      const isSandboxMode = process.env.TELNYX_SANDBOX_MODE === 'true';

      // Debug: Log environment variables with full context
      console.log('🔍 Environment Debug:', {
        ...logContext,
        TELNYX_SANDBOX_MODE: process.env.TELNYX_SANDBOX_MODE || 'UNDEFINED',
        isSandboxMode: isSandboxMode,
        TELNYX_PHONE_NUMBER: fromNumber ? 'SET' : 'NOT SET',
        TELNYX_API_KEY: apiKey ? 'SET' : 'NOT SET',
        NODE_ENV: process.env.NODE_ENV || 'UNDEFINED',
        VERCEL_ENV: process.env.VERCEL_ENV || 'local',
        VERCEL_URL: process.env.VERCEL_URL || 'local',
      });

      // Sandbox mode simulation - doesn't need real phone number
      if (isSandboxMode) {
        console.log('🔧 SANDBOX MODE: Simulating SMS send', {
          ...logContext,
          from: fromNumber || 'SANDBOX',
          body: message.body.substring(0, 50) + '...',
          simulated: true,
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const sandboxMessageId = `sandbox_${Date.now()}`;
        console.log('✅ Sandbox SMS "sent" successfully:', {
          ...logContext,
          messageId: sandboxMessageId,
          duration: Date.now() - startTime,
        });
        
        return {
          success: true,
          messageId: sandboxMessageId,
        };
      }

      // Real SMS requires phone number and API key
      if (!fromNumber) {
        const errorMsg = `Telnyx phone number not configured. Environment: ${process.env.VERCEL_ENV || 'local'}. Please add TELNYX_PHONE_NUMBER to your environment variables.`;
        console.error('❌ SMS Configuration Error - Missing Phone Number:', {
          ...logContext,
          error: errorMsg,
          missingVariable: 'TELNYX_PHONE_NUMBER',
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
        });
        return {
          success: false,
          error: errorMsg,
        };
      }

      if (!apiKey) {
        const errorMsg = `Telnyx API key not configured. Environment: ${process.env.VERCEL_ENV || 'local'}. Please add TELNYX_API_KEY to your environment variables.`;
        console.error('❌ SMS Configuration Error - Missing API Key:', {
          ...logContext,
          error: errorMsg,
          missingVariable: 'TELNYX_API_KEY',
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
        });
        return {
          success: false,
          error: errorMsg,
        };
      }

      // Lazy initialization check
      console.log('🔧 Initializing Telnyx client...', logContext);
      const client = getTelnyxClient();
      if (!client) {
        const errorMsg = 'Telnyx client not initialized. API key may be invalid or missing.';
        console.error('❌ SMS Configuration Error - Client Initialization Failed:', {
          ...logContext,
          error: errorMsg,
        });
        return {
          success: false,
          error: errorMsg,
        };
      }
      console.log('✅ Telnyx client initialized successfully', logContext);

      // Real SMS sending via Telnyx API
      console.log('✅ Sending REAL SMS via Telnyx:', {
        ...logContext,
        from: fromNumber,
        body: message.body.substring(0, 50) + '...',
      });

      let result: any;
      let usedSDK = false;
      
      // Try SDK methods first (with retry logic)
      if (client) {
        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
          try {
            // Pattern 1: Standard messages.create
            if (client.messages?.create && typeof client.messages.create === 'function') {
              console.log(`📡 Attempting SDK: client.messages.create (Attempt ${attempt}/${this.MAX_RETRIES})`, logContext);
              result = await Promise.race([
                client.messages.create({
                  from: fromNumber,
                  to: message.to,
                  text: message.body,
                  type: 'SMS',
                  encoding: 'GSM7',
                }),
                // Add timeout for SDK call too
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('SDK call timeout')), this.FETCH_TIMEOUT_MS)
                )
              ]);
              usedSDK = true;
              console.log('✅ SDK method succeeded: client.messages.create', {
                ...logContext,
                attempt: attempt,
              });
              break; // Success - exit retry loop
            }
            // Pattern 2: Check if messages is a function
            else if (typeof client.messages === 'function') {
              console.log(`📡 Attempting SDK: client.messages() as function (Attempt ${attempt}/${this.MAX_RETRIES})`, logContext);
              result = await Promise.race([
                client.messages({
                  from: fromNumber,
                  to: message.to,
                  text: message.body,
                  type: 'SMS',
                  encoding: 'GSM7',
                }),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('SDK call timeout')), this.FETCH_TIMEOUT_MS)
                )
              ]);
              usedSDK = true;
              console.log('✅ SDK method succeeded: client.messages() as function', {
                ...logContext,
                attempt: attempt,
              });
              break; // Success - exit retry loop
            }
            // Pattern 3: Check messaging API
            else if (client.messaging?.messages?.create && typeof client.messaging.messages.create === 'function') {
              console.log(`📡 Attempting SDK: client.messaging.messages.create (Attempt ${attempt}/${this.MAX_RETRIES})`, logContext);
              result = await Promise.race([
                client.messaging.messages.create({
                  from: fromNumber,
                  to: message.to,
                  text: message.body,
                  type: 'SMS',
                  encoding: 'GSM7',
                }),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('SDK call timeout')), this.FETCH_TIMEOUT_MS)
                )
              ]);
              usedSDK = true;
              console.log('✅ SDK method succeeded: client.messaging.messages.create', {
                ...logContext,
                attempt: attempt,
              });
              break; // Success - exit retry loop
            } else {
              // No SDK methods available - break to use REST API
              break;
            }
          } catch (sdkError: any) {
            const isLastAttempt = attempt === this.MAX_RETRIES;
            console.warn(`⚠️ SDK method failed (Attempt ${attempt}/${this.MAX_RETRIES}):`, {
              ...logContext,
              error: sdkError.message,
              errorStack: sdkError.stack?.split('\n').slice(0, 3),
              errorName: sdkError.name,
              attempt: attempt,
              willRetry: !isLastAttempt,
            });
            
            if (isLastAttempt) {
              // Last attempt failed - fallback to REST API
              console.log('📡 All SDK attempts failed, falling back to REST API', logContext);
              break;
            }
            
            // Wait before retrying (exponential backoff)
            const delay = Math.min(
              this.BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
              this.MAX_RETRY_DELAY_MS
            );
            console.log(`⏳ Waiting ${delay}ms before SDK retry...`, logContext);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // Fallback to REST API if SDK didn't work (with retry logic)
      if (!usedSDK) {
        console.log('📡 Using REST API: Direct HTTP call to Telnyx', {
          ...logContext,
          reason: 'SDK methods not available or failed',
        });
        
        const telnyxApiKey = process.env.TELNYX_API_KEY;
        if (!telnyxApiKey) {
          const errorMsg = 'TELNYX_API_KEY not configured for REST API fallback';
          console.error('❌ REST API Configuration Error:', {
            ...logContext,
            error: errorMsg,
          });
          return {
            success: false,
            error: errorMsg,
          };
        }
        
        const telnyxApiUrl = 'https://api.telnyx.com/v2/messages';
        let lastError: any = null;
        
        // Retry loop for REST API
        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
          try {
            const requestBody = {
              from: fromNumber,
              to: message.to,
              text: message.body,
              type: 'sms',
              encoding: 'auto',
            };

            console.log(`📤 Sending to Telnyx REST API (Attempt ${attempt}/${this.MAX_RETRIES}):`, {
              ...logContext,
              url: telnyxApiUrl,
              from: fromNumber,
              bodyLength: message.body.length,
              apiKeySet: !!telnyxApiKey,
              attempt: attempt,
              timeout: this.FETCH_TIMEOUT_MS,
            });

            // Reduced timeout to 8 seconds (fail fast, well under Vercel's 15s default)
            const fetchController = new AbortController();
            const timeoutId = setTimeout(() => {
              fetchController.abort();
              console.error(`⏱️ Fetch timeout after ${this.FETCH_TIMEOUT_MS}ms (Attempt ${attempt}/${this.MAX_RETRIES})`, logContext);
            }, this.FETCH_TIMEOUT_MS);

            let response: Response;
            try {
              console.log('🌐 Initiating fetch request to Telnyx...', {
                ...logContext,
                attempt: attempt,
              });
              
              // Add more detailed logging before fetch
              console.log('🔍 Fetch Request Details:', {
                ...logContext,
                url: telnyxApiUrl,
                method: 'POST',
                hasApiKey: !!telnyxApiKey,
                apiKeyLength: telnyxApiKey?.length || 0,
                apiKeyPrefix: telnyxApiKey?.substring(0, 10) || 'N/A',
                requestBodySize: JSON.stringify(requestBody).length,
                attempt: attempt,
              });
              
              // Use a more reliable fetch configuration per Telnyx best practices
              response = await fetch(telnyxApiUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${telnyxApiKey}`,
                  'User-Agent': 'Trailblaize-SMS/1.0',
                },
                body: JSON.stringify(requestBody),
                signal: fetchController.signal,
                // Add keepalive to help with connection reuse
                keepalive: true,
                // Explicitly set redirect mode
                redirect: 'follow',
              });
              
              clearTimeout(timeoutId);
              
              console.log('✅ Fetch request completed', {
                ...logContext,
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                attempt: attempt,
              });
              
              // Read response text
              const responseText = await response.text();
              console.log('📥 Raw Telnyx REST API Response:', {
                ...logContext,
                status: response.status,
                statusText: response.statusText,
                responseLength: responseText.length,
                bodyPreview: responseText.substring(0, 500),
                headers: Object.fromEntries(response.headers.entries()),
                ok: response.ok,
                attempt: attempt,
              });

              // Check if response is successful
              if (response.ok) {
                try {
                  result = JSON.parse(responseText);
                } catch (parseError) {
                  throw new Error(`Failed to parse Telnyx response: ${responseText}`);
                }

                // Check for errors in response (Telnyx API returns errors in response even with 200 status)
                if (result.errors && result.errors.length > 0) {
                  const errorMessages = result.errors.map((e: any) => 
                    `${e.code || 'UNKNOWN'}: ${e.title || e.detail || JSON.stringify(e)}`
                  ).join(', ');
                  
                  // Check if it's a retryable error
                  const isRetryable = result.errors.some((e: any) => {
                    const code = e.code?.toString() || '';
                    // Retry on 5xx-like errors or rate limiting
                    return code.startsWith('5') || code === '429' || code === '408';
                  });
                  
                  if (!isRetryable || attempt === this.MAX_RETRIES) {
                    // Non-retryable error or last attempt
                    throw new Error(`Telnyx API errors: ${errorMessages}`);
                  }
                  
                  // Retryable error - continue to retry logic
                  lastError = new Error(`Telnyx API errors: ${errorMessages}`);
                  const delay = Math.min(
                    this.BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
                    this.MAX_RETRY_DELAY_MS
                  );
                  console.log(`⏳ Waiting ${delay}ms before retry after API error...`, logContext);
                  await new Promise(resolve => setTimeout(resolve, delay));
                  continue;
                }

                // Validate response structure
                const messageId = result?.data?.id || result?.id || result?.record?.id;
                
                if (!messageId) {
                  const errorMsg = 'Telnyx API did not return a message ID. Response: ' + JSON.stringify(result).substring(0, 200);
                  console.error('❌ REST API Response Validation Failed:', {
                    ...logContext,
                    status: response.status,
                    error: errorMsg,
                    fullResponse: JSON.stringify(result).substring(0, 1000),
                    attempt: attempt,
                  });
                  
                  if (attempt === this.MAX_RETRIES) {
                    return {
                      success: false,
                      error: errorMsg,
                    };
                  }
                  
                  // Retry on validation failure
                  lastError = new Error(errorMsg);
                  const delay = Math.min(
                    this.BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
                    this.MAX_RETRY_DELAY_MS
                  );
                  console.log(`⏳ Waiting ${delay}ms before retry after validation failure...`, logContext);
                  await new Promise(resolve => setTimeout(resolve, delay));
                  continue;
                }

                console.log('✅ REST API Response Validated:', {
                  ...logContext,
                  status: response.status,
                  messageId: messageId,
                  recordType: result?.data?.record_type || 'unknown',
                  statusField: result?.data?.to?.[0]?.status || 'unknown',
                  responseStructure: {
                    hasData: !!result?.data,
                    hasId: !!result?.id,
                    hasRecord: !!result?.record,
                  },
                  attempt: attempt,
                });
                
                // Success! Break out of retry loop
                break;
              } else {
                // Non-200 response
                const errorMsg = `Telnyx API returned error status ${response.status}: ${response.statusText}`;
                
                // Check if it's a retryable error (5xx or 429)
                const isRetryable = response.status >= 500 || response.status === 429 || response.status === 408;
                const isLastAttempt = attempt === this.MAX_RETRIES;
                
                if (!isRetryable || isLastAttempt) {
                  // Client errors (4xx) - don't retry, or last attempt
                  console.error(`❌ REST API HTTP Error (${isRetryable ? 'Server Error' : 'Client Error'} - ${isLastAttempt ? 'No Retry' : 'No Retry'}):`, {
                    ...logContext,
                    status: response.status,
                    statusText: response.statusText,
                    responseBody: responseText.substring(0, 1000),
                    error: errorMsg,
                    attempt: attempt,
                  });
                  return {
                    success: false,
                    error: errorMsg,
                  };
                }
                
                // Server errors (5xx) or rate limiting (429) - retry
                lastError = new Error(errorMsg);
                console.warn(`⚠️ REST API HTTP Error (Server Error - Will Retry):`, {
                  ...logContext,
                  status: response.status,
                  statusText: response.statusText,
                  responseBody: responseText.substring(0, 500),
                  error: errorMsg,
                  attempt: attempt,
                  willRetry: !isLastAttempt,
                });
                
                const delay = Math.min(
                  this.BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
                  this.MAX_RETRY_DELAY_MS
                );
                console.log(`⏳ Waiting ${delay}ms before retry...`, logContext);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
            } catch (fetchInitError: any) {
              clearTimeout(timeoutId);
              const isLastAttempt = attempt === this.MAX_RETRIES;
              
              console.error(`❌ Fetch Init Error (before response) - Attempt ${attempt}/${this.MAX_RETRIES}:`, {
                ...logContext,
                error: fetchInitError.message,
                errorName: fetchInitError.name,
                errorType: typeof fetchInitError,
                errorCode: fetchInitError.code,
                errorStack: fetchInitError.stack?.split('\n').slice(0, 5),
                attempt: attempt,
                willRetry: !isLastAttempt,
              });
              
              if (fetchInitError.name === 'AbortError') {
                lastError = new Error(`Request to Telnyx API timed out after ${this.FETCH_TIMEOUT_MS}ms`);
                console.error(`❌ REST API Timeout - Attempt ${attempt}/${this.MAX_RETRIES}:`, {
                  ...logContext,
                  error: lastError.message,
                  duration: Date.now() - startTime,
                  attempt: attempt,
                  willRetry: !isLastAttempt,
                });
                
                if (isLastAttempt) {
                  return {
                    success: false,
                    error: lastError.message,
                  };
                }
                
                // Wait before retrying (exponential backoff)
                const delay = Math.min(
                  this.BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
                  this.MAX_RETRY_DELAY_MS
                );
                console.log(`⏳ Waiting ${delay}ms before retry after timeout...`, logContext);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
              
              // Other errors - retry if not last attempt
              lastError = fetchInitError;
              if (isLastAttempt) {
                throw fetchInitError;
              }
              
              const delay = Math.min(
                this.BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
                this.MAX_RETRY_DELAY_MS
              );
              console.log(`⏳ Waiting ${delay}ms before retry after error...`, logContext);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          } catch (fetchError: any) {
            lastError = fetchError;
            const isLastAttempt = attempt === this.MAX_RETRIES;
            
            console.error(`❌ REST API Error - Attempt ${attempt}/${this.MAX_RETRIES}:`, {
              ...logContext,
              error: fetchError.message,
              errorName: fetchError.name,
              errorStack: fetchError.stack?.split('\n').slice(0, 10),
              errorCode: fetchError.code,
              duration: Date.now() - startTime,
              attempt: attempt,
              willRetry: !isLastAttempt,
            });
            
            if (isLastAttempt) {
              return {
                success: false,
                error: fetchError instanceof Error ? fetchError.message : 'Unknown REST API error',
              };
            }
            
            const delay = Math.min(
              this.BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
              this.MAX_RETRY_DELAY_MS
            );
            console.log(`⏳ Waiting ${delay}ms before retry...`, logContext);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // If we get here and result is not set, all retries failed
        if (!result) {
          return {
            success: false,
            error: lastError?.message || 'Failed to send SMS after all retry attempts',
          };
        }
      }

      // Extract message ID from response (for both SDK and REST API)
      const messageId = result?.data?.id || result?.id || result?.record?.id;
      const recordType = result?.data?.record_type;
      const status = result?.data?.to?.[0]?.status || result?.data?.status;
      
      // Validate we have a message ID
      if (!messageId) {
        const errorMsg = 'No message ID returned from Telnyx API';
        console.error('❌ SMS Send Failed - No Message ID:', {
          ...logContext,
          error: errorMsg,
          method: usedSDK ? 'SDK' : 'REST API',
          resultKeys: Object.keys(result || {}),
          fullResponse: JSON.stringify(result).substring(0, 1000),
          duration: Date.now() - startTime,
        });
        return {
          success: false,
          error: errorMsg,
        };
      }
      
      console.log('✅ REAL SMS SENT via Telnyx:', {
        ...logContext,
        method: usedSDK ? 'SDK' : 'REST API',
        messageId: messageId,
        recordType: recordType,
        status: status,
        duration: Date.now() - startTime,
        responsePreview: JSON.stringify(result).substring(0, 400),
      });

      return {
        success: true,
        messageId: messageId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ SMS Sending Error (Unhandled Exception):', {
        ...logContext,
        error: errorMsg,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorStack: error instanceof Error ? error.stack?.split('\n').slice(0, 15) : undefined,
        duration: Date.now() - startTime,
      });
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Attempt Telnyx MMS (media_urls), then fall back to plain SMS on failure or sandbox.
   */
  static async sendSMSWithMmsFallback(
    to: string,
    body: string,
    mediaUrl: string | null | undefined,
    logExtras?: Record<string, unknown>
  ): Promise<SMSResult> {
    if (mediaUrl && !this.isInSandboxMode()) {
      const mmsResult = await this.sendMmsViaRestApi(to, body, [mediaUrl], {
        ...logExtras,
        to,
      });
      if (mmsResult.success) {
        console.log(
          JSON.stringify({
            event: 'announcement_mms_sent',
            ...logExtras,
            to,
          })
        );
        return mmsResult;
      }
      console.warn(
        JSON.stringify({
          event: 'announcement_mms_fallback_sms',
          ...logExtras,
          to,
          error: mmsResult.error,
        })
      );
    } else if (mediaUrl && this.isInSandboxMode()) {
      console.log(
        JSON.stringify({
          event: 'announcement_mms_skipped_sandbox',
          ...logExtras,
          to,
        })
      );
    }
    return this.sendSMS({ to, body });
  }

  private static async sendMmsViaRestApi(
    to: string,
    text: string,
    mediaUrls: string[],
    logContext: Record<string, unknown>
  ): Promise<SMSResult> {
    const fromNumber = process.env.TELNYX_PHONE_NUMBER;
    const apiKey = process.env.TELNYX_API_KEY;
    if (!fromNumber || !apiKey) {
      return { success: false, error: 'Telnyx not configured for MMS' };
    }

    const telnyxApiUrl = 'https://api.telnyx.com/v2/messages';
    const requestBody = {
      from: fromNumber,
      to,
      text,
      media_urls: mediaUrls,
      encoding: 'auto' as const,
    };

    try {
      console.log('📤 MMS Send Request:', {
        ...logContext,
        mediaCount: mediaUrls.length,
        textLength: text.length,
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);
      const response = await fetch(telnyxApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'Trailblaize-SMS-MMS/1.0',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const responseText = await response.text();
      let parsed: { errors?: Array<{ detail?: string; title?: string }>; data?: { id?: string } };
      try {
        parsed = JSON.parse(responseText) as typeof parsed;
      } catch {
        return {
          success: false,
          error: `MMS response not JSON: ${responseText.slice(0, 200)}`,
        };
      }

      if (!response.ok) {
        return {
          success: false,
          error: `MMS HTTP ${response.status}: ${responseText.slice(0, 400)}`,
        };
      }

      if (parsed.errors && parsed.errors.length > 0) {
        const detail = parsed.errors.map((e) => e.detail || e.title || 'error').join('; ');
        return { success: false, error: `MMS API: ${detail}` };
      }

      const messageId = parsed.data?.id;
      if (!messageId) {
        return { success: false, error: 'MMS: no message id in response' };
      }

      return { success: true, messageId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: `MMS request failed: ${msg}` };
    }
  }

  static async sendBulkSMS(
    recipients: string[],
    message: string,
    options?: {
      mediaUrl?: string | null;
      logContext?: Record<string, unknown>;
    }
  ): Promise<{ success: number; failed: number; results: SMSResult[] }> {
    const startTime = Date.now();
    const logContext = {
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      totalRecipients: recipients.length,
      messageLength: message.length,
      hasMedia: Boolean(options?.mediaUrl),
    };

    console.log('📤 Bulk SMS Send Request:', logContext);

    const results: SMSResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    const batchSize = 10;
    const totalBatches = Math.ceil(recipients.length / batchSize);
    
    console.log('📊 Bulk SMS Batch Configuration:', {
      ...logContext,
      batchSize: batchSize,
      totalBatches: totalBatches,
    });

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      
      console.log(`📦 Processing Batch ${batchNumber}/${totalBatches}:`, {
        ...logContext,
        batchNumber: batchNumber,
        batchSize: batch.length,
        recipients: batch,
      });
      
      const batchPromises = batch.map(async (phoneNumber) => {
        const result = options?.mediaUrl
          ? await this.sendSMSWithMmsFallback(
              phoneNumber,
              message,
              options.mediaUrl,
              options.logContext
            )
          : await this.sendSMS({
              to: phoneNumber,
              body: message,
            });
        
        if (result.success) {
          successCount++;
        } else {
          failedCount++;
          console.warn(`⚠️ Failed to send SMS to ${phoneNumber}:`, {
            ...logContext,
            phoneNumber: phoneNumber,
            error: result.error,
          });
        }
        
        return result;
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      console.log(`✅ Batch ${batchNumber}/${totalBatches} completed:`, {
        ...logContext,
        batchNumber: batchNumber,
        batchSuccess: batchResults.filter(r => r.success).length,
        batchFailed: batchResults.filter(r => !r.success).length,
        cumulativeSuccess: successCount,
        cumulativeFailed: failedCount,
      });

      if (i + batchSize < recipients.length) {
        console.log(`⏳ Waiting 1 second before next batch...`, logContext);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const duration = Date.now() - startTime;
    console.log('✅ Bulk SMS Send Completed:', {
      ...logContext,
      totalSuccess: successCount,
      totalFailed: failedCount,
      successRate: recipients.length > 0 ? ((successCount / recipients.length) * 100).toFixed(2) + '%' : '0%',
      duration: duration,
      averageTimePerSMS: recipients.length > 0 ? (duration / recipients.length).toFixed(0) + 'ms' : 'N/A',
    });

    return {
      success: successCount,
      failed: failedCount,
      results,
    };
  }

  static formatPhoneNumber(phoneNumber: string): string {
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
    
    if (phoneNumber.startsWith('+')) {
      return phoneNumber;
    }
    
    return `+1${cleaned}`;
  }

  static isValidPhoneNumber(phoneNumber: string): boolean {
    const cleaned = phoneNumber.replace(/\D/g, '');
    return cleaned.length === 10 || cleaned.length === 11;
  }

  static isInSandboxMode(): boolean {
    // Only sandbox if explicitly set to 'true'
    // Default to production mode if not set
    return process.env.TELNYX_SANDBOX_MODE === 'true';
  }
}