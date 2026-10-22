require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE CONFIGURATION
// ==========================================
app.use(cors());
app.use(express.json());

// Serve static frontend files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));


// ==========================================
// SERVICE 1: Threat Telemetry Ingestion API
// ==========================================
app.get('/api/v1/telemetry', async (req, res) => {
    const { city } = req.query;
    if (!city) {
        return res.status(400).json({ error: "400 Bad Request: 'city' query parameter is required." });
    }

    try {
        // Step 1: Fetch Latitude & Longitude from Open-Meteo Geocoding API
        const geoResponse = await axios.get(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
            {
                timeout: 5000,
                headers: { 'User-Agent': 'APIcalypse-App/1.0' }
            }
        );

        if (!geoResponse.data.results || geoResponse.data.results.length === 0) {
            return res.status(404).json({ error: `404 Not Found: Sector '${city}' could not be located.` });
        }

        const { latitude, longitude, name, country } = geoResponse.data.results[0];

        // Step 2: Fetch Live Atmospheric Hazards from Open-Meteo Forecast API
        const weatherResponse = await axios.get(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
            {
                timeout: 5000,
                headers: { 'User-Agent': 'APIcalypse-App/1.0' }
            }
        );

        const { temperature, windspeed } = weatherResponse.data.current_weather;

        return res.status(200).json({
            sector: name,
            country: country || "Unknown",
            coordinates: { latitude, longitude },
            hazard_level_temp: temperature,
            wind_velocity: windspeed,
            telemetry_status: "ONLINE"
        });

    } catch (err) {
        console.warn(`⚠️ Telemetry external fetch failed (${err.code || err.message}). Switching to Backup Bunker Grid.`);

        // Workshop Resilience Fallback: Guarantees the pipeline succeeds even on restricted networks
        return res.status(200).json({
            sector: city.toUpperCase() + " (BACKUP SECTOR)",
            country: "Local Sector",
            coordinates: { latitude: 19.0760, longitude: 72.8777 },
            hazard_level_temp: 31.5,
            wind_velocity: 8.4,
            telemetry_status: "BACKUP_GRID_ONLINE"
        });
    }
});


// ==========================================
// CUSTOM AUTHENTICATION MIDDLEWARE
// ==========================================
const verifyBunkerKey = (req, res, next) => {
    const bunkerKey = req.headers['x-bunker-key'];

    if (!bunkerKey) {
        return res.status(401).json({ error: "401 Unauthorized: Missing 'x-bunker-key' authorization header." });
    }

    if (bunkerKey !== process.env.WORKSHOP_AUTH_KEY) {
        return res.status(403).json({ error: "403 Forbidden: Invalid Bunker Authorization Key." });
    }

    next(); // Key is valid; pass execution to the next handler
};


// ==========================================
// SERVICE 2: Protected AI Defense Engine API
// ==========================================
app.post('/api/v1/defense/directive', verifyBunkerKey, async (req, res) => {
    const { sector, hazard_temp, wind_speed } = req.body;

    if (!sector || hazard_temp === undefined || wind_speed === undefined) {
        return res.status(400).json({ error: "400 Bad Request: Missing telemetry metrics in request body." });
    }

    try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

        const payload = {
            contents: [{
                parts: [{
                    text: `EMERGENCY COMMAND: Sector ${sector} records a surface temperature of ${hazard_temp}°C and fallout wind velocity of ${wind_speed} km/h. As AI Defense Command, issue a strict, 2-sentence tactical emergency protocol for bunker operators.`
                }]
            }]
        };

        const geminiResponse = await axios.post(geminiUrl, payload, {
            timeout: 15000, // 15-second timeout to handle network latency
            headers: { 'Content-Type': 'application/json' }
        });

        const aiDirective = geminiResponse.data.candidates[0].content.parts[0].text;

        return res.status(200).json({
            sector: sector,
            ai_directive: aiDirective,
            command_timestamp: new Date().toISOString(),
            security_clearance: "VERIFIED"
        });

    } catch (error) {
        console.warn("AI Defense Grid timed out or failed. Deploying backup command directive:", error.response?.data || error.message);

        // Workshop Resilience Fallback: Guarantees the frontend always receives a valid AI response
        return res.status(200).json({
            sector: sector,
            ai_directive: `[OFFLINE BACKUP DIRECTIVE]: Sector ${sector} is currently operating on isolated mesh telemetry (${hazard_temp}°C). Seal all reinforced blast doors, switch grid power to auxiliary batteries, and maintain radio silence until central command re-establishes connection.`,
            command_timestamp: new Date().toISOString(),
            security_clearance: "VERIFIED_OFFLINE"
        });
    }
});

// ==========================================
// SERVICE 3: Bunker Resource Ledger (CRUD)
// ==========================================
let bunkerInventory = {
    sector: "Default Shelter",
    water_rations_liters: 1200,
    oxygen_tanks: 45,
    power_cells_pct: 88,
    last_updated: new Date().toISOString()
};

// GET: View current bunker supplies
app.get('/api/v1/inventory', (req, res) => {
    return res.status(200).json({
        status: "LEDGER_SYNCED",
        inventory: bunkerInventory
    });
});

// PUT: Update bunker supplies during a crisis dispatch
app.put('/api/v1/inventory', verifyBunkerKey, (req, res) => {
    const { water_delta, oxygen_delta, power_delta } = req.body;

    if (water_delta !== undefined) bunkerInventory.water_rations_liters += water_delta;
    if (oxygen_delta !== undefined) bunkerInventory.oxygen_tanks += oxygen_delta;
    if (power_delta !== undefined) bunkerInventory.power_cells_pct = power_delta;
    bunkerInventory.last_updated = new Date().toISOString();

    return res.status(200).json({
        message: "Bunker ledger updated successfully.",
        inventory: bunkerInventory
    });
});


// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`APIcalypse Defense Mesh active on http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});