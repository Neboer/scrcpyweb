import '../../style/modern-ui.css';
import { html } from './HtmlTag';
import { TypedEmitter } from '../../common/TypedEmitter';
import { ConfirmDialog } from './ConfirmDialog';

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
            // Load from server's devices.json in working directory
            const response = await fetch('/api/devices');
            if (response.ok) {
                const devices = await response.json();
                this.savedDevices = devices || [];
            }
        } catch (error) {
            console.error('Failed to load devices:', error);
            this.savedDevices = [];
        }
        this.render();
    }


    public async removeSavedDevice(id: string): Promise<void> {
        const device = this.savedDevices.find(d => d.id === id);
        if (!device) return;
        
        ConfirmDialog.confirm({
            title: '删除设备',
            message: `确定要删除设备「${device.name}」吗？`,
            confirmText: '删除',
            cancelText: '取消',
            confirmClass: 'btn-primary',
            onConfirm: async () => {
                try {
                    const response = await fetch(`/api/devices/${id}`, {
                        method: 'DELETE'
                    });
                    if (response.ok) {
                        this.emit('removed', id);
                        // Reload devices
                        await this.loadSavedDevices();
                    } else {
                        alert('删除设备失败');
                    }
                } catch (error) {
                    console.error('Failed to remove device:', error);
                    alert('删除设备失败');
                }
            }
        });
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
                // Reload devices to get the updated list
                await this.loadSavedDevices();
                
                this.emit('connect', device);
                this.close();
                
                // Refresh the page to show the connected device
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                alert(`连接失败: ${result.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('Failed to connect to device:', error);
            alert('连接设备失败，请检查连接信息。');
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
                        快速连接
                    </h2>
                    <button class="btn btn-icon btn-secondary" onclick="QuickConnect.getInstance().close()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                
                <form class="quick-connect-form" onsubmit="return false;">
                    <div class="form-group">
                        <label class="form-label" for="device-name">设备名称</label>
                        <input 
                            type="text" 
                            id="device-name" 
                            class="form-input" 
                            placeholder="我的 Android 设备"
                            required
                        />
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label" for="device-host">主机/IP地址</label>
                        <input 
                            type="text" 
                            id="device-host" 
                            class="form-input" 
                            placeholder="192.168.1.100 或 localhost"
                            required
                        />
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label" for="device-port">端口</label>
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
                    
                    <button type="submit" class="btn btn-primary" style="width: 100%" onclick="QuickConnect.getInstance().handleConnect()">
                        连接
                    </button>
                </form>
                
                ${this.savedDevices.length > 0 ? html`
                    <div class="saved-devices">
                        <div class="saved-devices-header">
                            <h3 class="saved-devices-title">已保存的设备</h3>
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
                                        title="连接"
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
                                        title="删除"
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