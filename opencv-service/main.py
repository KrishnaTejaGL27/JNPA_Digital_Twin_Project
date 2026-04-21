"""
opencv-service/main.py
OpenCV + YOLOv8 vehicle and perimeter detection microservice for JNPA ICCC.

Deploy on Render (free tier — 750 hrs/month):
  1. Push opencv-service/ to a GitHub repo
  2. Render → New Web Service → select repo → Runtime: Python 3
  3. Build command: pip install -r requirements.txt
  4. Start command: uvicorn main:app --host 0.0.0.0 --port $PORT

After deploy, set in Netlify .env:
  OPENCV_SERVICE_URL = https://your-service.onrender.com

Required environment variables (Render dashboard):
  CAMERA_FEEDS = gate_1:rtsp://192.168.x.x:554/stream1,perimeter:rtsp://192.168.x.x:554/stream2
  (comma-separated zone:url pairs)
  If CAMERA_FEEDS is not set, service runs in demo mode with simulated detections.

Cost: FREE on Render free tier (spins down after 15 min inactivity — acceptable for demo)
      $7/month on Render Starter for always-on
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import os
import threading
import time
import math
import random

app = FastAPI(title="JNPA OpenCV Analytics Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ─── Shared state ─────────────────────────────────────────────────────────────

latest_analytics: dict = {}
SERVICE_MODE = "DEMO"  # "LIVE" when cameras are connected

# ─── Live camera analysis ─────────────────────────────────────────────────────

def parse_camera_feeds() -> dict[str, str]:
    """Parse CAMERA_FEEDS env var into {zone_name: rtsp_url} dict."""
    raw = os.environ.get("CAMERA_FEEDS", "")
    if not raw:
        return {}
    feeds = {}
    for item in raw.split(","):
        parts = item.strip().split(":", 1)
        if len(parts) == 2:
            feeds[parts[0].strip()] = parts[1].strip()
    return feeds


def analyze_camera_feed(zone_name: str, url: str):
    """
    Continuously analyze a single camera feed using YOLOv8.
    Updates latest_analytics[zone_name] every 2 seconds.
    """
    global SERVICE_MODE
    try:
        import cv2
        from ultralytics import YOLO

        model = YOLO("yolov8n.pt")  # Downloads ~6MB on first run
        SERVICE_MODE = "LIVE"

        cap = cv2.VideoCapture(url)
        print(f"[OpenCV] Started analysis for zone: {zone_name}")

        while True:
            ret, frame = cap.read()
            if not ret:
                print(f"[OpenCV] Lost feed for {zone_name} — retrying in 5s")
                time.sleep(5)
                cap.release()
                cap = cv2.VideoCapture(url)
                continue

            results = model(frame, verbose=False, conf=0.45)
            classes = [int(c) for c in results[0].boxes.cls]

            # YOLO COCO classes: 0=person, 2=car, 7=truck, 5=bus
            truck_count  = classes.count(7) + classes.count(5)
            person_count = classes.count(0)
            vehicle_count = classes.count(2) + truck_count

            latest_analytics[zone_name] = {
                "truck_count":  truck_count,
                "person_count": person_count,
                "vehicle_count": vehicle_count,
                # Intrusion: person detected in perimeter zone
                "intrusion":    person_count > 0 and "perimeter" in zone_name.lower(),
                "fire_hazard":  False,  # extend with fire detection model if needed
                "confidence":   float(results[0].boxes.conf.mean()) if len(results[0].boxes) > 0 else 0.0,
                "timestamp":    datetime.now(timezone.utc).isoformat(),
            }

            time.sleep(2)  # Analyze every 2 seconds

    except ImportError:
        print(f"[OpenCV] ultralytics/cv2 not available — zone {zone_name} in demo mode")
    except Exception as e:
        print(f"[OpenCV] Error in zone {zone_name}: {e}")


# ─── Demo mode (no cameras) ───────────────────────────────────────────────────

def demo_simulation_tick():
    """
    Simulate realistic analytics when no cameras are connected.
    Mimics JNPA truck movement patterns (higher during 06:00–22:00 IST).
    """
    while True:
        hour = datetime.now(timezone.utc).hour + 5  # rough IST offset
        is_peak = 6 <= (hour % 24) <= 22

        for zone in ["gate_1", "perimeter", "nsict_gate"]:
            base_trucks = 12 if is_peak else 4
            latest_analytics[zone] = {
                "truck_count":   base_trucks + random.randint(0, 8),
                "person_count":  random.randint(0, 3),
                "vehicle_count": base_trucks + random.randint(2, 10),
                "intrusion":     False,
                "fire_hazard":   False,
                "confidence":    0.0,
                "timestamp":     datetime.now(timezone.utc).isoformat(),
            }
        time.sleep(30)


# ─── Startup ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    feeds = parse_camera_feeds()

    if feeds:
        print(f"[OpenCV] Starting live analysis for {len(feeds)} camera feeds")
        for zone_name, url in feeds.items():
            t = threading.Thread(
                target=analyze_camera_feed,
                args=(zone_name, url),
                daemon=True
            )
            t.start()
    else:
        print("[OpenCV] No CAMERA_FEEDS configured — running in DEMO mode")
        t = threading.Thread(target=demo_simulation_tick, daemon=True)
        t.start()


# ─── API endpoints ────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "mode":   SERVICE_MODE,
        "zones":  list(latest_analytics.keys()),
        "uptime": time.process_time(),
    }


@app.get("/api/analytics/latest")
def get_latest_analytics():
    if not latest_analytics:
        # Cold start — return safe zeros
        return {
            "truck_count":  0,
            "person_count": 0,
            "intrusion":    False,
            "fire_hazard":  False,
            "zone_summary": {},
            "timestamp":    datetime.now(timezone.utc).isoformat(),
            "mode":         SERVICE_MODE,
        }

    truck_total  = sum(z.get("truck_count",  0) for z in latest_analytics.values())
    person_total = sum(z.get("person_count", 0) for z in latest_analytics.values())
    intrusion    = any(z.get("intrusion",  False) for z in latest_analytics.values())
    fire_hazard  = any(z.get("fire_hazard", False) for z in latest_analytics.values())

    return {
        "truck_count":  truck_total,
        "person_count": person_total,
        "intrusion":    intrusion,
        "fire_hazard":  fire_hazard,
        "zone_summary": latest_analytics,
        "timestamp":    datetime.now(timezone.utc).isoformat(),
        "mode":         SERVICE_MODE,
    }
