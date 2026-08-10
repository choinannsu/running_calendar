import os
import json
import datetime
from garminconnect import Garmin

def format_pace(duration_seconds, distance_meters):
    if not distance_meters or distance_meters <= 0:
        return "0:00"
    distance_km = distance_meters / 1000.0
    pace_seconds_per_km = duration_seconds / distance_km
    minutes = int(pace_seconds_per_km // 60)
    seconds = int(pace_seconds_per_km % 60)
    return f"{minutes}:{seconds:02d}"

def map_run_type(activity_name, type_key):
    name_lower = (activity_name or "").lower()
    if "lsd" in name_lower or "long" in name_lower or "장거리" in name_lower:
        return "lsd"
    elif "interval" in name_lower or "인터벌" in name_lower or "track" in name_lower:
        return "interval"
    elif "tempo" in name_lower or "템포" in name_lower or "threshold" in name_lower:
        return "tempo"
    elif "race" in name_lower or "대회" in name_lower or "marathon" in name_lower:
        return "race"
    return "easy"

def main():
    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")

    if not email or not password:
        print("⚠️ Warning: GARMIN_EMAIL or GARMIN_PASSWORD environment variables not set.")
        print("Generating empty garmin_data.json placeholder.")
        with open("garmin_data.json", "w", encoding="utf-8") as f:
            json.dump({"updatedAt": datetime.datetime.now().isoformat(), "runs": {}}, f, ensure_ascii=False, indent=2)
        return

    print("🔑 Authenticating with Garmin Connect...")
    try:
        api = Garmin(email, password)
        api.login()
        print("✅ Successfully logged into Garmin Connect!")
    except Exception as e:
        print(f"❌ Failed to log into Garmin Connect: {e}")
        return

    # Fetch last 60 days of activities
    today = datetime.date.today()
    start_date = today - datetime.timedelta(days=60)
    
    print(f"📥 Fetching activities from {start_date} to {today}...")
    try:
        activities = api.get_activities_by_date(start_date.isoformat(), today.isoformat())
    except Exception as e:
        print(f"❌ Error fetching activities: {e}")
        activities = []

    garmin_runs = {}

    for act in activities:
        act_type = (act.get("activityType") or {}).get("typeKey", "")
        # Filter for running activities
        if "running" in act_type.lower() or "run" in act_type.lower():
            start_time_local = act.get("startTimeLocal", "")
            if not start_time_local:
                continue
            
            date_str = start_time_local.split(" ")[0] # "YYYY-MM-DD"
            distance_meters = act.get("distance", 0)
            duration_secs = act.get("duration", 0)
            distance_km = round(distance_meters / 1000.0, 1)

            if distance_km <= 0:
                continue

            pace_str = format_pace(duration_secs, distance_meters)
            act_name = act.get("activityName") or "Garmin Running"
            run_type = map_run_type(act_name, act_type)

            # Keep highest distance if multiple runs on same date or combine note
            existing = garmin_runs.get(date_str)
            if existing:
                distance_km = round(existing["distance"] + distance_km, 1)
                act_name = f"{existing['note']} / {act_name}"

            garmin_runs[date_str] = {
                "distance": distance_km,
                "type": run_type,
                "note": f"⌚ Garmin: {act_name} (페이스 {pace_str}/km)",
                "isGarmin": True,
                "pace": pace_str
            }

    print(f"🏃 Found {len(garmin_runs)} running activities from Garmin!")

    output_data = {
        "updatedAt": datetime.datetime.now().isoformat(),
        "runs": garmin_runs
    }

    with open("garmin_data.json", "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print("💾 garmin_data.json saved successfully!")

if __name__ == "__main__":
    main()
