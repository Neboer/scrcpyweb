import '../../style/modern-ui.css';
import { html } from './HtmlTag';
import { TypedEmitter } from '../../common/TypedEmitter';

export interface SavedDevice {
    id: string;
    name: string;
    host: string;
    port: number;
    lastConnected?: Date;
}

interface QuickConnectEvents {
    connect: { name: string; host: string; port: number };
    saved: SavedDevice;
    removed: string;
}

export class QuickConnect extends TypedEmitter<QuickConnectEvents> {
    private static instance?: QuickConnect;
    private container: HTMLElement;
    private savedDevices: SavedDevice[] = [];
    private isOpen = false;
    private storageKey = 'ws-scrcpy-saved-devices';
    private configPath = '/ws-scrcpy/devices.json';

    public static getInstance(): QuickConnect {
        if (!this.instance) {
            this.instance = new QuickConnect();
        }
        return this.instance;
    }

    private constructor() {
        super();
        this.container = document.createElement('div');
        this.loadSavedDevices();
        this.render();
    }

    private async loadSavedDevices(): Promise<void> {
        try {
            // First try to load from server storage
            const response = await fetch(this.configPath);
            if (response.ok) {
                this.savedDevices = await response.json();
            }
        } catch (error) {
            // Fallback to localStorage
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                try {
                    this.savedDevices = JSON.parse(saved);
                } catch (e) {
                    console.error('Failed to parse saved devices:', e);
                }
            }
        }
        this.render();
    }

    private async saveSavedDevices(): Promise<void> {
        // Save to localStorage immediately
        localStorage.setItem(this.storageKey, JSON.stringify(this.savedDevices));
        
        // Try to save to server
        try {
            await fetch(this.configPath, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.savedDevices)
            });
        } catch (error) {
            console.error('Failed to save devices to server:', error);
        }
    }

    private generateDeviceId(): string {
        return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private addSavedDevice(device: Omit<SavedDevice, 'id'>): void {
        const newDevice: SavedDevice = {
            ...device,
            id: this.generateDeviceId(),
            lastConnected: new Date()
        };
        this.savedDevices.push(newDevice);
        this.saveSavedDevices();
        this.emit('saved', newDevice);
        this.render();
    }

    private removeSavedDevice(id: string): void {
        this.savedDevices = this.savedDevices.filter(d => d.id !== id);
        this.saveSavedDevices();
        this.emit('removed', id);
        this.render();
    }

    private async connectToDevice(device: { name: string; host: string; port: number }): Promise<void> {
        try {
            // Call the API to connect the device
            const response = await fetch('/api/quick-connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(device)
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Update last connected time if it's a saved device
                const savedDevice = this.savedDevices.find(d => 
                    d.host === device.host && d.port === device.port
                );
                if (savedDevice) {
                    savedDevice.lastConnected = new Date();
                    this.saveSavedDevices();
                }
                
                this.emit('connect', device);
                this.close();
                
                // Refresh the page to show the connected device
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                alert(`Failed to connect: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Failed to connect to device:', error);
            alert('Failed to connect to device. Please check the connection details.');
        }
    }

    private render(): void {
        const content = html`
            <div class="quick-connect-panel ${this.isOpen ? 'fade-in' : ''}" style="display: ${this.isOpen ? 'block' : 'none'}">
                <div class="quick-connect-header">
                    <h2 class="quick-connect-title">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                        Quick Connect
                    </h2>
                    <button class="btn btn-icon btn-secondary" onclick="QuickConnect.getInstance().close()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                
                <form class="quick-connect-form" onsubmit="return false;">
                    <div class="form-group">
                        <label class="form-label" for="device-name">Device Name</label>
                        <input 
                            type="text" 
                            id="device-name" 
                            class="form-input" 
                            placeholder="My Android Device"
                            required
                        />
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label" for="device-host">Host/IP Address</label>
                        <input 
                            type="text" 
                            id="device-host" 
                            class="form-input" 
                            placeholder="192.168.1.100 or localhost"
                            required
                        />
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label" for="device-port">Port</label>
                        <input 
                            type="number" 
                            id="device-port" 
                            class="form-input" 
                            placeholder="5555"
                            value="5555"
                            min="1"
                            max="65535"
                            required
                        />
                    </div>
                    
                    <div style="display: flex; gap: var(--spacing-sm);">
                        <button type="submit" class="btn btn-primary" style="flex: 1" onclick="QuickConnect.getInstance().handleConnect()">
                            Connect
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="QuickConnect.getInstance().handleSave()">
                            Save
                        </button>
                    </div>
                </form>
                
                ${this.savedDevices.length > 0 ? html`
                    <div class="saved-devices">
                        <div class="saved-devices-header">
                            <h3 class="saved-devices-title">Saved Devices</h3>
                        </div>
                        ${this.savedDevices.map(device => html`
                            <div class="saved-device-item">
                                <div class="saved-device-info">
                                    <div class="saved-device-name">${device.name}</div>
                                    <div class="saved-device-details">${device.host}:${device.port}</div>
                                </div>
                                <div class="saved-device-actions">
                                    <button 
                                        class="btn btn-icon btn-primary" 
                                        title="Connect"
                                        data-device-name="${device.name}"
                                        data-device-host="${device.host}"
                                        data-device-port="${device.port}"
                                        onclick="QuickConnect.getInstance().handleSavedDeviceConnect(this)"
                                    >
                                        <svg viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M8 5v14l11-7z"/>
                                        </svg>
                                    </button>
                                    <button 
                                        class="btn btn-icon btn-secondary" 
                                        title="Remove"
                                        onclick="QuickConnect.getInstance().removeSavedDevice('${device.id}')"
                                    >
                                        <svg viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `.content;

        this.container.innerHTML = '';
        this.container.appendChild(content.firstElementChild as HTMLElement);
    }

    public open(): void {
        this.isOpen = true;
        this.render();
    }

    public close(): void {
        this.isOpen = false;
        this.render();
    }

    public toggle(): void {
        this.isOpen = !this.isOpen;
        this.render();
    }

    public handleConnect(): void {
        const nameInput = this.container.querySelector('#device-name') as HTMLInputElement;
        const hostInput = this.container.querySelector('#device-host') as HTMLInputElement;
        const portInput = this.container.querySelector('#device-port') as HTMLInputElement;

        if (!nameInput.value || !hostInput.value || !portInput.value) {
            return;
        }

        this.connectToDevice({
            name: nameInput.value,
            host: hostInput.value,
            port: parseInt(portInput.value, 10)
        });
    }
    
    public handleSavedDeviceConnect(button: HTMLButtonElement): void {
        const name = button.getAttribute('data-device-name') || '';
        const host = button.getAttribute('data-device-host') || '';
        const port = parseInt(button.getAttribute('data-device-port') || '0', 10);
        
        if (name && host && port) {
            this.connectToDevice({ name, host, port });
        }
    }

    public handleSave(): void {
        const nameInput = this.container.querySelector('#device-name') as HTMLInputElement;
        const hostInput = this.container.querySelector('#device-host') as HTMLInputElement;
        const portInput = this.container.querySelector('#device-port') as HTMLInputElement;

        if (!nameInput.value || !hostInput.value || !portInput.value) {
            return;
        }

        this.addSavedDevice({
            name: nameInput.value,
            host: hostInput.value,
            port: parseInt(portInput.value, 10)
        });

        // Clear form
        nameInput.value = '';
        hostInput.value = '';
        portInput.value = '5555';
    }

    public getContainer(): HTMLElement {
        return this.container;
    }

    public mount(parent: HTMLElement): void {
        parent.appendChild(this.container);
    }

    public unmount(): void {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }
}

// Make QuickConnect available globally for onclick handlers
(window as any).QuickConnect = QuickConnect;