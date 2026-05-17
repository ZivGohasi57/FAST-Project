import { API_BASE } from '../config.js';
const BASE_URL = `${API_BASE}/api/route`;

export const getRoute = async (start, end, isEmergency) => {
    try {
        const response = await fetch(
            `${BASE_URL}?startLat=${start.lat}&startLon=${start.lng}&endLat=${end.lat}&endLon=${end.lng}&isEmergency=${isEmergency}`
        );
        return await response.json();
    } catch (error) {
        console.error("Failed to fetch route:", error);
        return null;
    }
};