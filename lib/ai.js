/**
 * ai.js
 * Google Gemini 2.5 Pro client for JNPA Digital Twin AI Assistant.
 * Uses Google Cloud service account credentials for authentication.
 * Falls back to mock responses if credentials are not configured.
 */

import { buildSystemPrompt, fewShotExamples } from './promptBuilder.js';

/**
 * Get an authenticated access token using Google Cloud service account credentials.
 * @returns {Promise<string|null>} Bearer token or null if not configured
 */
async function getAccessToken() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) return null;

  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    return tokenResponse?.token || null;
  } catch {
    return null;
  }
}

/**
 * Extract project ID from Google Cloud credentials file.
 * @returns {Promise<string|null>}
 */
async function getProjectId() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) return null;
  try {
    const fs = await import('fs');
    const raw = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
    const creds = JSON.parse(raw);
    return creds.project_id || null;
  } catch {
    return null;
  }
}

/**
 * Parse AI response text, extracting JSON or returning a fallback structure.
 * @param {string} text
 * @returns {AIResponse}
 */
function parseAIResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No JSON found');
  } catch {
    return {
      summary: text || 'AI response received but could not be parsed.',
      impact: {
        tat_delta: 'Analysis pending',
        congestion_change: 'Analysis pending',
        carbon_delta: 'Analysis pending',
        affected_vessels: 0,
      },
      recommendations: [
        'Review current vessel positions via VTMS',
        'Monitor gate queue levels',
        'Alert terminal operations if thresholds are breached',
      ],
      severity: 'LOW',
      confidence: 0.5,
    };
  }
}

/**
 * Mock AI response for when Google Cloud credentials are not configured.
 * @param {string} userMessage
 * @param {SimulationState} state
 * @returns {AIResponse}
 */
function getMockAIResponse(userMessage, state) {
  const { vessels = [], kpis = {}, gates = [] } = state;
  const anchored = vessels.filter(v => v.lifecycleState === 'ANCHORED').length;

  const responses = [
    {
      summary: `Based on current JNPA port state, with ${vessels.length} active vessels and berth occupancy at ${kpis.berthOccupancy || 0}%, operational conditions are within acceptable parameters. Pre-berthing detention of ${kpis.preBerthingDetention || 0} hrs is ${(kpis.preBerthingDetention || 0) > 3 ? 'EXCEEDING' : 'within'} the RFP threshold of 3 hours.`,
      impact: {
        tat_delta: kpis.avgVesselTAT > 20 ? `+${(kpis.avgVesselTAT - 18).toFixed(1)} hrs above baseline` : 'Within normal range',
        congestion_change: `Gate congestion: ${kpis.gateCongestionLevel || 'LOW'}`,
        carbon_delta: kpis.carbonIndex === 'HIGH' ? '+18.4 tons CO2 from anchorage idling' : 'Within acceptable limits',
        affected_vessels: anchored,
      },
      recommendations: [
        `${anchored > 3 ? 'PRIORITY: ' : ''}Coordinate with VTMS for staggered berthing of ${anchored} anchored vessels`,
        gates.some(g => g.congestionLevel === 'HIGH') ? 'Activate alternate parking plaza at Karal Phata to reduce gate pressure' : 'Maintain current gate operations — queues within tolerance',
        kpis.berthOccupancy > 75 ? 'Pre-alert TOS (FOCUS) for upcoming berth turnover planning' : 'No immediate berth action required',
        'Review DPD/DPE percentages with terminal operations for next shift handover',
      ],
      severity: kpis.carbonIndex === 'HIGH' || kpis.preBerthingDetention > 3 ? 'MEDIUM' : 'LOW',
      confidence: 0.84,
    },
  ];

  return responses[0];
}

/**
 * Send a message to Google Gemini 2.5 Pro via Vertex AI and return structured response.
 * @param {ChatMessage[]} messages - Conversation history
 * @param {SimulationState} context - Current simulation state
 * @param {string} userRole - Current operator role
 * @returns {Promise<AIResponse>}
 */
export async function sendChatMessage(messages, context, userRole) {
  const systemPrompt = buildSystemPrompt(context, userRole);

  // Try to get credentials
  const [token, projectId] = await Promise.all([getAccessToken(), getProjectId()]);

  // Fall back to mock if no credentials
  if (!token || !projectId) {
    const lastUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    return getMockAIResponse(lastUserMsg, context);
  }

  // Build Vertex AI Gemini request
  const location = process.env.GEMINI_LOCATION || 'us-central1';
  const model = 'gemini-2.5-pro-preview-05-06';
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

  // Convert message history to Gemini format
  const formattedMessages = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  // Insert few-shot examples before actual conversation
  const contents = [...fewShotExamples, ...formattedMessages];

  const requestBody = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
      topP: 0.8,
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      return getMockAIResponse(messages.slice(-1)[0]?.content || '', context);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return parseAIResponse(text);
  } catch (err) {
    console.error('Gemini API call failed:', err);
    return getMockAIResponse(messages.slice(-1)[0]?.content || '', context);
  }
}
