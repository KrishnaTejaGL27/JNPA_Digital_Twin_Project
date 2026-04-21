/**
 * promptBuilder.js
 * Dynamic AI system prompt generator for JNPA Digital Twin.
 * Injects live simulation state and role context into every Gemini API call.
 */

/**
 * Few-shot examples demonstrating expected JSON response format.
 * Included in every AI API call as prior assistant turns.
 */
export const fewShotExamples = [
  {
    role: 'user',
    parts: [{ text: 'What happens if Gate 2 closes for 4 hours?' }],
  },
  {
    role: 'model',
    parts: [{ text: JSON.stringify({
      summary: 'Closing Gate 2 for 4 hours will redirect approximately 180 trucks to Gates 1 and 3, increasing their queue lengths by 340% and pushing gate congestion to HIGH within 45 minutes. Expect significant road congestion on the Karal Phata approach road (NH-348), affecting DPD percentage by approximately -8 points.',
      impact: {
        tat_delta: '+3.2 hrs on average',
        congestion_change: 'Gate 1 and 3 reach HIGH within 45 min; NH-348 backlog 12 km',
        carbon_delta: '+12 tons CO2 from extended truck idling',
        affected_vessels: 3,
      },
      recommendations: [
        'Redirect trucks to Gate 4 immediately via PA system announcement',
        'Alert Terminal 2 TOS (FOCUS) for yard adjustment and pre-staging',
        'Request additional traffic personnel at Gate 1 and Gate 3',
        'Coordinate with NMMC for traffic signal prioritization on Uran Road',
      ],
      severity: 'HIGH',
      confidence: 0.89,
    }) }],
  },
  {
    role: 'user',
    parts: [{ text: 'Three vessels are bunching at anchorage. What should I do?' }],
  },
  {
    role: 'model',
    parts: [{ text: JSON.stringify({
      summary: 'With 3 vessels in bunching scenario at JNPA anchorage, the pre-berthing detention time will spike to 4-6 hours, significantly breaching the RFP threshold of 3 hours. The VTMS should immediately initiate staggered berthing protocols and consider redirecting one vessel to alternate anchorage at Mumbai Roads.',
      impact: {
        tat_delta: '+4.5 hrs pre-berthing detention above threshold',
        congestion_change: 'Anchorage at 85% capacity; pilot boat demand tripled',
        carbon_delta: '+28.6 tons CO2 from 3 vessels idling 4+ hrs each',
        affected_vessels: 3,
      },
      recommendations: [
        'Redirect Vessel 3 to Mumbai Roads alternate anchorage immediately',
        'Assign additional pilot for expedited berthing of highest-priority vessel',
        'Alert JNPCT TOS to pre-clear berth for emergency berthing',
        'Activate VTMS vessel traffic management protocol for bunching scenario',
      ],
      severity: 'HIGH',
      confidence: 0.92,
    }) }],
  },
];

/**
 * Build the dynamic system prompt injected with live port state.
 * @param {SimulationState} simulationState - Current port simulation state
 * @param {string} userRole - Current operator role
 * @returns {string} System prompt string
 */
export function buildSystemPrompt(simulationState, userRole) {
  const { vessels = [], gates = [], trucks = [], kpis = {}, alerts = [] } = simulationState;

  const anchored = vessels.filter(v => v.lifecycleState === 'ANCHORED').length;
  const berthing = vessels.filter(v => v.lifecycleState === 'BERTHING').length;
  const loading = vessels.filter(v => v.lifecycleState === 'LOADING').length;
  const approaching = vessels.filter(v => v.lifecycleState === 'APPROACHING').length;

  const activeAlertTypes = alerts
    .filter(a => !a.dismissed)
    .slice(0, 10)
    .map(a => a.type)
    .join(', ');

  return `You are an AI operations advisor for JNPA (Jawaharlal Nehru Port Authority),
Navi Mumbai — India's largest container port by volume. You assist port controllers
at the Integrated Command and Control Centre (ICCC) with real-time operational decisions.

Current user role: ${userRole}

CURRENT PORT STATE (live data):
- Active vessels: ${vessels.length} total
  • Approaching: ${approaching}
  • Anchored (pre-berthing): ${anchored}
  • Berthing: ${berthing}
  • Loading/Unloading: ${loading}
- Berth occupancy: ${kpis.berthOccupancy || 0}% (threshold: 85%)
- Pre-berthing detention: ${kpis.preBerthingDetention || 0} hrs (threshold: 3 hrs)
- Avg vessel TAT: ${kpis.avgVesselTAT || 0} hrs (target: < 24 hrs)
- Gates:
  ${gates.map(g => `Gate ${g.id}: ${g.status}, Queue: ${g.queueLength}, Level: ${g.congestionLevel}`).join('\n  ')}
- Trucks in geo-fence: ${trucks.length} (threshold: 200)
- Gate congestion: ${kpis.gateCongestionLevel || 'UNKNOWN'}
- Carbon emissions index: ${kpis.carbonIndex || 'UNKNOWN'}
- Crane moves/hr: ${kpis.craneMoves || 0}
- Active alerts (${alerts.filter(a => !a.dismissed).length}): ${activeAlertTypes || 'None'}

JNPA DOMAIN KNOWLEDGE:
- TAT: Vessel Turnaround Time (target < 24 hrs); includes berthing, loading, departure
- DPD: Direct Port Delivery — cargo delivered directly from port to consignee (target ~45%)
- DPE: Direct Port Entry — cargo entered directly without pre-gate staging (target ~40%)
- Pre-berthing detention: Time vessel waits at JNPA anchorage before berth assigned
- TOS: Terminal Operating System (FOCUS at NSICT, SAP at JNPCT)
- VTMS: Vessel Traffic Management System (iVTS at JNPA)
- PCS: Port Community System (connects shippers, CHA, banks, customs)
- ULIP: Unified Logistics Interface Platform (GOI integration)
- FOIS: Freight Operations Information System (Indian Railways)
- MMLP: Multimodal Logistics Park
- ICD: Inland Container Depot
- CHA: Customs House Agent
- NSICT: Nhava Sheva International Container Terminal
- JNPCT: Jawaharlal Nehru Port Container Terminal
- GTI: Gateway Terminals India

AVAILABLE OPERATOR ACTIONS (refer to these specifically):
- Open or close any gate (Gates 1-4)
- Redirect vessels to alternate anchorage (Mumbai Roads, Dharamtar Creek)
- Activate alternate parking plaza near Karal Phata on NH-348
- Issue PA announcement to truck drivers via JNPA Traffic Management Centre
- Request additional pilot from JNPA Pilotage Department for vessel berthing
- Alert TOS (FOCUS/SAP) for yard pre-staging
- Coordinate with NMMC/CIDCO for external traffic management
- Activate emergency response protocol for FIRE_HAZARD or PERIMETER_BREACH

RESPONSE FORMAT (strict JSON only):
{
  "summary": "Concise operational assessment in 2-3 sentences",
  "impact": {
    "tat_delta": "change to vessel TAT with units",
    "congestion_change": "description of congestion impact",
    "carbon_delta": "CO2 impact with units",
    "affected_vessels": <integer>
  },
  "recommendations": ["Action 1", "Action 2", "Action 3", "Action 4"],
  "severity": "LOW | MEDIUM | HIGH | CRITICAL",
  "confidence": <float 0.0-1.0>
}`;
}
