"""Hourly forecast from Open-Meteo (free, no key). Default location: Tel Aviv."""
from __future__ import annotations

import httpx

TEL_AVIV = (32.08, 34.78)


def hourly_forecast(lat: float = TEL_AVIV[0], lon: float = TEL_AVIV[1], days: int = 3) -> list[dict]:
    r = httpx.get("https://api.open-meteo.com/v1/forecast", params={
        "latitude": lat, "longitude": lon, "timezone": "Asia/Jerusalem", "forecast_days": days,
        "hourly": "apparent_temperature,temperature_2m,wind_speed_10m,precipitation_probability,relative_humidity_2m",
    }, timeout=20)
    r.raise_for_status()
    h = r.json()["hourly"]
    return [{"time": t, "feels": h["apparent_temperature"][i], "temp": h["temperature_2m"][i],
             "wind": h["wind_speed_10m"][i], "rain": h["precipitation_probability"][i],
             "humidity": h["relative_humidity_2m"][i]} for i, t in enumerate(h["time"])]
