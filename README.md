# ❄️ Snowgun Forecast

A web-based dashboard designed to help snowmakers optimize production by visualizing **Wet-bulb temperature** forecasts. The app combines precise weather data with snowmaking theory to identify optimal start windows.

![App Screenshot](screenshot.png) ## 🚀 Features

* **Wet-bulb Calculation:** Automatically calculates wet-bulb temperature based on ambient temperature and relative humidity using the Stull formula.
* **Interactive Charts:** Zoomable and pannable charts powered by **Chart.js**.
    * Visualizes wet-bulb, dry-bulb, and wind speed.
    * **Custom Wind Arrows:** Visualizes wind direction directly on the timeline.
    * **Smart Time Axis:** Switches between date and time display based on zoom level.
* **Location Management:**
    * Interactive map selection using **Leaflet**.
    * Search for locations via Nominatim (OpenStreetMap).
    * Save locations as **Favorites** (stored locally in browser).
* **Mobile First:** Responsive design optimized for use in the field on mobile devices.

## 🌡️ The Science: Wet-bulb Temperature

Snow production depends on heat exchange, not just ambient temperature. The critical metric is **Wet-bulb Temperature ($T_w$)**, which accounts for the cooling effect of evaporation.

* **Dry Air (Low Humidity):** Allows water droplets to evaporate, cooling them internally. Snow can be made even at ambient temperatures slightly above 0°C.
* **Humid Air (High Humidity):** Less evaporation occurs. You need colder ambient temperatures to freeze water.

**Thresholds used in this app:**
* **< -2.5°C $T_w$:** Start threshold. Snow is wet/heavy (High density).
* **< -5.0°C $T_w$:** Efficient production. Drier snow, higher water flow allowed.

## 🛠️ Technical Stack

This project is built as a lightweight, single-file application (SPA) requiring no backend server.

* **Core:** HTML5, CSS3, Vanilla JavaScript (ES6+).
* **Visualization:** [Chart.js](https://www.chartjs.org/) with `chartjs-plugin-zoom` and `chartjs-plugin-annotation`.
* **Mapping:** [Leaflet.js](https://leafletjs.com/) with OpenStreetMap tiles.
* **Data Handling:** `date-fns` for robust time manipulation.

### Key Functions

* `calculateWetBulb(T, Rh)`: Implements the **Stull (2011)** formula to derive wet-bulb temperature using `Math.atan` and `Math.pow` calculations for high precision at low temperatures.
* `fetchData()`: Asynchronous function that fetches data in parallel (Promise.all) for:
    * **Hourly data (10 days):** General forecast.
    * **15-min data (2 days):** High-resolution forecast for immediate planning.
* `drawChart()`: Configures the canvas. Includes a **custom Chart.js plugin** (`windArrowPlugin`) that draws rotated wind direction arrows along the top of the chart area, optimizing rendering to avoid clutter during zoom.

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
