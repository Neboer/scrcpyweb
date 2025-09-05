import { RequestHandler } from 'express';
import { spawn } from 'child_process';
// import WebSocket from 'ws'; // Removed unused import
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const exists = (path: string) => fs.promises.access(path).then(() => true).catch(() => false);

interface ConnectRequest {
    name: string;
    host: string;
    port: number;
}

interface ConnectResponse {
    success: boolean;
    deviceId?: string;
    error?: string;
}

interface SavedDevice {
    id: string;
    name: string;
    host: string;
    port: number;
    lastConnected?: string;
}

export class QuickConnectHandler {
    private static activeConnections: Map<string, any> = new Map();
    private static DEVICES_FILE = path.join(process.cwd(), 'devices.json');

    /**
     * Save device info to devices.json
     */
    private static async saveDeviceToFile(name: string, host: string, port: number): Promise<void> {
        try {
            let devices: SavedDevice[] = [];
            
            // Read existing devices
            if (await exists(QuickConnectHandler.DEVICES_FILE)) {
                const data = await readFile(QuickConnectHandler.DEVICES_FILE, 'utf-8');
                try {
                    devices = JSON.parse(data);
                } catch (e) {
                    devices = [];
                }
            }
            
            // Check if device already exists
            const existingIndex = devices.findIndex(d => d.host === host && d.port === port);
            
            if (existingIndex >= 0) {
                // Update existing device
                devices[existingIndex].lastConnected = new Date().toISOString();
                devices[existingIndex].name = name; // Update name if changed
            } else {
                // Add new device
                const newDevice: SavedDevice = {
                    id: `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name,
                    host,
                    port,
                    lastConnected: new Date().toISOString()
                };
                devices.push(newDevice);
            }
            
            // Write back to file
            await writeFile(QuickConnectHandler.DEVICES_FILE, JSON.stringify(devices, null, 2));
            console.log(`Saved device ${name} (${host}:${port}) to devices.json`);
        } catch (error) {
            console.error('Failed to save device to file:', error);
        }
    }

    /**
     * Connect to a device using ADB
     */
    public static connectDevice: RequestHandler = async (req, res) => {
        const { name, host, port }: ConnectRequest = req.body;

        if (!name || !host || typeof port !== 'number') {
            return res.status(400).json({
                success: false,
                error: 'Invalid request: name, host, and port are required'
            } as ConnectResponse);
        }

        const deviceId = uuidv4();
        const adbAddress = `${host}:${port}`;

        try {
            // First, try to connect using adb connect
            await QuickConnectHandler.executeAdbCommand(['connect', adbAddress]);
            
            // Get device info
            const devices = await QuickConnectHandler.getConnectedDevices();
            const device = devices.find(d => d.address === adbAddress);
            
            if (!device) {
                throw new Error('Device connection failed');
            }

            // Store the connection info
            QuickConnectHandler.activeConnections.set(deviceId, {
                name,
                host,
                port,
                adbAddress,
                serialNumber: device.serialNumber,
                connectedAt: new Date()
            });

            // Save device info to devices.json - DISABLED
            // await QuickConnectHandler.saveDeviceToFile(name, host, port);

            return res.json({
                success: true,
                deviceId,
            } as ConnectResponse);
        } catch (error) {
            console.error('Failed to connect device:', error);
            return res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Connection failed'
            } as ConnectResponse);
        }
    };

    /**
     * Disconnect a device
     */
    public static disconnectDevice: RequestHandler = async (req, res) => {
        const { deviceId } = req.params;
        const connection = QuickConnectHandler.activeConnections.get(deviceId);

        if (!connection) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }

        try {
            await QuickConnectHandler.executeAdbCommand(['disconnect', connection.adbAddress]);
            QuickConnectHandler.activeConnections.delete(deviceId);
            
            return res.json({ success: true });
        } catch (error) {
            console.error('Failed to disconnect device:', error);
            return res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Disconnection failed'
            });
        }
    };

    /**
     * Delete a device from memory and disconnect from ADB
     */
    public static removeDevice: RequestHandler = async (req, res) => {
        const { id } = req.params;
        
        try {
            // Check if device exists in memory
            const connection = QuickConnectHandler.activeConnections.get(id);
            if (!connection) {
                return res.status(404).json({
                    success: false,
                    error: 'Device not found'
                });
            }
            
            // First disconnect from ADB
            try {
                await QuickConnectHandler.executeAdbCommand(['disconnect', connection.adbAddress]);
                console.log(`ADB disconnected from device ${connection.adbAddress}`);
            } catch (disconnectError) {
                console.warn(`Failed to disconnect from ADB: ${disconnectError}`);
                // Continue with removal even if disconnect fails
            }
            
            // Remove from memory
            QuickConnectHandler.activeConnections.delete(id);
            console.log(`Removed device ${id} from memory`);
            
            return res.json({ success: true });
        } catch (error) {
            console.error('Failed to delete device:', error);
            return res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Delete failed'
            });
        }
    };

    /**
     * Get list of saved devices from memory (no file reading)
     */
    public static getDevices: RequestHandler = async (_req, res) => {
        try {
            // Return active connections from memory instead of reading file
            const devices = Array.from(QuickConnectHandler.activeConnections.entries()).map(([id, info]) => ({
                id,
                name: info.name,
                host: info.host,
                port: info.port,
                lastConnected: info.connectedAt
            }));
            
            return res.json(devices);
        } catch (error) {
            console.error('Failed to get devices:', error);
            return res.status(500).json([]);
        }
    };

    /**
     * Update devices in memory (no file operations)
     */
    public static updateDevices: RequestHandler = async (req, res) => {
        try {
            const devices = req.body;
            
            if (!Array.isArray(devices)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid devices data'
                });
            }
            
            // Since we're not using file storage, this method doesn't do much
            // It's kept for API compatibility
            console.log('Update devices request received (no-op in memory mode)');
            
            return res.json({ success: true });
        } catch (error) {
            console.error('Failed to update devices:', error);
            return res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Update failed'
            });
        }
    };

    /**
     * Get list of active connections
     */
    public static getActiveConnections: RequestHandler = (_req, res) => {
        const connections = Array.from(QuickConnectHandler.activeConnections.entries()).map(([id, info]) => ({
            id,
            ...info
        }));
        
        return res.json(connections);
    };

    /**
     * Execute an ADB command
     */
    private static executeAdbCommand(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const adb = spawn('adb', args);
            let stdout = '';
            let stderr = '';

            adb.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            adb.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            adb.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(stderr || `ADB command failed with code ${code}`));
                } else {
                    resolve(stdout);
                }
            });

            adb.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Get list of connected devices
     */
    private static async getConnectedDevices(): Promise<Array<{ serialNumber: string; address: string; state: string }>> {
        const output = await QuickConnectHandler.executeAdbCommand(['devices', '-l']);
        const lines = output.split('\n').filter(line => line.trim());
        const devices: Array<{ serialNumber: string; address: string; state: string }> = [];

        // Skip the first line (List of devices attached)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const [serialNumber, state] = line.split(/\s+/);
                devices.push({
                    serialNumber,
                    address: serialNumber.includes(':') ? serialNumber : 'usb',
                    state
                });
            }
        }

        return devices;
    }

    /**
     * Initialize auto-connect for saved devices on startup
     */
    public static async autoConnectSavedDevices(): Promise<void> {
        try {
            // Read from devices.json in working directory
            if (!await exists(QuickConnectHandler.DEVICES_FILE)) {
                console.log('No devices.json found, skipping auto-connect');
                return;
            }
            
            const data = await readFile(QuickConnectHandler.DEVICES_FILE, 'utf-8');
            const savedDevices: SavedDevice[] = JSON.parse(data);
            
            console.log('Auto-connecting saved devices...');
            
            for (const device of savedDevices) {
                try {
                    const adbAddress = `${device.host}:${device.port}`;
                    await QuickConnectHandler.executeAdbCommand(['connect', adbAddress]);
                    console.log(`Connected to ${device.name} (${adbAddress})`);
                    
                    // Update last connected time
                    await QuickConnectHandler.saveDeviceToFile(device.name, device.host, device.port);
                } catch (error) {
                    console.error(`Failed to connect to ${device.name}:`, error);
                }
            }
        } catch (error) {
            console.error('Failed to auto-connect saved devices:', error);
        }
    }

}