# ❄️ Snowgun Forecast

A web-based dashboard designed to help snowmakers optimize production by visualizing **Wet-bulb temperature** forecasts. The app combines precise weather data with snowmaking theory to identify optimal start windows for both fan guns and lances.

### 🔗 [Click here to open the Live App](https://gkrallo.github.io/snowgun-forecast/)

## 🚀 Features

### 🌤️ Forecast & Visualization
* **Wet-bulb Calculation:** Automatically calculates wet-bulb temperature using the Stull formula (high precision for low temps).
* **Interactive Charts:** Zoomable and pannable charts powered by **Chart.js**.
    * **Smart Hover:** Shows precise data for any time point with a vertical crosshair guide.
    * **Custom Wind Arrows:** Visualizes wind direction directly on the timeline.
    * **Visual Thresholds:** Clear visual indicators for the -2.5°C wet-bulb threshold (Start zone).
* **Smart Time Axis:** Seamlessly switches between hourly view and date view based on zoom level.

### 🧮 Production Calculator (New!)
A dedicated tool for simulation and decision support:
* **Machine Logic:** Differentiates between **Fan Guns** (resilient, early start) and **Lances** (efficient, requires colder temps).
* **Custom Parameters:** Input your actual **Water Temperature** and desired **Snow Quality** (1-10 slider).
* **Forecasting:** Projects your specific settings onto the weather forecast to predict:
    * Exact start times for both machine types.
    * Production capacity (%) trend for the next 48 hours.

### 📍 Location Management
* **Interactive Map:** Select any location worldwide using **Leaflet**.
* **Smart Favorites:** Save locations locally. The app automatically detects if your current view matches a favorite.
* **Search:** Integrated search via Nominatim (OpenStreetMap).

## 🌡️ The Science: Snowmaking Physics

Snow production depends on heat exchange. The critical metric is **Wet-bulb Temperature ($T_w$)**, which accounts for the cooling effect of evaporation.

### Key Factors modeled in the Calculator:
1.  **Water Temperature:** Warmer water acts as a "penalty" on the wet-bulb temperature. Every degree of heat must be removed before freezing can occur.
2.  **Snow Quality:**
    * **Dry Snow (Quality 1):** Requires significantly colder temperatures to freeze small droplets completely before landing.
    * **Wet/Base Snow (Quality 10):** Can be produced at warmer (marginal) temperatures.

**Base Thresholds (adjustable via calculator):**
* **Fan Guns:** Generally start around **-2.0°C $T_w$**.
* **Lances:** Generally start around **-4.0°C to -5.0°C $T_w$**.

## 🛠️ Technical Stack

This project is built as a lightweight, single-file application (SPA) hosted on GitHub Pages.

* **Core:** HTML5, CSS3, Vanilla JavaScript (ES6+).
* **Visualization:** [Chart.js](https://www.chartjs.org/) with `chartjs-plugin-zoom` and `chartjs-plugin-annotation`.
* **Mapping:** [Leaflet.js](https://leafletjs.com/) with OpenStreetMap tiles.
* **Data Handling:** `date-fns` for robust time manipulation.

### Key Algorithms

* `calculateWetBulb(T, Rh)`: Implements the **Stull (2011)** formula.
* `updateCalc()`: The core of the new calculator. It filters future forecast data (next 48h), applies penalties based on water temp and quality sliders, and calculates a dynamic capacity percentage (0-100%) for both fan and lance curves.

## ☁️ Weather Data API

Weather data is sourced from [Open-Meteo](https://open-meteo.com/), utilizing their free non-commercial API.

**Models used:**
1.  **Short term (0-48h):** `MET Nordic` (High resolution model for Scandinavia).
2.  **Long term (3-10 days):** `ECMWF` (European Centre for Medium-Range Weather Forecasts).

**Parameters fetched:**
* `temperature_2m`
* `relative_humidity_2m`
* `wind_speed_10m` (Unit forced to **m/s**)
* `wind_direction_10m`

## 📦 How to Run

1.  Clone the repository.
2.  Open `index.html` in any modern web browser.
3.  No build step or server required (works directly from file system or GitHub Pages).

## 📄 License

This project is open source. Feel free to use it for your local ski resort or backyard snowmaking setup.